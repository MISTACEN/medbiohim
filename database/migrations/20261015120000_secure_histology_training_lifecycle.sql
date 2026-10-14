BEGIN;

-- Private JSON sanitizer. Full snapshots (including keys) stay in owner-only rows;
-- this helper removes grading metadata from unanswered responses.
CREATE OR REPLACE FUNCTION public._histology_training_sanitize_json(
  p_value jsonb,
  p_hide_labels boolean,
  p_parent_key text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_key text;
  v_item jsonb;
  v_result jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;

  IF pg_catalog.jsonb_typeof(p_value) = 'object' THEN
    v_result := '{}'::jsonb;
    FOR v_key, v_item IN SELECT key, value FROM pg_catalog.jsonb_each(p_value) LOOP
      IF v_key = ANY (ARRAY[
        'correct','isCorrect','is_correct','explanation','answer',
        'correctAnswer','correct_answer','correctOption','correct_option',
        'correctOptionId','correct_option_id'
      ]::text[]) THEN
        CONTINUE;
      END IF;
      IF p_hide_labels AND p_parent_key = 'preparation'
         AND v_key = ANY (ARRAY['name','organ','captions']::text[]) THEN
        CONTINUE;
      END IF;
      v_result := v_result || pg_catalog.jsonb_build_object(
        v_key,
        public._histology_training_sanitize_json(v_item, p_hide_labels, v_key)
      );
    END LOOP;
    RETURN v_result;
  ELSIF pg_catalog.jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(public._histology_training_sanitize_json(value, p_hide_labels, p_parent_key)),
      '[]'::jsonb
    )
    INTO v_result
    FROM pg_catalog.jsonb_array_elements(p_value);
    RETURN v_result;
  END IF;

  RETURN p_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public._histology_training_review_snapshot(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'options', COALESCE(p_snapshot->'options', p_snapshot->'question'->'options', '[]'::jsonb),
    'preparation', COALESCE(p_snapshot->'preparation', '{}'::jsonb),
    'question', COALESCE(p_snapshot->'question', '{}'::jsonb),
    'explanation', p_snapshot->'question'->'explanation',
    'answer', p_snapshot->'question'->'answer'
  );
$function$;

CREATE OR REPLACE FUNCTION public._histology_training_normalize_answer(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.btrim(COALESCE(p_value, '')),
      '^[[:space:]]*([0-9]+[.)]|[[:alpha:]][.)])[[:space:]]*',
      '',
      'i'
    )),
    '[^[:alnum:]]',
    '',
    'g'
  );
$function$;

CREATE OR REPLACE FUNCTION public._histology_training_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_memberships AS gm
    JOIN public.groups AS g ON g.id = gm.group_id
    WHERE gm.user_id = auth.uid()
      AND gm.is_active = true
      AND g.is_active = true
      AND g.specialty_slug = 'mbh'
  );
$function$;

-- Create a complete histology training under the verified JWT identity.
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
  v_force boolean := COALESCE((p_input->>'force')::boolean, false);
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

  IF COALESCE((p_input->>'all_questions')::boolean, false) THEN
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
  ) AS selected;

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

