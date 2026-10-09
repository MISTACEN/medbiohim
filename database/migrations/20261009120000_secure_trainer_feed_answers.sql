-- Secure trainer feed answer keys from the public Supabase Data API.
-- Public clients read only a safe view; answer scoring and persistence happen in one RPC.
BEGIN;

CREATE OR REPLACE VIEW public.trainer_feed_cards_public
WITH (security_barrier = true)
AS
SELECT
  c.id,
  c.subject_id,
  c.subject_slug,
  c.specialty_slug,
  c.mode_set,
  c.preparation,
  c.hotspots,
  CASE
    WHEN jsonb_typeof(c.question->'options') = 'array' THEN
      (c.question - ARRAY[
        'explanation', 'answer', 'correctAnswer', 'correct_answer',
        'correctOption', 'correct_option', 'correctOptionId', 'correct_option_id'
      ]::text[])
      || jsonb_build_object(
        'options',
        COALESCE(
          (
            SELECT jsonb_agg(opt.value - ARRAY['correct', 'isCorrect', 'is_correct']::text[] ORDER BY opt.ordinality)
            FROM jsonb_array_elements(c.question->'options') WITH ORDINALITY AS opt(value, ordinality)
          ),
          '[]'::jsonb
        )
      )
    ELSE
      c.question - ARRAY[
        'explanation', 'answer', 'correctAnswer', 'correct_answer',
        'correctOption', 'correct_option', 'correctOptionId', 'correct_option_id'
      ]::text[]
  END AS question,
  c.tags,
  c.difficulty,
  c.source_key,
  c.source_file_id,
  c.is_published,
  c.created_at,
  c.updated_at,
  c.plan_module_id,
  c.plan_topic_id,
  c.plan_status,
  tm.title AS plan_module_title,
  tt.title AS plan_topic_title
FROM public.trainer_feed_cards AS c
LEFT JOIN public.modules AS tm ON tm.id = c.plan_module_id
LEFT JOIN public.topics AS tt ON tt.id = c.plan_topic_id
WHERE c.is_published = true;

REVOKE ALL ON TABLE public.trainer_feed_cards FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_feed_cards_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trainer_feed_cards_public TO anon, authenticated;

-- Direct writes let clients forge is_correct. Keep reading own history via RLS,
-- but force all new answers through the trusted scoring function below.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.trainer_feed_answers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_trainer_feed_answer(
  p_card_id text,
  p_option_id text DEFAULT NULL,
  p_answer_text text DEFAULT NULL,
  p_is_skipped boolean DEFAULT false,
  p_time_ms integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
  v_question jsonb;
  v_options jsonb;
  v_option jsonb;
  v_option_found boolean := false;
  v_correct boolean := NULL;
  v_answer public.trainer_feed_answers%ROWTYPE;
  v_answer_text text;
  v_explanation text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_card_id IS NULL OR pg_catalog.btrim(p_card_id) = '' THEN
    RAISE EXCEPTION 'card_id required' USING ERRCODE = '22023';
  END IF;

  SELECT c.question
    INTO v_question
    FROM public.trainer_feed_cards AS c
   WHERE c.id = p_card_id
     AND c.is_published = true
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trainer card not found' USING ERRCODE = 'P0002';
  END IF;

  v_options := v_question->'options';
  v_answer_text := NULLIF(pg_catalog.btrim(COALESCE(p_answer_text, '')), '');
  v_explanation := v_question->>'explanation';

  IF COALESCE(p_is_skipped, false) THEN
    v_correct := NULL;
    v_answer_text := COALESCE(v_answer_text, NULLIF(pg_catalog.btrim(COALESCE(p_option_id, '')), ''));
  ELSIF CASE WHEN pg_catalog.jsonb_typeof(v_options) = 'array' THEN pg_catalog.jsonb_array_length(v_options) > 0 ELSE false END THEN
    IF p_option_id IS NULL OR pg_catalog.btrim(p_option_id) = '' THEN
      RAISE EXCEPTION 'option_id required' USING ERRCODE = '22023';
    END IF;

    FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_options)
    LOOP
      IF v_option->>'id' = p_option_id THEN
        v_option_found := true;
        v_correct := COALESCE((v_option->>'correct')::boolean, false);
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_option_found THEN
      RAISE EXCEPTION 'Invalid option_id' USING ERRCODE = '22023';
    END IF;
    v_answer_text := COALESCE(v_answer_text, p_option_id);
  ELSE
    -- Free-text questions have no option key to score here; preserve NULL correctness.
    v_correct := NULL;
  END IF;

  INSERT INTO public.trainer_feed_answers
    (user_id, card_id, option_id, answer_text, is_skipped, is_correct, time_ms)
  VALUES
    (v_user_id, p_card_id,
     CASE WHEN COALESCE(p_is_skipped, false) THEN NULL ELSE NULLIF(pg_catalog.btrim(COALESCE(p_option_id, '')), '') END,
     v_answer_text,
     COALESCE(p_is_skipped, false),
     v_correct,
     CASE WHEN p_time_ms IS NULL THEN NULL WHEN p_time_ms < 0 THEN 0 WHEN p_time_ms > 3600000 THEN 3600000 ELSE p_time_ms END)
  RETURNING * INTO v_answer;

  RETURN pg_catalog.jsonb_build_object(
    'answer', pg_catalog.to_jsonb(v_answer),
    'correct', v_correct,
    'explanation', CASE WHEN COALESCE(p_is_skipped, false) THEN NULL ELSE v_explanation END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_trainer_feed_answer(text, text, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_trainer_feed_answer(text, text, text, boolean, integer) TO authenticated;

COMMIT;
