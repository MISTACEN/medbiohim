-- Hide per-question correctness while an attempt is in progress.
-- Results become readable only after the authoritative finish RPC changes status to submitted.
DROP POLICY IF EXISTS test_answers_own ON public.test_answers;
DROP POLICY IF EXISTS test_answers_owner_after_submit ON public.test_answers;
CREATE POLICY test_answers_owner_after_submit
  ON public.test_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.test_attempts a
       WHERE a.id = test_answers.attempt_id
         AND a.user_id = (SELECT auth.uid())
         AND a.status = 'submitted'
    )
  );

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

  -- Do not reveal correctness or feedback until the attempt is submitted.
  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'answer', jsonb_build_object(
        'id', v_answer.id,
        'attempt_id', v_answer.attempt_id,
        'question_id', v_answer.question_id,
        'answer_text', v_answer.answer_text,
        'saved', true
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
  v_answer_results jsonb := '[]'::jsonb;
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
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', a.id,
               'attempt_id', a.attempt_id,
               'question_id', a.question_id,
               'answer_text', a.answer_text,
               'is_correct', a.is_correct,
               'score', a.score,
               'grading_status', a.grading_status,
               'grading_source', a.grading_source,
               'grading_confidence', a.grading_confidence,
               'grading_feedback', a.grading_feedback,
               'feedback', a.grading_feedback,
               'graded_at', a.graded_at
             ) ORDER BY a.question_id
           ),
           '[]'::jsonb
         )
    INTO v_answer_results
    FROM public.test_answers a
   WHERE a.attempt_id = p_attempt_id;
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
        'answers', v_answer_results,
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

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', a.id,
               'attempt_id', a.attempt_id,
               'question_id', a.question_id,
               'answer_text', a.answer_text,
               'is_correct', a.is_correct,
               'score', a.score,
               'grading_status', a.grading_status,
               'grading_source', a.grading_source,
               'grading_confidence', a.grading_confidence,
               'grading_feedback', a.grading_feedback,
               'feedback', a.grading_feedback,
               'graded_at', a.graded_at
             ) ORDER BY a.question_id
           ),
           '[]'::jsonb
         )
    INTO v_answer_results
    FROM public.test_answers a
   WHERE a.attempt_id = p_attempt_id;
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
      'answers', v_answer_results,
        'source', 'supabase'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.medbiohim_save_test_answer(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.medbiohim_save_test_answer(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.medbiohim_finish_test_attempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.medbiohim_finish_test_attempt(uuid) TO authenticated;