CREATE OR REPLACE FUNCTION public.histology_training_get(p_training_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_training public.trainings%ROWTYPE;
  v_training_json jsonb;
  v_answers jsonb := '[]'::jsonb;
  v_answer record;
  v_is_answered boolean;
  v_hide_labels boolean;
  v_question_snapshot jsonb;
  v_options jsonb;
  v_review jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему'); END IF;
  IF NOT public._histology_training_has_access() THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Тренажёр доступен только специальности МБХ'); END IF;

  SELECT t.* INTO v_training
  FROM public.trainings AS t
  WHERE t.id = p_training_id AND t.user_id = v_user_id AND t.subject_slug = 'histology'
  LIMIT 1;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 404, 'code', 'NOT_FOUND', 'message', 'Тренировка не найдена'); END IF;

  v_hide_labels := v_training.label_mode <> 'with';
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', x.id,
      'question_id', x.question_id,
      'order', x."order",
      'user_answer', x.user_answer,
      'is_correct', x.is_correct,
      'is_skipped', x.is_skipped,
      'options', CASE WHEN (x.user_answer IS NOT NULL OR x.is_skipped)
                      THEN COALESCE(x.review_snapshot->'options', x.options)
                      ELSE public._histology_training_sanitize_json(x.options, v_hide_labels, 'options')
                 END,
      'question_snapshot', CASE WHEN (x.user_answer IS NOT NULL OR x.is_skipped)
                                THEN x.question_snapshot
                                ELSE public._histology_training_sanitize_json(x.question_snapshot, v_hide_labels, '')
                           END,
      'review_snapshot', CASE WHEN (x.user_answer IS NOT NULL OR x.is_skipped)
                              THEN x.review_snapshot ELSE '{}'::jsonb END,
      'answered_at', x.answered_at
    ) ORDER BY x."order"
  ), '[]'::jsonb)
  INTO v_answers
  FROM public.training_answers AS x
  WHERE x.training_id = v_training.id;

  SELECT pg_catalog.jsonb_build_object(
    'id', v_training.id,
    'topics', v_training.topics,
    'content_type', v_training.content_type,
    'question_count', v_training.question_count,
    'label_mode', v_training.label_mode,
    'layout_mode', v_training.layout_mode,
    'status', v_training.status,
    'current_index', v_training.current_index,
    'score', v_training.score,
    'total_questions', v_training.total_questions,
    'answered_count', (SELECT count(*) FROM public.training_answers x WHERE x.training_id = v_training.id AND (x.user_answer IS NOT NULL OR x.is_skipped)),
    'completed_at', v_training.completed_at,
    'created_at', v_training.created_at,
    'updated_at', v_training.updated_at
  )
  INTO v_training_json;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'data', pg_catalog.jsonb_build_object('training', v_training_json, 'answers', v_answers));
END;
$function$;

