-- Серия тренажёра собирается только из решаемых карточек.
--
-- Раньше histology_training_create брал любые опубликованные карточки, и в
-- серию попадали бонус-карточки без снимка и без вариантов ответа: изображение
-- отдавало 404, а задание нельзя было ответить (оно уходило в «пропуски»).
-- Теперь отбор требует и изображение (preparation.imageUrl|imagePath), и
-- непустой массив question.options.
--
-- Тело функции взято из 20261015120000_secure_histology_training_lifecycle.sql
-- без иных изменений: сигнатура, SECURITY DEFINER и поведение прежние,
-- добавлены только три условия в подзапрос отбора. Миграция аддитивная.
CREATE OR REPLACE FUNCTION public.histology_training_create(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_topics text[] := ARRAY[]::text[];
  v_card_ids text[] := ARRAY[]::text[];
  v_selected_ids text[] := ARRAY[]::text[];
  v_topic text;
  v_content_type text := COALESCE(p_input->>'content_type', 'all');
  v_label_mode text := COALESCE(p_input->>'label_mode', 'without');
  v_layout_mode text := COALESCE(p_input->>'layout_mode', 'top');
  v_requested_count integer := 20;
  v_limit integer := 20;
  v_force boolean := false;
  v_all_questions boolean := false;
  v_hide_labels boolean;
  v_training_id uuid;
  v_existing_id uuid;
  v_card_id text;
  v_card record;
  v_snapshot jsonb;
  v_options jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_selected_count integer := 0;
  v_training jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему');
  END IF;
  IF NOT public._histology_training_has_access() THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Тренажёр доступен только специальности МБХ');
  END IF;
  IF pg_catalog.jsonb_typeof(COALESCE(p_input, '{}'::jsonb)) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Некорректные настройки тренировки');
  END IF;
  IF p_input ? 'force' THEN
    IF lower(COALESCE(p_input->>'force', '')) NOT IN ('true', 'false') THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Некорректный признак force');
    END IF;
    v_force := COALESCE((p_input->>'force')::boolean, false);
  END IF;
  IF p_input ? 'all_questions' THEN
    IF lower(COALESCE(p_input->>'all_questions', '')) NOT IN ('true', 'false') THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Некорректный all_questions');
    END IF;
    v_all_questions := COALESCE((p_input->>'all_questions')::boolean, false);
  END IF;
  IF v_content_type NOT IN ('all','preparation','electronogram') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Недопустимый тип материалов');
  END IF;
  IF v_label_mode NOT IN ('with','without','manual') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Недопустимый режим подписей');
  END IF;
  IF v_layout_mode NOT IN ('sidebar','list','top') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Недопустимый режим отображения');
  END IF;
  IF p_input ? 'topics' AND pg_catalog.jsonb_typeof(p_input->'topics') <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Список тем должен быть массивом');
  END IF;
  IF p_input ? 'card_ids' AND pg_catalog.jsonb_typeof(p_input->'card_ids') <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Список карточек должен быть массивом');
  END IF;

  IF pg_catalog.jsonb_typeof(p_input->'topics') = 'array' THEN
    IF pg_catalog.jsonb_array_length(p_input->'topics') > 100 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Слишком много тем');
    END IF;
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.btrim(value)), ARRAY[]::text[])
      INTO v_topics
      FROM pg_catalog.jsonb_array_elements_text(p_input->'topics') AS t(value)
      WHERE pg_catalog.btrim(value) <> '';
  END IF;

  IF pg_catalog.jsonb_typeof(p_input->'card_ids') = 'array' THEN
    IF pg_catalog.jsonb_array_length(p_input->'card_ids') > 500 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Выбрано слишком много карточек');
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_input->'card_ids') AS t(value)
      WHERE pg_catalog.length(value) > 200 OR value ~ '[[:cntrl:]/\\?#]'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Список карточек содержит недопустимые идентификаторы');
    END IF;
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT value), ARRAY[]::text[])
      INTO v_card_ids
      FROM pg_catalog.jsonb_array_elements_text(p_input->'card_ids') AS t(value)
      WHERE pg_catalog.btrim(value) <> '';
  END IF;

  IF v_all_questions THEN
    v_requested_count := 500;
  ELSE
    BEGIN
      v_requested_count := COALESCE((p_input->>'question_count')::integer, 20);
    EXCEPTION WHEN OTHERS THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Некорректное количество вопросов');
    END;
  END IF;
  IF v_requested_count < 1 OR v_requested_count > 500 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Количество вопросов должно быть от 1 до 500');
  END IF;

  IF pg_catalog.cardinality(v_card_ids) > 0 THEN
    v_limit := pg_catalog.cardinality(v_card_ids);
  ELSE
    v_limit := v_requested_count;
  END IF;
  v_hide_labels := v_label_mode <> 'with';

  SELECT t.id INTO v_existing_id
  FROM public.trainings AS t
  WHERE t.user_id = v_user_id AND t.subject_slug = 'histology' AND t.status = 'in_progress'
  ORDER BY t.updated_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_existing_id IS NOT NULL AND NOT v_force THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'TRAINING_IN_PROGRESS',
      'message', 'У вас уже есть незавершённая тренировка',
      'existing_training_id', v_existing_id
    );
  END IF;
  IF v_existing_id IS NOT NULL AND v_force THEN
    UPDATE public.trainings
       SET status = 'cancelled', updated_at = pg_catalog.now()
     WHERE user_id = v_user_id AND subject_slug = 'histology' AND status = 'in_progress';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(c.id ORDER BY c.pick_order), ARRAY[]::text[])
    INTO v_selected_ids
  FROM (
    SELECT c.id,
           CASE WHEN pg_catalog.cardinality(v_card_ids) > 0
                THEN pg_catalog.array_position(v_card_ids, c.id)
                ELSE NULL
           END AS pick_order
    FROM public.trainer_feed_cards AS c
    LEFT JOIN public.modules AS m ON m.id = c.plan_module_id
    LEFT JOIN public.topics AS tp ON tp.id = c.plan_topic_id
    WHERE c.is_published = true
      -- Решаемая карточка: есть снимок и есть из чего выбирать ответ.
      AND COALESCE(
        NULLIF(pg_catalog.btrim(c.preparation->>'imageUrl'), ''),
        NULLIF(pg_catalog.btrim(c.preparation->>'imagePath'), '')
      ) IS NOT NULL
      AND pg_catalog.jsonb_typeof(c.question->'options') = 'array'
      AND pg_catalog.jsonb_array_length(c.question->'options') > 0
      AND (c.subject_slug = 'histology' OR lower(COALESCE(c.specialty_slug, '')) = 'mbh')
      AND (
        (pg_catalog.cardinality(v_card_ids) > 0 AND c.id = ANY(v_card_ids))
        OR
        (pg_catalog.cardinality(v_card_ids) = 0
          AND (v_content_type = 'all'
            OR (v_content_type = 'electronogram' AND (
              lower(COALESCE(c.mode_set,'')) LIKE '%electron%'
              OR EXISTS (
                SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(c.tags,'[]'::jsonb)) AS tg(value)
                WHERE lower(tg.value) LIKE '%electron%' OR lower(tg.value) LIKE '%электронограм%'
              )
            ))
            OR (v_content_type = 'preparation' AND NOT (
              lower(COALESCE(c.mode_set,'')) LIKE '%electron%'
              OR EXISTS (
                SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(c.tags,'[]'::jsonb)) AS tg(value)
                WHERE lower(tg.value) LIKE '%electron%' OR lower(tg.value) LIKE '%электронограм%'
              )
            )))
          AND (
            pg_catalog.cardinality(v_topics) = 0
            OR COALESCE(NULLIF(pg_catalog.btrim(tp.title), ''), NULLIF(pg_catalog.btrim(m.title), ''), NULLIF(c.tags->>0, ''), 'Без темы') = ANY(v_topics)
            OR EXISTS (
              SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(c.tags,'[]'::jsonb)) AS tg(value)
              WHERE tg.value = ANY(v_topics)
            )
          )
        )
      )
    ORDER BY
      CASE WHEN pg_catalog.cardinality(v_card_ids) > 0 THEN pg_catalog.array_position(v_card_ids, c.id) END NULLS LAST,
      CASE WHEN pg_catalog.cardinality(v_card_ids) = 0 THEN pg_catalog.random() END NULLS FIRST
    LIMIT v_limit
  ) AS c;

  IF pg_catalog.cardinality(v_card_ids) > 0 AND pg_catalog.cardinality(v_selected_ids) <> pg_catalog.cardinality(v_card_ids) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'CARD_SELECTION_UNAVAILABLE', 'message', 'Часть выбранных карточек больше недоступна; обновите атлас');
  END IF;
  v_selected_count := pg_catalog.cardinality(v_selected_ids);
  IF v_selected_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'NO_QUESTIONS', 'message', 'Для выбранных тем нет доступных карточек');
  END IF;

  INSERT INTO public.trainings (
    user_id, subject_slug, specialty_slug, topics, content_type, question_count,
    label_mode, layout_mode, status, question_ids, current_index, total_questions, updated_at
  )
  VALUES (
    v_user_id, 'histology', 'mbh', pg_catalog.to_jsonb(v_topics), v_content_type, v_selected_count,
    v_label_mode, v_layout_mode, 'in_progress', ARRAY[]::text[], 0, v_selected_count, pg_catalog.now()
  )
  RETURNING id INTO v_training_id;

  FOREACH v_card_id IN ARRAY v_selected_ids LOOP
    SELECT c.id, c.subject_slug, c.specialty_slug, c.mode_set, c.preparation, c.hotspots,
           c.question, c.tags, c.difficulty, c.source_key, c.plan_module_id, c.plan_topic_id,
           m.title AS plan_module_title, tp.title AS plan_topic_title
      INTO v_card
      FROM public.trainer_feed_cards AS c
      LEFT JOIN public.modules AS m ON m.id = c.plan_module_id
      LEFT JOIN public.topics AS tp ON tp.id = c.plan_topic_id
     WHERE c.id = v_card_id AND c.is_published = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Published trainer card disappeared during training creation';
    END IF;

    v_options := CASE
      WHEN pg_catalog.jsonb_typeof(v_card.question->'options') = 'array' THEN v_card.question->'options'
      ELSE '[]'::jsonb
    END;
    v_snapshot := pg_catalog.jsonb_build_object(
      'id', v_card.id,
      'mode_set', v_card.mode_set,
      'preparation', COALESCE(v_card.preparation, '{}'::jsonb),
      'question', COALESCE(v_card.question, '{}'::jsonb),
      'options', v_options,
      'hotspots', COALESCE(v_card.hotspots, '[]'::jsonb),
      'tags', COALESCE(v_card.tags, '[]'::jsonb),
      'difficulty', v_card.difficulty,
      'source_key', v_card.source_key,
      'plan_module_id', v_card.plan_module_id,
      'plan_topic_id', v_card.plan_topic_id,
      'plan_module_title', v_card.plan_module_title,
      'plan_topic_title', v_card.plan_topic_title
    );

    INSERT INTO public.training_answers (
      training_id, question_id, "order", user_answer, is_correct, is_skipped,
      options, question_snapshot, review_snapshot
    )
    VALUES (
      v_training_id, v_card.id,
      pg_catalog.array_position(v_selected_ids, v_card.id) - 1,
      NULL, NULL, false, v_options, v_snapshot, '{}'::jsonb
    );
    v_questions := v_questions || pg_catalog.jsonb_build_array(
      public._histology_training_sanitize_json(v_snapshot, v_hide_labels, '')
    );
  END LOOP;

  UPDATE public.trainings
     SET question_ids = v_selected_ids, updated_at = pg_catalog.now()
   WHERE id = v_training_id;

  SELECT pg_catalog.jsonb_build_object(
    'id', t.id,
    'topics', t.topics,
    'content_type', t.content_type,
    'question_count', t.question_count,
    'label_mode', t.label_mode,
    'layout_mode', t.layout_mode,
    'status', t.status,
    'current_index', t.current_index,
    'score', t.score,
    'total_questions', t.total_questions,
    'answered_count', 0,
    'created_at', t.created_at,
    'updated_at', t.updated_at
  )
  INTO v_training
  FROM public.trainings AS t
  WHERE t.id = v_training_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object('training', v_training, 'questions', v_questions)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.histology_training_create(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.histology_training_create(jsonb) TO authenticated;
