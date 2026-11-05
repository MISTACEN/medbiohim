-- Область преподавателя (план §10): кому именно преподаватель выставлен
-- преподавателем/куратором/ассистентом. Без этих записей роль teacher даёт
-- только авторские возможности, но не доступ к чужим группам и работам.
--
-- Миграция аддитивная: существующие таблицы не переписываются, RLS на
-- homeworks/homework_submissions не ужесточается (иначе преподаватели без
-- назначений потеряли бы доступ к своим текущим заданиям). Область проверяет
-- Worker, а RLS ограничивает прямой доступ клиента к назначениям.

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  student_id uuid references public.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  role text not null default 'teacher',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_assignments_exactly_one_target check (
    (group_id is not null and student_id is null)
    or (group_id is null and student_id is not null)
  ),
  constraint teacher_assignments_role_valid check (role in ('teacher', 'curator', 'assistant'))
);

-- Одна и та же область не дублируется; персональное назначение студенту
-- существует независимо от назначения на группу.
create unique index if not exists teacher_assignments_group_unique
  on public.teacher_assignments (teacher_id, group_id) where group_id is not null;
create unique index if not exists teacher_assignments_student_unique
  on public.teacher_assignments (teacher_id, student_id) where student_id is not null;
create index if not exists teacher_assignments_teacher_idx
  on public.teacher_assignments (teacher_id);
create index if not exists teacher_assignments_group_idx
  on public.teacher_assignments (group_id);
create index if not exists teacher_assignments_student_idx
  on public.teacher_assignments (student_id);

-- Явное назначение проверяющего на конкретное задание: перекрывает область
-- группы, когда работу ведёт другой преподаватель.
alter table public.homeworks
  add column if not exists assigned_teacher uuid references public.users(id) on delete set null;

alter table public.teacher_assignments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_assignments'
      and policyname = 'teacher_assignments_select_scope_v1'
  ) then
    create policy teacher_assignments_select_scope_v1 on public.teacher_assignments
      for select to authenticated
      using (
        teacher_id = (select auth.uid())
        or student_id = (select auth.uid())
        or private.has_app_role((select auth.uid()), 'admin')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_assignments'
      and policyname = 'teacher_assignments_insert_admin_v1'
  ) then
    create policy teacher_assignments_insert_admin_v1 on public.teacher_assignments
      for insert to authenticated
      with check (private.has_app_role((select auth.uid()), 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_assignments'
      and policyname = 'teacher_assignments_update_admin_v1'
  ) then
    create policy teacher_assignments_update_admin_v1 on public.teacher_assignments
      for update to authenticated
      using (private.has_app_role((select auth.uid()), 'admin'))
      with check (private.has_app_role((select auth.uid()), 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teacher_assignments'
      and policyname = 'teacher_assignments_delete_admin_v1'
  ) then
    create policy teacher_assignments_delete_admin_v1 on public.teacher_assignments
      for delete to authenticated
      using (private.has_app_role((select auth.uid()), 'admin'));
  end if;
end $$;

-- Хелперы для серверных проверок и будущих RLS-политик. security definer
-- нужен, чтобы проверка не зависела от RLS вызывающего.
create or replace function private.teacher_assigned_to_group(p_teacher uuid, p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teacher_assignments
    where teacher_id = p_teacher and group_id = p_group
  );
$$;

create or replace function private.teacher_assigned_to_student(p_teacher uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teacher_assignments
    where teacher_id = p_teacher and student_id = p_student
  );
$$;

create or replace function private.teacher_scope_group_ids(p_teacher uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select group_id from public.teacher_assignments
  where teacher_id = p_teacher and group_id is not null;
$$;

revoke all on public.teacher_assignments from anon;
grant select, insert, update, delete on public.teacher_assignments to authenticated;
grant all on public.teacher_assignments to service_role;

revoke all on function private.teacher_assigned_to_group(uuid, uuid) from public;
revoke all on function private.teacher_assigned_to_student(uuid, uuid) from public;
revoke all on function private.teacher_scope_group_ids(uuid) from public;
grant execute on function private.teacher_assigned_to_group(uuid, uuid) to authenticated, service_role;
grant execute on function private.teacher_assigned_to_student(uuid, uuid) to authenticated, service_role;
grant execute on function private.teacher_scope_group_ids(uuid) to authenticated, service_role;

comment on table public.teacher_assignments is
  'Назначения преподавателя: группа или отдельный студент (одно из двух). Управляет только admin.';
comment on column public.homeworks.assigned_teacher is
  'Явный проверяющий задания; перекрывает область группы для проверки работ.';