CREATE OR REPLACE FUNCTION public.histology_training_answer(
  p_training_id uuid,
  p_order integer,
  p_user_answer text DEFAULT NULL,
  p_is_skipped boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_training public.trainings%ROWTYPE;
  v_row public.training_answers%ROWTYPE;
  v_snapshot jsonb;
  v_question jsonb;
  v_preparation jsonb;
  v_options jsonb;
  v_option jsonb;
  v_option_found boolean := false;
  v_correct boolean := NULL;
  v_answer_text text := NULLIF(pg_catalog.btrim(COALESCE(p_user_answer, '')), '');
  v_captions jsonb;
  v_expected_parts text[];
  v_given_parts text[];
  v_expected_text text;
  v_tags jsonb;
  v_is_em boolean := false;
  v_answered_before boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему'); END IF;
  IF NOT public._histology_training_has_access() THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Тренажёр доступен только специальности МБХ'); END IF;
  IF p_training_id IS NULL OR p_order IS NULL OR p_order < 0 OR p_order > 499 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Некорректный номер вопроса');
  END IF;
  IF COALESCE(p_is_skipped, false) = false AND (v_answer_text IS NULL OR pg_catalog.length(v_answer_text) > 5000) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Введите ответ или пропустите вопрос');
  END IF;
  IF pg_catalog.length(COALESCE(p_user_answer,'')) > 5000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Ответ слишком длинный');
  END IF;

  SELECT t.* INTO v_training
  FROM public.trainings AS t
  WHERE t.id = p_training_id AND t.user_id = v_user_id AND t.subject_slug = 'histology'
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 404, 'code', 'NOT_FOUND', 'message', 'Тренировка не найдена'); END IF;
  IF v_training.status <> 'in_progress' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 409, 'code', 'TRAINING_NOT_ACTIVE', 'message', 'Тренировка уже завершена или отменена'); END IF;

  SELECT a.* INTO v_row
  FROM public.training_answers AS a
  WHERE a.training_id = v_training.id AND a."order" = p_order
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 404, 'code', 'QUESTION_NOT_FOUND', 'message', 'Вопрос не найден в этой тренировке'); END IF;

  v_answered_before := v_row.user_answer IS NOT NULL OR v_row.is_skipped;
  IF v_answered_before THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'data', pg_catalog.jsonb_build_object('answer', pg_catalog.jsonb_build_object('id', v_row.id, 'order', v_row."order", 'user_answer', v_row.user_answer, 'is_correct', v_row.is_correct, 'is_skipped', v_row.is_skipped), 'correct', v_row.is_correct, 'already_answered', true));
  END IF;

  v_snapshot := v_row.question_snapshot;
  v_question := COALESCE(v_snapshot->'question', '{}'::jsonb);
  v_preparation := COALESCE(v_snapshot->'preparation', '{}'::jsonb);
  v_options := CASE
    WHEN pg_catalog.jsonb_typeof(v_snapshot->'options') = 'array' THEN v_snapshot->'options'
    WHEN pg_catalog.jsonb_typeof(v_question->'options') = 'array' THEN v_question->'options'
    ELSE '[]'::jsonb
  END;
  v_tags := COALESCE(v_snapshot->'tags', '[]'::jsonb);
  v_is_em := lower(COALESCE(v_snapshot->>'mode_set','')) LIKE '%electron%'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_tags) AS tg(value)
      WHERE lower(tg.value) LIKE '%electron%' OR lower(tg.value) LIKE '%электронограм%'
    );

  IF COALESCE(p_is_skipped, false) THEN
    v_correct := NULL;
    v_answer_text := NULL;
  ELSIF v_training.label_mode = 'manual' OR pg_catalog.jsonb_array_length(v_options) = 0 THEN
    -- Free-text grading stays server-side. Electronogram captions are compared as an
    -- order-independent set after removing user-supplied numbering and punctuation.
    IF v_is_em AND pg_catalog.jsonb_typeof(v_preparation->'captions') = 'array'
       AND pg_catalog.jsonb_array_length(v_preparation->'captions') > 0 THEN
      SELECT pg_catalog.array_agg(n ORDER BY n)
        INTO v_expected_parts
        FROM (
          SELECT public._histology_training_normalize_answer(value) AS n
          FROM pg_catalog.jsonb_array_elements_text(v_preparation->'captions') AS t(value)
        ) q WHERE n <> '';
      SELECT pg_catalog.array_agg(n ORDER BY n)
        INTO v_given_parts
        FROM (
          SELECT public._histology_training_normalize_answer(part) AS n
          FROM pg_catalog.regexp_split_to_table(v_answer_text, E'[\n,;]+') AS t(part)
        ) q WHERE n <> '';
      v_correct := v_expected_parts IS NOT NULL AND v_given_parts IS NOT NULL AND v_expected_parts = v_given_parts;
    ELSE
      v_expected_text := NULLIF(pg_catalog.btrim(COALESCE(
        v_question->>'answer',
        v_question->>'correct_answer',
        v_preparation->>'name'
      )), '');
      IF v_expected_text IS NOT NULL THEN
        v_correct := public._histology_training_normalize_answer(v_answer_text) = public._histology_training_normalize_answer(v_expected_text);
      ELSE
        SELECT pg_catalog.string_agg(opt->>'label', ', ' ORDER BY opt->>'label')
          INTO v_expected_text
          FROM pg_catalog.jsonb_array_elements(v_options) AS t(opt)
          WHERE lower(COALESCE(opt->>'correct','false')) IN ('true','1','yes');
        IF v_expected_text IS NOT NULL THEN
          v_correct := public._histology_training_normalize_answer(v_answer_text) = public._histology_training_normalize_answer(v_expected_text);
        ELSE
          v_correct := NULL;
        END IF;
      END IF;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_options) AS t(opt)
      WHERE opt->>'id' = v_answer_text
    ) THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'INVALID_OPTION', 'message', 'Выбранный вариант ответа недоступен');
    END IF;
    SELECT lower(COALESCE(opt->>'correct','false')) IN ('true','1','yes')
      INTO v_correct
      FROM pg_catalog.jsonb_array_elements(v_options) AS t(opt)
      WHERE opt->>'id' = v_answer_text
      LIMIT 1;
  END IF;

  UPDATE public.training_answers
     SET user_answer = v_answer_text,
         is_correct = v_correct,
         is_skipped = COALESCE(p_is_skipped, false),
         answered_at = pg_catalog.now(),
         review_snapshot = public._histology_training_review_snapshot(v_snapshot)
   WHERE id = v_row.id;

  UPDATE public.trainings
     SET current_index = p_order,
         updated_at = pg_catalog.now()
   WHERE id = v_training.id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'answer', pg_catalog.jsonb_build_object('id', v_row.id, 'order', p_order, 'user_answer', v_answer_text, 'is_correct', v_correct, 'is_skipped', COALESCE(p_is_skipped, false)),
      'correct', v_correct,
      'already_answered', false
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.histology_training_complete(p_training_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_training public.trainings%ROWTYPE;
  v_total integer;
  v_correct integer;
  v_wrong integer;
  v_skipped integer;
  v_percent numeric;
  v_grade integer;
  v_training_json jsonb;
  v_stats jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему'); END IF;
  IF NOT public._histology_training_has_access() THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Тренажёр доступен только специальности МБХ'); END IF;

  SELECT t.* INTO v_training
  FROM public.trainings AS t
  WHERE t.id = p_training_id AND t.user_id = v_user_id AND t.subject_slug = 'histology'
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 404, 'code', 'NOT_FOUND', 'message', 'Тренировка не найдена'); END IF;

  IF v_training.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 409, 'code', 'TRAINING_NOT_ACTIVE', 'message', 'Отменённую тренировку нельзя завершить');
  END IF;

  IF v_training.status = 'in_progress' THEN
    UPDATE public.training_answers AS a
       SET is_skipped = true,
           answered_at = COALESCE(a.answered_at, pg_catalog.now()),
           review_snapshot = CASE WHEN a.user_answer IS NULL AND NOT a.is_skipped
             THEN public._histology_training_review_snapshot(a.question_snapshot)
             ELSE a.review_snapshot END
     WHERE a.training_id = v_training.id
       AND a.user_answer IS NULL
       AND a.is_skipped = false;

    UPDATE public.trainings
       SET status = 'completed',
           completed_at = pg_catalog.now(),
           updated_at = pg_catalog.now(),
           current_index = GREATEST(total_questions - 1, 0)
     WHERE id = v_training.id;
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE a.is_correct IS TRUE)::integer,
         count(*) FILTER (WHERE a.is_correct IS FALSE)::integer,
         count(*) FILTER (WHERE a.is_skipped = true OR a.user_answer IS NULL)::integer
    INTO v_total, v_correct, v_wrong, v_skipped
    FROM public.training_answers AS a
   WHERE a.training_id = v_training.id;
  v_percent := CASE WHEN v_total = 0 THEN 0 ELSE round(v_correct * 100.0 / v_total, 1) END;
  v_grade := CASE WHEN v_percent >= 90 THEN 5 WHEN v_percent >= 75 THEN 4 WHEN v_percent >= 60 THEN 3 ELSE 2 END;

  SELECT pg_catalog.jsonb_build_object(
    'id', t.id, 'topics', t.topics, 'content_type', t.content_type,
    'question_count', t.question_count, 'label_mode', t.label_mode, 'layout_mode', t.layout_mode,
    'status', t.status, 'current_index', t.current_index, 'score', v_percent,
    'total_questions', t.total_questions, 'answered_count', v_total - v_skipped,
    'completed_at', t.completed_at, 'created_at', t.created_at, 'updated_at', t.updated_at
  )
  INTO v_training_json
  FROM public.trainings AS t WHERE t.id = v_training.id;

  v_stats := pg_catalog.jsonb_build_object('total', v_total, 'correct', v_correct, 'wrong', v_wrong, 'skipped', v_skipped, 'percent', v_percent, 'grade', v_grade);
  RETURN pg_catalog.jsonb_build_object('ok', true, 'data', pg_catalog.jsonb_build_object('training', v_training_json, 'stats', v_stats));
