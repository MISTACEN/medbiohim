BEGIN;

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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'code', 'UNAUTHORIZED', 'message', 'Требуется войти в систему');
  END IF;
  IF NOT public._histology_training_has_access() THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'code', 'FORBIDDEN', 'message', 'Тренажёр доступен только специальности МБХ');
  END IF;

  SELECT t.* INTO v_training
  FROM public.trainings AS t
  WHERE t.id = p_training_id AND t.user_id = v_user_id AND t.subject_slug = 'histology'
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 404, 'code', 'NOT_FOUND', 'message', 'Тренировка не найдена');
  END IF;
  IF v_training.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 409, 'code', 'TRAINING_NOT_ACTIVE', 'message', 'Отменённую тренировку нельзя завершить');
  END IF;

  IF v_training.status = 'in_progress' THEN
    UPDATE public.training_answers AS a
       SET is_skipped = true,
           answered_at = COALESCE(a.answered_at, pg_catalog.now()),
           review_snapshot = CASE
             WHEN a.user_answer IS NULL AND NOT a.is_skipped
             THEN public._histology_training_review_snapshot(a.question_snapshot)
             ELSE a.review_snapshot
           END
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

  -- Persist the computed percentage so session history and resumed views do not
  -- lose the result after the completion response is no longer in the browser.
  UPDATE public.trainings
     SET score = v_percent
   WHERE id = v_training.id AND user_id = v_user_id;

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
    'answered_count', v_total - v_skipped,
    'completed_at', t.completed_at,
    'created_at', t.created_at,
    'updated_at', t.updated_at
  )
  INTO v_training_json
  FROM public.trainings AS t
  WHERE t.id = v_training.id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'training', v_training_json,
      'stats', pg_catalog.jsonb_build_object(
        'total', v_total,
        'correct', v_correct,
        'wrong', v_wrong,
        'skipped', v_skipped,
        'percent', v_percent,
        'grade', v_grade
      )
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.histology_training_complete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.histology_training_complete(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
