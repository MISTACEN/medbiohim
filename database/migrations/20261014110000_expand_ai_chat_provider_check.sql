-- Keep the persistent AI chat provider constraint aligned with AiChatService::normalizeProvider().
-- This is additive: existing values remain valid and the supported provider set expands.
ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_provider_check;

ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_provider_check
  CHECK (provider IN ('auto', 'groq', 'gigachat', 'gemini', 'mistral', 'openrouter'));
