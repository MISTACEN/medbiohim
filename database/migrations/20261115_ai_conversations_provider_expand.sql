-- Полный список провайдеров для ai_conversations.provider.
-- Предыдущие расширения: 20261013141533 (auto/gigachat/gemini → groq/mistral/openrouter),
-- 20261115_user_ai_configs (custom). Добавляем openai, чтобы выбор модели
-- в тьюторе сохранял провайдер, а не молча сбрасывал его на «Авто».
alter table public.ai_conversations
  drop constraint if exists ai_conversations_provider_check;

alter table public.ai_conversations
  add constraint ai_conversations_provider_check
  check (provider in ('auto','openai','groq','gigachat','gemini','mistral','openrouter','custom'));
