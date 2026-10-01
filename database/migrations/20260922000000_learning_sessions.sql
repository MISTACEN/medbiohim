-- MEDBIOHIM: persistent learning sessions
-- Applied to Supabase project gnobvyjywtqbdfeejxmf on 2026-09-22.
create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null default 'practice',
  ref_id text,
  title text not null default 'Сессия',
  status text not null default 'in_progress' check (status in ('in_progress','finished','cancelled')),
  current_index integer not null default 0,
  answers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  score numeric,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.learning_sessions enable row level security;
drop policy if exists learning_sessions_select_own on public.learning_sessions;
drop policy if exists learning_sessions_insert_own on public.learning_sessions;
drop policy if exists learning_sessions_update_own on public.learning_sessions;
create policy learning_sessions_select_own on public.learning_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy learning_sessions_insert_own on public.learning_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy learning_sessions_update_own on public.learning_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists learning_sessions_user_updated_idx on public.learning_sessions(user_id, updated_at desc);
