-- Persist semantic/OCR context produced while processing Telegram homework.
ALTER TABLE public.telegram_messages
  ADD COLUMN IF NOT EXISTS ai_extracted_text text,
  ADD COLUMN IF NOT EXISTS ai_vision_provider text,
  ADD COLUMN IF NOT EXISTS ai_vision_model text;

COMMENT ON COLUMN public.telegram_messages.ai_extracted_text IS 'OCR/visual text extracted from an attached Telegram image; advisory metadata only.';
COMMENT ON COLUMN public.telegram_messages.ai_vision_provider IS 'Vision provider used for Telegram attachment analysis.';
COMMENT ON COLUMN public.telegram_messages.ai_vision_model IS 'Vision model used for Telegram attachment analysis.';
