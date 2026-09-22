-- MEDBIOHIM persistent AI chat
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Новый чат',
  provider text not null default 'auto' check (provider in ('auto','gigachat','gemini')),
  model text,
  subject_slug text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  provider text,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_updated_idx on public.ai_conversations(user_id, updated_at desc);
create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id, created_at asc);
create index if not exists ai_messages_user_created_idx on public.ai_messages(user_id, created_at desc);
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
drop policy if exists "ai_conversations_owner_select" on public.ai_conversations;
drop policy if exists "ai_conversations_owner_insert" on public.ai_conversations;
drop policy if exists "ai_conversations_owner_update" on public.ai_conversations;
drop policy if exists "ai_conversations_owner_delete" on public.ai_conversations;
create policy "ai_conversations_owner_select" on public.ai_conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_conversations_owner_insert" on public.ai_conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_conversations_owner_update" on public.ai_conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ai_conversations_owner_delete" on public.ai_conversations for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "ai_messages_owner_select" on public.ai_messages;
drop policy if exists "ai_messages_owner_insert" on public.ai_messages;
drop policy if exists "ai_messages_owner_update" on public.ai_messages;
drop policy if exists "ai_messages_owner_delete" on public.ai_messages;
create policy "ai_messages_owner_select" on public.ai_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_messages_owner_insert" on public.ai_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_messages_owner_update" on public.ai_messages for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ai_messages_owner_delete" on public.ai_messages for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert, update, delete on public.ai_messages to authenticated;
grant all on public.ai_conversations to service_role;
grant all on public.ai_messages to service_role;
