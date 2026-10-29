-- MA10: атомарная сборка вариантов теста.
--
-- Проблема: конструктор в /admin/tests раньше собирал варианты на клиенте —
-- один POST на тест и по одному POST на каждый test_questions. Обрыв связи
-- посреди цикла оставлял «частичный успех»: тест без вопросов или вариант N
-- без варианта N+1. Попытка отката через adminContentArchive тоже была
-- отдельным запросом и сама могла не выполниться.
--
-- Решение: вся сборка вариантов — одна plpgsql-функция. PostgreSQL выполняет
-- её в одной транзакции: либо созданы все варианты со всеми ссылками на
-- вопросы, либо ничего. Функция сама проверяет роль (admin/moderator/teacher),
-- состав пула и перемешивает вопросы на сервере.
--
-- Идемпотентность: CREATE OR REPLACE FUNCTION + DO-блок для GRANT/REVOKE.
-- Миграцию можно применять повторно.

CREATE OR REPLACE FUNCTION public.medbiohim_build_test_variants(
  p_actor_id uuid,
  p_title text,
  p_subject_id uuid,
  p_question_ids uuid[],
  p_variants integer DEFAULT 1,
  p_per_test integer DEFAULT 10,
  p_description text DEFAULT NULL,
  p_module_id uuid DEFAULT NULL,
  p_topic_id uuid DEFAULT NULL,
  p_time_limit_sec integer DEFAULT NULL,
  p_max_attempts integer DEFAULT NULL,
  p_is_published boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_allowed boolean;
  v_unique_ids uuid[];
  v_eligible integer;
  v_variant integer;
  v_picked uuid[];
  v_test_id uuid;
  v_final_title text;
  v_created jsonb := '[]'::jsonb;
BEGIN
  -- 1. Роль вызывающего: те же роли, что и воркер-гейт /admin (MANAGERS).
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_actor_id
      AND lower(r.code) IN ('admin', 'moderator', 'teacher')
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'administrator role required' USING ERRCODE = '42501';
  END IF;

  -- 2. Валидация входа (ошибки = 22023, воркер маппит их в 422).
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid test title' USING ERRCODE = '22023';
  END IF;
  IF p_subject_id IS NULL THEN
    RAISE EXCEPTION 'subject is required' USING ERRCODE = '22023';
  END IF;
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL OR cardinality(p_question_ids) = 0 THEN
    RAISE EXCEPTION 'question pool is empty' USING ERRCODE = '22023';
  END IF;
  IF p_variants IS NULL OR p_variants NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'variants must be between 1 and 20' USING ERRCODE = '22023';
  END IF;
  IF p_per_test IS NULL OR p_per_test NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'questions per test must be between 1 and 200' USING ERRCODE = '22023';
  END IF;
  IF p_time_limit_sec IS NOT NULL AND p_time_limit_sec < 0 THEN
    RAISE EXCEPTION 'time limit must not be negative' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NOT NULL AND p_max_attempts < 0 THEN
    RAISE EXCEPTION 'max attempts must not be negative' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subjects s WHERE s.id = p_subject_id
  ) THEN
    RAISE EXCEPTION 'subject not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_module_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.modules m WHERE m.id = p_module_id AND m.subject_id = p_subject_id
  ) THEN
    RAISE EXCEPTION 'module does not belong to subject' USING ERRCODE = '22023';
  END IF;
  IF p_topic_id IS NOT NULL AND p_module_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.topics t WHERE t.id = p_topic_id AND t.module_id = p_module_id
  ) THEN
    RAISE EXCEPTION 'topic does not belong to module' USING ERRCODE = '22023';
  END IF;

  -- 3. Пул: убираем дубликаты, считаем только опубликованные неархивированные
  --    вопросы этого предмета. Меньше, чем нужно на вариант — честная ошибка.
  SELECT array_agg(DISTINCT qid ORDER BY qid)
    INTO v_unique_ids
    FROM unnest(p_question_ids) AS qid;

  SELECT count(*)
    INTO v_eligible
    FROM public.questions q
   WHERE q.id = ANY(v_unique_ids)
     AND q.is_published IS TRUE
     AND q.archived_at IS NULL
     AND q.subject_id = p_subject_id;

  IF v_eligible < p_per_test THEN
    RAISE EXCEPTION 'eligible question pool is too small: % available, % required', v_eligible, p_per_test
      USING ERRCODE = '22023';
  END IF;

  -- 4. Сборка: всё ниже — одна транзакция. Любое исключение откатывает
  --    уже созданные тесты и ссылки, частичного успеха не бывает.
  FOR v_variant IN 1..p_variants LOOP
    -- Свой случайный набор на каждый вариант (состав и порядок различаются).
    SELECT array_agg(id ORDER BY random())
      INTO v_picked
      FROM (
        SELECT q.id
        FROM public.questions q
        WHERE q.id = ANY(v_unique_ids)
          AND q.is_published IS TRUE
          AND q.archived_at IS NULL
          AND q.subject_id = p_subject_id
        ORDER BY random()
        LIMIT p_per_test
      ) picked;

    IF array_length(v_picked, 1) IS NULL OR cardinality(v_picked) <> p_per_test THEN
      RAISE EXCEPTION 'failed to assemble variant %', v_variant USING ERRCODE = '22023';
    END IF;

    v_final_title := CASE
      WHEN p_variants = 1 THEN btrim(p_title)
      ELSE btrim(p_title) || ' — Вариант ' || v_variant
    END;

    INSERT INTO public.tests(
      title, description, subject_id, module_id, topic_id,
      time_limit_sec, max_attempts, is_published
    ) VALUES (
      v_final_title,
      coalesce(nullif(btrim(coalesce(p_description, '')), ''),
               'Собран через конструктор тестов. Вопросов: ' || p_per_test ||
               '. Вариант: ' || v_variant || '/' || p_variants || '.'),
      p_subject_id, p_module_id, p_topic_id,
      p_time_limit_sec, p_max_attempts, coalesce(p_is_published, false)
    ) RETURNING id INTO v_test_id;

    INSERT INTO public.test_questions(test_id, question_id, order_index)
    SELECT v_test_id, qid, (row_number() OVER ()) - 1
    FROM unnest(v_picked) AS qid;
    IF (SELECT count(*) FROM public.test_questions tq WHERE tq.test_id = v_test_id) <> p_per_test THEN
      RAISE EXCEPTION 'failed to link questions for variant %', v_variant USING ERRCODE = '22023';
    END IF;

    v_created := v_created || jsonb_build_object(
      'id', v_test_id,
      'title', v_final_title,
      'variant', v_variant,
      'question_count', p_per_test
    );
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'variants', p_variants, 'questions_per_test', p_per_test);
END;
$function$;

-- Функция вызывается авторизованным воркером от имени пользователя с ролью
-- из admin/moderator/teacher; внутренняя проверка роли обязательна, потому что
-- SECURITY DEFINER поднимает права до владельца.
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.medbiohim_build_test_variants(uuid, text, uuid, uuid[], integer, integer, text, uuid, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.medbiohim_build_test_variants(uuid, text, uuid, uuid[], integer, integer, text, uuid, uuid, integer, integer, boolean) TO service_role, authenticated';
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- роль отсутствует в этой среде (например, локальная БД без service_role)
END $$;