END;
$function$;

CREATE OR REPLACE FUNCTION public.histology_training_cancel(p_training_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_training public.trainings%ROWTYPE;
  v_training_json jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему'); END IF;
  IF NOT public._histology_training_has_access() THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Тренажёр доступен только специальности МБХ'); END IF;

  SELECT t.* INTO v_training
  FROM public.trainings AS t
  WHERE t.id = p_training_id AND t.user_id = v_user_id AND t.subject_slug = 'histology'
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 404, 'code', 'NOT_FOUND', 'message', 'Тренировка не найдена'); END IF;
  IF v_training.status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 409, 'code', 'TRAINING_ALREADY_COMPLETED', 'message', 'Завершённую тренировку нельзя отменить');
  END IF;
  IF v_training.status = 'in_progress' THEN
    UPDATE public.trainings SET status = 'cancelled', updated_at = pg_catalog.now() WHERE id = v_training.id;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', t.id, 'topics', t.topics, 'content_type', t.content_type,
    'question_count', t.question_count, 'label_mode', t.label_mode, 'layout_mode', t.layout_mode,
    'status', t.status, 'current_index', t.current_index, 'score', t.score,
    'total_questions', t.total_questions, 'answered_count',
      (SELECT count(*) FROM public.training_answers a WHERE a.training_id=t.id AND (a.user_answer IS NOT NULL OR a.is_skipped)),
    'completed_at', t.completed_at, 'created_at', t.created_at, 'updated_at', t.updated_at
  )
  INTO v_training_json FROM public.trainings t WHERE t.id = v_training.id;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'data', pg_catalog.jsonb_build_object('training', v_training_json));
