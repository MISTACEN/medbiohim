-- 2026-10-28 · Личный трекер отработок и сданных тем («что сдано, что
-- отрабатывать»). Строка принадлежит студенту; чужие оценки не собираются
-- принципиально (см. обсуждение приватности: сервер хранит только «моё»).
-- Источник: manual — ручной ввод, csv — импорт строки из журнала/ведомости.

create table if not exists public.my_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  topic text not null,
  due_date date,
  status text not null default 'pending'
    check (status in ('passed', 'failed', 'pending', 'retake_needed')),
  grade text,
  note text,
  source text not null default 'manual' check (source in ('manual', 'csv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject, topic, due_date)
);

create index if not exists my_assignments_user_status_idx
  on public.my_assignments (user_id, status);

alter table public.my_assignments enable row level security;

drop policy if exists my_assignments_select_own on public.my_assignments;
create policy my_assignments_select_own
  on public.my_assignments
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists my_assignments_insert_own on public.my_assignments;
create policy my_assignments_insert_own
  on public.my_assignments
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists my_assignments_update_own on public.my_assignments;
create policy my_assignments_update_own
  on public.my_assignments
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists my_assignments_delete_own on public.my_assignments;
create policy my_assignments_delete_own
  on public.my_assignments
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.my_assignments to authenticated;
