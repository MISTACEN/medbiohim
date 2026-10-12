-- Safe test-attempt API boundary for the Cloudflare Worker.
-- The public tables remain readable only through existing RLS and safe column grants.
-- Authoritative score/status transitions happen inside ownership-checked functions.

CREATE OR REPLACE FUNCTION public.medbiohim_normalize_answer(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(p_value, '')), 'ё—–−', 'е---'),
        '[[:punct:]«»„“”]+', ' ', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.medbiohim_normalize_answer(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.medbiohim_start_test_attempt(
  p_test_id uuid,
  p_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_group record;
  v_group_count integer := 0;
  v_test record;
  v_subject record;
  v_session record;
  v_snapshot jsonb := '[]'::jsonb;
  v_attempt public.test_attempts%ROWTYPE;
  v_subject_semester smallint;
  v_context_version text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему');
  END IF;
  IF p_test_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Нужен корректный ID теста');
  END IF;

  SELECT count(*)::integer
    INTO v_group_count
    FROM public.group_memberships gm
    JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = v_user_id
     AND gm.is_active = true
     AND g.is_active = true
     AND (p_group_id IS NULL OR gm.group_id = p_group_id);

  IF v_group_count = 0 THEN
    IF p_group_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'status', 403, 'code', 'GROUP_ACCESS_DENIED', 'message', 'Эта учебная группа вам не назначена');
    END IF;
    RETURN jsonb_build_object('ok', false, 'status', 422, 'code', 'NO_GROUP', 'message', 'Назначьте активную учебную группу, чтобы проходить тесты');
  END IF;

  IF p_group_id IS NULL AND v_group_count > 1 THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'code', 'GROUP_REQUIRED', 'message', 'Выберите учебную группу перед началом теста');
  END IF;

  SELECT g.id, g.name, g.code, g.course_number, g.specialty_slug
    INTO v_group
    FROM public.group_memberships gm
    JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = v_user_id
     AND gm.is_active = true
     AND g.is_active = true
     AND (p_group_id IS NULL OR gm.group_id = p_group_id)
   ORDER BY gm.joined_at DESC
   LIMIT 1;

  SELECT t.id, t.title, t.subject_id, t.module_id, t.topic_id, t.time_limit_sec, t.max_attempts
    INTO v_test
    FROM public.tests t
   WHERE t.id = p_test_id
     AND t.is_published = true
     AND t.archived_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'code', 'NOT_FOUND', 'message', 'Тест не найден или не опубликован');
  END IF;

  v_subject_semester := NULL;
  IF v_test.subject_id IS NOT NULL THEN
    SELECT s.id, s.name, s.specialty_slug, s.course_number, s.semester, s.is_active
      INTO v_subject
      FROM public.subjects s
     WHERE s.id = v_test.subject_id
     LIMIT 1;

    IF NOT FOUND OR v_subject.is_active = false THEN
      RETURN jsonb_build_object('ok', false, 'status', 404, 'code', 'SUBJECT_NOT_FOUND', 'message', 'Предмет не найден или недоступен');
    END IF;

    v_subject_semester := v_subject.semester;

    IF coalesce(v_subject.specialty_slug, '') <> ''
       AND coalesce(v_group.specialty_slug, '') <> ''
       AND lower(v_subject.specialty_slug) <> lower(v_group.specialty_slug)
       AND NOT (lower(v_group.specialty_slug) = 'mbh' AND lower(v_subject.specialty_slug) = 'histology') THEN
      RETURN jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Этот тест недоступен для вашей специальности');
    END IF;

    IF v_subject.course_number IS NOT NULL
       AND v_group.course_number IS NOT NULL
       AND v_subject.course_number <> v_group.course_number
       AND NOT EXISTS (
         SELECT 1
           FROM public.schedules sch
           JOIN public.schedule_entries se ON se.schedule_id = sch.id
          WHERE sch.group_id = v_group.id
            AND sch.is_active = true
            AND se.subject_id = v_subject.id
            AND coalesce(se.is_cancelled, false) = false
       ) THEN
      RETURN jsonb_build_object('ok', false, 'status', 403, 'code', 'INVALID_SUBJECT_CONTEXT', 'message', 'Предмет не относится к курсу выбранной группы');
    END IF;
  END IF;

  SELECT *
    INTO v_attempt
    FROM public.test_attempts a
   WHERE a.test_id = p_test_id
     AND a.user_id = v_user_id
     AND a.status = 'in_progress'
   ORDER BY a.started_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.group_id IS DISTINCT FROM v_group.id THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'code', 'CONTEXT_CHANGED', 'message', 'Активная попытка относится к другой учебной группе');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'attempt', jsonb_build_object(
          'id', v_attempt.id, 'test_id', v_attempt.test_id, 'user_id', v_attempt.user_id,
          'status', v_attempt.status::text, 'score', v_attempt.score, 'max_score', v_attempt.max_score,
          'percent', v_attempt.percent, 'started_at', v_attempt.started_at, 'finished_at', v_attempt.finished_at,
          'group_id', v_attempt.group_id, 'session_id', v_attempt.session_id,
          'context_version', v_attempt.context_version, 'source', 'db'
        ),
        'resumed', true,
        'source', 'supabase'
      )
    );
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', q.id::text,
               'subject_id', q.subject_id,
               'module_id', q.module_id,
               'topic_id', q.topic_id,
               'type', q.type::text,
               'text', coalesce(q.text, ''),
               'answer', q.answer,
               'options', coalesce(q.options, '[]'::jsonb)
             )
             ORDER BY tq.order_index ASC, q.id ASC
           ),
           '[]'::jsonb
         )
    INTO v_snapshot
    FROM public.test_questions tq
    JOIN public.questions q ON q.id = tq.question_id
   WHERE tq.test_id = p_test_id
     AND q.is_published = true
     AND q.archived_at IS NULL;

  IF jsonb_array_length(v_snapshot) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 422, 'code', 'NO_QUESTIONS', 'message', 'В тесте нет опубликованных вопросов');
  END IF;

  SELECT s.id, s.semester
    INTO v_session
    FROM public.academic_sessions s
   WHERE s.is_current = true
     AND (v_group.course_number IS NULL OR s.course_number IS NULL OR s.course_number = v_group.course_number)
     AND (v_subject_semester IS NULL OR s.semester IS NULL OR s.semester = v_subject_semester)
   ORDER BY s.start_date DESC NULLS LAST, s.created_at DESC
   LIMIT 1;

  v_context_version := concat_ws(
    ':',
    coalesce(v_session.id::text, '-'),
    '-',
    '-',
    coalesce(v_subject_semester::text, '-')
  );

  BEGIN
    INSERT INTO public.test_attempts (
      test_id, user_id, status, group_id, session_id, context_version, question_snapshot
    ) VALUES (
      p_test_id, v_user_id, 'in_progress', v_group.id, v_session.id, v_context_version, v_snapshot
    )
    RETURNING * INTO v_attempt;
  EXCEPTION WHEN unique_violation THEN
    SELECT *
      INTO v_attempt
      FROM public.test_attempts a
     WHERE a.test_id = p_test_id
       AND a.user_id = v_user_id
       AND a.status = 'in_progress'
     ORDER BY a.started_at DESC
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'code', 'ATTEMPT_CONFLICT', 'message', 'Не удалось создать попытку из-за параллельного запроса');
    END IF;
    IF v_attempt.group_id IS DISTINCT FROM v_group.id THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'code', 'CONTEXT_CHANGED', 'message', 'Активная попытка относится к другой учебной группе');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'attempt', jsonb_build_object(
          'id', v_attempt.id, 'test_id', v_attempt.test_id, 'user_id', v_attempt.user_id,
          'status', v_attempt.status::text, 'score', v_attempt.score, 'max_score', v_attempt.max_score,
          'percent', v_attempt.percent, 'started_at', v_attempt.started_at, 'finished_at', v_attempt.finished_at,
          'group_id', v_attempt.group_id, 'session_id', v_attempt.session_id,
          'context_version', v_attempt.context_version, 'source', 'db'
        ),
        'resumed', true,
        'source', 'supabase'
      )
    );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'attempt', jsonb_build_object(
        'id', v_attempt.id, 'test_id', v_attempt.test_id, 'user_id', v_attempt.user_id,
        'status', v_attempt.status::text, 'score', v_attempt.score, 'max_score', v_attempt.max_score,
        'percent', v_attempt.percent, 'started_at', v_attempt.started_at, 'finished_at', v_attempt.finished_at,
        'group_id', v_attempt.group_id, 'session_id', v_attempt.session_id,
        'context_version', v_attempt.context_version, 'source', 'db'
      ),
      'resumed', false,
      'source', 'supabase'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.medbiohim_save_test_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_answer_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt public.test_attempts%ROWTYPE;
  v_question jsonb;
  v_type text;
  v_reference text;
  v_clean text;
  v_correct_labels text[] := ARRAY[]::text[];
  v_given_labels text[] := ARRAY[]::text[];
  v_given_json jsonb;
  v_is_correct boolean := NULL;
  v_score numeric := 0;
  v_grading_status text := 'pending';
  v_grading_source text := 'pending';
  v_confidence numeric := NULL;
  v_feedback text := 'Ответ сохранён; требуется семантическая проверка.';
  v_answer public.test_answers%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему');
  END IF;
  IF p_attempt_id IS NULL OR p_question_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Нужен корректный ID попытки и вопроса');
  END IF;
  IF p_answer_text IS NOT NULL AND length(p_answer_text) > 20000 THEN
    RETURN jsonb_build_object('ok', false, 'status', 413, 'code', 'PAYLOAD_TOO_LARGE', 'message', 'Ответ слишком длинный');
  END IF;

  SELECT *
    INTO v_attempt
    FROM public.test_attempts a
   WHERE a.id = p_attempt_id
     AND a.user_id = v_user_id
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'code', 'ATTEMPT_NOT_FOUND', 'message', 'Попытка не найдена');
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'code', 'ATTEMPT_NOT_IN_PROGRESS', 'message', 'Попытка уже завершена');
  END IF;

  SELECT q.value
    INTO v_question
    FROM jsonb_array_elements(v_attempt.question_snapshot) AS q(value)
   WHERE q.value ->> 'id' = p_question_id::text
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 422, 'code', 'QUESTION_NOT_IN_ATTEMPT', 'message', 'Вопрос не входит в эту попытку');
  END IF;

  v_type := lower(coalesce(v_question ->> 'type', 'open'));
  v_reference := coalesce(v_question ->> 'answer', '');
  v_clean := btrim(coalesce(p_answer_text, ''));

  IF v_clean = '' THEN
    v_is_correct := false;
    v_score := 0;
    v_grading_status := 'deterministic';
    v_grading_source := 'deterministic';
    v_confidence := 1;
    v_feedback := 'Ответ не указан.';
  ELSIF v_type = 'mcq' THEN
    SELECT coalesce(array_agg(s.label ORDER BY s.label), ARRAY[]::text[])
      INTO v_correct_labels
      FROM (
        SELECT DISTINCT public.medbiohim_normalize_answer(opt.value ->> 'label') AS label
          FROM jsonb_array_elements(coalesce(v_question -> 'options', '[]'::jsonb)) AS opt(value)
         WHERE coalesce((opt.value ->> 'correct')::boolean, false) = true
           AND public.medbiohim_normalize_answer(opt.value ->> 'label') <> ''
      ) s;

    BEGIN
      IF left(v_clean, 1) = '[' THEN
        v_given_json := p_answer_text::jsonb;
      ELSE
        v_given_json := to_jsonb(p_answer_text);
      END IF;
    EXCEPTION WHEN others THEN
      v_given_json := to_jsonb(p_answer_text);
    END;

    IF jsonb_typeof(v_given_json) = 'array' THEN
      SELECT coalesce(array_agg(s.label ORDER BY s.label), ARRAY[]::text[])
        INTO v_given_labels
        FROM (
          SELECT DISTINCT public.medbiohim_normalize_answer(g.value) AS label
            FROM jsonb_array_elements_text(v_given_json) AS g(value)
           WHERE public.medbiohim_normalize_answer(g.value) <> ''
        ) s;
    ELSE
      IF public.medbiohim_normalize_answer(p_answer_text) <> '' THEN
        v_given_labels := ARRAY[public.medbiohim_normalize_answer(p_answer_text)];
      END IF;
    END IF;

    v_is_correct := cardinality(v_correct_labels) > 0
                    AND cardinality(v_given_labels) > 0
                    AND v_given_labels = v_correct_labels;
    v_score := CASE WHEN v_is_correct THEN 1 ELSE 0 END;
    v_grading_status := 'deterministic';
    v_grading_source := 'deterministic';
    v_confidence := 1;
    v_feedback := CASE WHEN v_is_correct THEN 'Ответ верный.' ELSE 'Ответ не совпадает с эталоном.' END;
  ELSIF v_reference <> ''
        AND public.medbiohim_normalize_answer(v_clean) = public.medbiohim_normalize_answer(v_reference) THEN
    v_is_correct := true;
    v_score := 1;
    v_grading_status := 'deterministic';
    v_grading_source := 'deterministic';
    v_confidence := 1;
    v_feedback := 'Ответ совпадает с эталоном.';
  ELSIF v_reference = '' THEN
    v_is_correct := NULL;
    v_score := 0;
    v_grading_status := 'pending';
    v_grading_source := 'pending';
    v_confidence := NULL;
    v_feedback := 'Для вопроса пока не задан эталонный ответ.';
  ELSE
    v_is_correct := NULL;
    v_score := 0;
    v_grading_status := 'error';
    v_grading_source := 'ai';
    v_confidence := NULL;
    v_feedback := 'Автоматическая проверка ответа временно недоступна. Ответ сохранён и будет проверен повторно.';
  END IF;

  INSERT INTO public.test_answers (
    attempt_id, question_id, answer_text, is_correct, score, grading_status,
    grading_source, grading_confidence, grading_feedback, grading_model, graded_at
  ) VALUES (
    p_attempt_id, p_question_id, p_answer_text, v_is_correct, v_score, v_grading_status,
    v_grading_source, v_confidence, v_feedback, NULL,
    CASE WHEN v_grading_status = 'deterministic' THEN now() ELSE NULL END
  )
  ON CONFLICT (attempt_id, question_id) DO UPDATE
     SET answer_text = EXCLUDED.answer_text,
         is_correct = EXCLUDED.is_correct,
         score = EXCLUDED.score,
         grading_status = EXCLUDED.grading_status,
         grading_source = EXCLUDED.grading_source,
         grading_confidence = EXCLUDED.grading_confidence,
         grading_feedback = EXCLUDED.grading_feedback,
         grading_model = EXCLUDED.grading_model,
         graded_at = EXCLUDED.graded_at
  RETURNING * INTO v_answer;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'answer', jsonb_build_object(
        'id', v_answer.id,
        'attempt_id', v_answer.attempt_id,
        'question_id', v_answer.question_id,
        'answer_text', v_answer.answer_text,
        'is_correct', v_answer.is_correct,
        'score', v_answer.score,
        'grading_status', v_answer.grading_status,
        'grading_source', v_answer.grading_source,
        'grading_confidence', v_answer.grading_confidence,
        'grading_feedback', v_answer.grading_feedback,
        'graded_at', v_answer.graded_at
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.medbiohim_finish_test_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt public.test_attempts%ROWTYPE;
  v_score numeric := 0;
  v_max_score numeric := 0;
  v_percent numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему');
  END IF;
  IF p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 422, 'code', 'VALIDATION_ERROR', 'message', 'Нужен корректный ID попытки');
  END IF;

  SELECT *
    INTO v_attempt
    FROM public.test_attempts a
   WHERE a.id = p_attempt_id
     AND a.user_id = v_user_id
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'code', 'NOT_FOUND', 'message', 'Попытка не найдена');
  END IF;

  IF v_attempt.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'attempt', jsonb_build_object(
          'id', v_attempt.id, 'test_id', v_attempt.test_id, 'user_id', v_attempt.user_id,
          'status', v_attempt.status::text, 'score', v_attempt.score, 'max_score', v_attempt.max_score,
          'percent', v_attempt.percent, 'started_at', v_attempt.started_at, 'finished_at', v_attempt.finished_at,
          'group_id', v_attempt.group_id, 'session_id', v_attempt.session_id,
          'context_version', v_attempt.context_version, 'source', 'db'
        ),
        'source', 'supabase'
      )
    );
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'code', 'ATTEMPT_ALREADY_FINISHED', 'message', 'Попытка уже завершена; изменять её результат нельзя');
  END IF;

  v_max_score := jsonb_array_length(coalesce(v_attempt.question_snapshot, '[]'::jsonb));
  SELECT coalesce(sum(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 0)
    INTO v_score
    FROM public.test_answers a
   WHERE a.attempt_id = p_attempt_id;

  v_percent := CASE WHEN v_max_score > 0 THEN round((v_score / v_max_score) * 100, 2) ELSE 0 END;

  UPDATE public.test_attempts a
     SET score = v_score,
         max_score = v_max_score,
         percent = v_percent,
         finished_at = now(),
         status = 'submitted'
   WHERE a.id = p_attempt_id
     AND a.user_id = v_user_id
     AND a.status = 'in_progress'
  RETURNING * INTO v_attempt;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'code', 'ATTEMPT_ALREADY_FINISHED', 'message', 'Попытка уже завершена; результат не изменён');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'attempt', jsonb_build_object(
        'id', v_attempt.id, 'test_id', v_attempt.test_id, 'user_id', v_attempt.user_id,
        'status', v_attempt.status::text, 'score', v_attempt.score, 'max_score', v_attempt.max_score,
        'percent', v_attempt.percent, 'started_at', v_attempt.started_at, 'finished_at', v_attempt.finished_at,
        'group_id', v_attempt.group_id, 'session_id', v_attempt.session_id,
        'context_version', v_attempt.context_version, 'source', 'db'
      ),
      'source', 'supabase'
    )
  );
END;
$function$;

-- Table ownership remains with postgres/service_role/PHP backend. The browser role
-- can read only safe columns and can write attempts/answers only through these RPCs.
REVOKE ALL PRIVILEGES ON TABLE public.test_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, test_id, user_id, status, score, max_score, percent, started_at, finished_at, group_id, session_id, context_version)
  ON TABLE public.test_attempts TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.test_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.test_answers TO authenticated;

REVOKE ALL ON FUNCTION public.medbiohim_start_test_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.medbiohim_save_test_answer(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.medbiohim_finish_test_attempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.medbiohim_start_test_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medbiohim_save_test_answer(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medbiohim_finish_test_attempt(uuid) TO authenticated;