END;
$function$;

CREATE OR REPLACE FUNCTION public.histology_training_list(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему'); END IF;
  IF NOT public._histology_training_has_access() THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Тренажёр доступен только специальности МБХ'); END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('in_progress','completed','cancelled') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Недопустимый статус тренировки');
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', t.id, 'topics', t.topics, 'content_type', t.content_type,
      'question_count', t.question_count, 'label_mode', t.label_mode, 'layout_mode', t.layout_mode,
      'status', t.status, 'current_index', t.current_index, 'score', t.score,
      'total_questions', t.total_questions, 'answered_count',
        (SELECT count(*) FROM public.training_answers a WHERE a.training_id=t.id AND (a.user_answer IS NOT NULL OR a.is_skipped)),
      'completed_at', t.completed_at, 'created_at', t.created_at, 'updated_at', t.updated_at
    ) ORDER BY t.updated_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT t.* FROM public.trainings t
    WHERE t.user_id = v_user_id AND t.subject_slug = 'histology'
      AND (p_status IS NULL OR t.status = p_status)
    ORDER BY t.updated_at DESC
    LIMIT 50
  ) t;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'data', pg_catalog.jsonb_build_object('items', v_items));
END;
$function$;

-- These are the only public entry points for training lifecycle. They derive the
-- owner from auth.uid(); clients never get direct table access or answer keys early.
REVOKE ALL ON FUNCTION public._histology_training_sanitize_json(jsonb, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._histology_training_review_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._histology_training_normalize_answer(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._histology_training_has_access() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.histology_training_create(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.histology_training_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.histology_training_answer(uuid, integer, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.histology_training_complete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.histology_training_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.histology_training_list(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.histology_training_create(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.histology_training_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.histology_training_answer(uuid, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.histology_training_complete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.histology_training_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.histology_training_list(text) TO authenticated;

-- Reinforce the existing no-direct-access boundary.
REVOKE ALL ON TABLE public.trainings, public.training_answers FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
