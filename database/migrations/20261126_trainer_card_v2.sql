-- MEDBIOHIM: карточка препарата v2 (приоритет 1, шаги 3–4 плана аудита).
--
-- Что добавляет:
--   1) архив вместо удаления — карточка скрывается из атласа, диагностикума,
--      повторения и публичного представления, история попыток остаётся;
--   2) дополнительные изображения одного препарата с подписями и указателями
--      (hotspots) — основная картинка по-прежнему в trainer_feed_cards.preparation,
--      её указатели — в существующей колонке trainer_feed_cards.hotspots;
--   3) чтение новых строк только для опубликованных неархивных карточек.
--
-- Миграция аддитивная: существующие строки, колонки и политики не меняются.
-- Применена к боевой базе 2026-11-26 после явного разрешения пользователя.
BEGIN;

-- 1. Архив ---------------------------------------------------------------

ALTER TABLE public.trainer_feed_cards
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.trainer_feed_cards.is_archived IS
  'Архивная карточка скрыта из атласа, диагностикума и повторения; попытки и связи сохраняются.';

CREATE INDEX IF NOT EXISTS trainer_feed_cards_archived_idx
  ON public.trainer_feed_cards (subject_slug, is_archived)
  WHERE is_archived;

-- 2. Дополнительные изображения -----------------------------------------

CREATE TABLE IF NOT EXISTS public.trainer_card_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id text NOT NULL REFERENCES public.trainer_feed_cards(id) ON DELETE CASCADE,
  object_key text,
  external_url text,
  caption text NOT NULL DEFAULT '',
  hotspots jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_card_images_source_check
    CHECK (num_nonnulls(object_key, external_url) = 1),
  CONSTRAINT trainer_card_images_external_url_check
    CHECK (external_url IS NULL OR external_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT trainer_card_images_hotspots_check
    CHECK (jsonb_typeof(hotspots) = 'array')
);

COMMENT ON TABLE public.trainer_card_images IS
  'Дополнительные изображения карточки препарата: ключ в Blob либо публичный https-URL, подпись и указатели.';

CREATE INDEX IF NOT EXISTS trainer_card_images_card_idx
  ON public.trainer_card_images (card_id, sort_order);

ALTER TABLE public.trainer_card_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trainer_card_images'
      AND policyname = 'trainer_card_images_public_select'
  ) THEN
    CREATE POLICY trainer_card_images_public_select ON public.trainer_card_images
      FOR SELECT TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.trainer_feed_cards c
          WHERE c.id = trainer_card_images.card_id
            AND c.is_published = true
            AND c.is_archived = false
        )
      );
  END IF;
END
$$;

-- Запись — только через service-role из trusted-маршрутов воркера.
REVOKE ALL ON TABLE public.trainer_card_images FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trainer_card_images TO anon, authenticated;
GRANT ALL ON TABLE public.trainer_card_images TO service_role;

-- 3. Публичное представление не отдаёт архивные карточки -----------------
-- Тело совпадает с 20261009120000_secure_trainer_feed_answers.sql плюс
-- `c.is_archived = false`; ссылки на ключи ответов по-прежнему вырезаны.

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
        'explanation', 'answer', 'correct', 'isCorrect', 'is_correct', 'correctAnswer', 'correct_answer',
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
        'explanation', 'answer', 'correct', 'isCorrect', 'is_correct', 'correctAnswer', 'correct_answer',
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
WHERE c.is_published = true
  AND c.is_archived = false
  AND (
    (c.subject_slug IS DISTINCT FROM 'histology' AND c.specialty_slug IS DISTINCT FROM 'mbh')
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.group_memberships AS gm
      JOIN public.groups AS g ON g.id = gm.group_id
      WHERE gm.user_id = auth.uid()
        AND gm.is_active = true
        AND g.is_active = true
        AND g.specialty_slug = 'mbh'
    )
  );

REVOKE ALL ON TABLE public.trainer_feed_cards_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trainer_feed_cards_public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;