-- BYOM: пользовательская ИИ-модель (OpenAI-compatible или Claude/Anthropic).
-- API-ключ шифруется на воркере (AES-GCM-256 секретом USER_KEY_ENCRYPTION_KEY)
-- и хранится в виде base64(iv || ciphertext); никогда не возвращается клиенту.
create table if not exists public.user_ai_configs (
  user_id uuid primary key references public.users(id) on delete cascade,
  provider text not null check (provider in ('openai_compatible','anthropic')),
  base_url text not null,
  model text not null,
  api_key_encrypted text not null,
  key_hint text not null default '',
  prefer_own boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_configs enable row level security;

create policy user_ai_configs_owner_all on public.user_ai_configs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Расширяем CHECK провайдера диалогов: кастомная модель пользователя.
alter table public.ai_conversations
  drop constraint if exists ai_conversations_provider_check;
alter table public.ai_conversations
  add constraint ai_conversations_provider_check
  check (provider in ('auto','groq','gigachat','gemini','mistral','openrouter','custom'));
