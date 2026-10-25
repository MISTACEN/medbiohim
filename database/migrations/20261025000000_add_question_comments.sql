-- Комментарии к вопросам «Базы вопросов» (перенос фичи старого физического
-- портала: обсуждения под каждым вопросом). Модерация: автор может удалить
-- свой комментарий, админ — любой (через сервисный ключ).

create table if not exists public.question_comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists question_comments_question_idx
  on public.question_comments (question_id, created_at);

create index if not exists question_comments_user_idx
  on public.question_comments (user_id);

alter table public.question_comments enable row level security;

create policy "question_comments_select_auth"
  on public.question_comments
  for select
  to authenticated
  using (true);

create policy "question_comments_insert_own"
  on public.question_comments
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "question_comments_update_own"
  on public.question_comments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "question_comments_delete_own"
  on public.question_comments
  for delete
  to authenticated
  using (user_id = auth.uid());
