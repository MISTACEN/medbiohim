-- 2026-10-30 · Прогресс студента по темам программы и связка занятий с темами.
--
-- Тема (topics) — центральная сущность предмета: к ней уже привязаны тесты
-- (tests.topic_id) и вопросы к экзамену (exam_questions.plan_topic_id). Здесь
-- добавляется личный статус «сдано / не сдано / отработка» и колонка для
-- привязки занятия расписания к теме.
--
-- Правила (см. план интеграции):
--  • прогресс приватный — RLS owner-only, никто кроме студента не читает;
--  • синхронизация плана и правки расписания никогда не перезаписывают
--    прогресс: таблицы независимы, связь расписания с темой — только
--    topic_id, без каскада на topic_progress.

create table if not exists public.topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'passed', 'failed', 'retake_needed')),
  grade text,
  note text,
  attempts int not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic_id)
);

create index if not exists topic_progress_user_status_idx
  on public.topic_progress (user_id, status);
create index if not exists topic_progress_topic_idx
  on public.topic_progress (topic_id);

alter table public.topic_progress enable row level security;

drop policy if exists topic_progress_select_own on public.topic_progress;
create policy topic_progress_select_own
  on public.topic_progress
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists topic_progress_insert_own on public.topic_progress;
create policy topic_progress_insert_own
  on public.topic_progress
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists topic_progress_update_own on public.topic_progress;
create policy topic_progress_update_own
  on public.topic_progress
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists topic_progress_delete_own on public.topic_progress;
create policy topic_progress_delete_own
  on public.topic_progress
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.topic_progress to authenticated;

-- Занятие расписания может ссылаться на тему программы (привязка задаётся
-- админкой/консолью БД; студент видит её в плане предмета). Прогресс не
-- каскадируется: set null при удалении темы только разрывает ссылку.
alter table public.schedule_entries
  add column if not exists topic_id uuid references public.topics(id) on delete set null;

create index if not exists schedule_entries_topic_idx
  on public.schedule_entries (topic_id);
