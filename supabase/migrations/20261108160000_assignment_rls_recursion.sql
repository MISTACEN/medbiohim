-- Фикс 42P17 (infinite recursion): политики test_assignments ↔
-- test_assignment_students ссылались друг на друга. Проверка выносится
-- в SECURITY DEFINER-функцию (паттерн is_starosta_of_group).
create schema if not exists private;

create or replace function private.can_read_test_assignment(a_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
  select exists (
    select 1 from public.test_assignment_students s
    where s.assignment_id = a_id and s.student_id = auth.uid()
  ) or exists (
    select 1 from public.test_assignments ta
    where ta.id = a_id and ta.teacher_id = auth.uid()
  ) or exists (
    select 1 from public.group_memberships gm
    where gm.user_id = auth.uid() and gm.is_active = true
      and gm.group_id = (select ta.group_id from public.test_assignments ta where ta.id = a_id)
  );
$$;

revoke all on function private.can_read_test_assignment(uuid) from public, anon;
grant execute on function private.can_read_test_assignment(uuid) to authenticated;

drop policy if exists test_assignments_select_teacher_or_group_v1 on public.test_assignments;
create policy test_assignments_select_teacher_or_group_v2 on public.test_assignments
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or private.can_read_test_assignment(id)
  );

drop policy if exists test_assignment_students_select_own_v1 on public.test_assignment_students;
create policy test_assignment_students_select_own_v2 on public.test_assignment_students
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.can_read_test_assignment(assignment_id)
  );
