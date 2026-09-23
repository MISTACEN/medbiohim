ALTER TABLE public.telegram_messages
  ADD COLUMN IF NOT EXISTS telegram_media_group_id text;

CREATE INDEX IF NOT EXISTS telegram_messages_media_group_idx
  ON public.telegram_messages(telegram_chat_id, telegram_media_group_id);

COMMENT ON COLUMN public.telegram_messages.telegram_media_group_id IS 'Telegram media_group_id used to associate album items with the same homework.';
