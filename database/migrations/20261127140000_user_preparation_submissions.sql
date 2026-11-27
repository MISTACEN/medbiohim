-- Свои препараты → общий атлас: предложение и модерация.
--
-- Личная карточка остаётся личной, пока владелец не отправит её в атлас.
-- Дальше решает админ: одобренная карточка превращается в обычную
-- trainer_feed_cards (публикуется) и появляется у всех, отклонённая — остаётся
-- у владельца с пояснением.
--
-- Статусы пишет только сервер (service-role): триггер откатывает попытку
-- пользователя подставить себе `approved` из браузера. RLS по владельцу и
-- политики чтения/записи из 20261125120000_user_preparations.sql не меняются.
BEGIN;

ALTER TABLE public.user_preparations
  ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS moderation_note text,
  ADD COLUMN IF NOT EXISTS published_card_id text;

COMMENT ON COLUMN public.user_preparations.submission_status IS
  'draft — личная; pending — отправлена в атлас; approved/rejected — решение админа.';
COMMENT ON COLUMN public.user_preparations.published_card_id IS
  'id карточки trainer_feed_cards, созданной при одобрении.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_preparations_submission_status_check'
  ) THEN
    ALTER TABLE public.user_preparations
      ADD CONSTRAINT user_preparations_submission_status_check
      CHECK (submission_status IN ('draft', 'pending', 'approved', 'rejected'));
  END IF;
END
$$;

-- Очередь модерации читается по статусу, а не по владельцу.
CREATE INDEX IF NOT EXISTS user_preparations_review_queue_idx
  ON public.user_preparations (submission_status, submitted_at DESC)
  WHERE submission_status IN ('pending', 'approved', 'rejected');

CREATE OR REPLACE FUNCTION public.user_preparations_guard_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Статус модерации — не пользовательское поле. Пишет его только воркер
  -- service-ключом, поэтому из клиентской сессии значения не меняются.
  IF coalesce(auth.role(), 'anon') <> 'service_role' THEN
    NEW.submission_status := OLD.submission_status;
    NEW.submitted_at := OLD.submitted_at;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.moderation_note := OLD.moderation_note;
    NEW.published_card_id := OLD.published_card_id;
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.user_preparations_guard_submission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_preparations_guard_submission ON public.user_preparations;
CREATE TRIGGER user_preparations_guard_submission
  BEFORE UPDATE ON public.user_preparations
  FOR EACH ROW
  EXECUTE FUNCTION public.user_preparations_guard_submission();

COMMIT;
