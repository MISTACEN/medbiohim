-- Telegram semantic classification + inline homework attachment metadata.
ALTER TABLE public.telegram_messages
  ADD COLUMN IF NOT EXISTS ai_reason text,
  ADD COLUMN IF NOT EXISTS ai_subject_hint text,
  ADD COLUMN IF NOT EXISTS ai_due_hint text,
  ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;

ALTER TABLE public.homework_attachments
  ADD COLUMN IF NOT EXISTS inline_view boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS telegram_messages_ai_processed_idx
  ON public.telegram_messages(ai_processed_at);

CREATE INDEX IF NOT EXISTS homework_attachments_inline_idx
  ON public.homework_attachments(homework_id, inline_view);

COMMENT ON COLUMN public.telegram_messages.ai_reason IS 'Semantic classifier explanation; never treated as academic source of truth.';
COMMENT ON COLUMN public.telegram_messages.ai_subject_hint IS 'LLM-extracted subject hint before matching against official schedule subjects.';
COMMENT ON COLUMN public.telegram_messages.ai_due_hint IS 'LLM-extracted due-date phrase; actual due_at is derived only from explicit text/date parsing.';
COMMENT ON COLUMN public.homework_attachments.inline_view IS 'True when the attachment can be rendered inline in the web UI (for example an image).';
