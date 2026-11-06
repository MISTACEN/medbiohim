-- Каталог преподавателя: владелец теста, видимость теста для преподавателей
-- и предметы, которые ведёт преподаватель.
--
-- Зачем:
--   * без `tests.created_by` автор не мог увидеть собственный черновик —
--     кабинет показывал только опубликованные тесты;
--   * `tests.teacher_visible` даёт администратору право решать, какие
--     опубликованные тесты вообще доступны преподавателям;
--   * `teacher_subjects` — связь многие-ко-многим: один преподаватель может
--     вести несколько предметов.
--
-- Миграция аддитивная: существующие тесты получают `created_by = null`
-- (автор неизвестен) и `teacher_visible = true`, поэтому текущий каталог
-- преподавателей не меняется.

alter table public.tests
  add column if not exists created_by uuid references public.users(id) on delete set null;

alter table public.tests
  add column if not exists teacher_visible boolean not null default true;

create index if not exists tests_created_by_idx on public.tests (created_by);
create index if not exists tests_teacher_visible_idx
  on public.tests (teacher_visible, subject_id)
  where is_published and archived_at is null;

create table if not exists public.teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint teacher_subjects_unique unique (teacher_id, subject_id)
);

create index if not exists teacher_subjects_teacher_idx on public.teacher_subjects (teacher_id);
create index if not exists teacher_subjects_subject_idx on public.teacher_subjects (subject_id);

alter table public.teacher_subjects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_subjects'
      and policyname = 'teacher_subjects_select_scope_v1'
  ) then
    create policy teacher_subjects_select_scope_v1 on public.teacher_subjects
      for select to authenticated
      using (
        teacher_id = (select auth.uid())
        or private.has_app_role((select auth.uid()), 'admin')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_subjects'
      and policyname = 'teacher_subjects_insert_admin_v1'
  ) then
    create policy teacher_subjects_insert_admin_v1 on public.teacher_subjects
      for insert to authenticated
      with check (private.has_app_role((select auth.uid()), 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_subjects'
      and policyname = 'teacher_subjects_update_admin_v1'
  ) then
    create policy teacher_subjects_update_admin_v1 on public.teacher_subjects
      for update to authenticated
      using (private.has_app_role((select auth.uid()), 'admin'))
      with check (private.has_app_role((select auth.uid()), 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_subjects'
      and policyname = 'teacher_subjects_delete_admin_v1'
  ) then
    create policy teacher_subjects_delete_admin_v1 on public.teacher_subjects
      for delete to authenticated
      using (private.has_app_role((select auth.uid()), 'admin'));
  end if;
end $$;

create or replace function private.teacher_subject_ids(p_teacher uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select subject_id from public.teacher_subjects where teacher_id = p_teacher;
$$;

revoke all on public.teacher_subjects from anon;
grant select, insert, update, delete on public.teacher_subjects to authenticated;
grant all on public.teacher_subjects to service_role;

revoke all on function private.teacher_subject_ids(uuid) from public;
grant execute on function private.teacher_subject_ids(uuid) to authenticated, service_role;

comment on column public.tests.created_by is
  'Автор теста. null — контент загружен до появления владельца (админский).';
comment on column public.tests.teacher_visible is
  'Разрешён ли опубликованный тест преподавателям. Свои тесты автор видит всегда.';
comment on table public.teacher_subjects is
  'Предметы преподавателя: один преподаватель может вести несколько предметов.';
