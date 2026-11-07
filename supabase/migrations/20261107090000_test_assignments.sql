-- Назначения тестов преподавателем (план кабинета 8.20–8.24).
--
-- Преподаватель назначает опубликованный тест назначенным ему группам или
-- отдельным студентам: дедлайн, лимит времени, число попыток, сколько
-- вопросов брать из банка и по каким темам. Вопросы не копируются: назначение
-- ссылается на существующий тест и существующий механизм попыток — второй
-- системы результатов не появляется.
--
-- Миграция аддитивная. RLS: преподаватель читает свои назначения, студент —
-- назначения своей группы/персональные; запись — только через Worker
-- (service_role), который проверяет область преподавателя.

create table if not exists public.test_assignments (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  due_at timestamptz,
  time_limit_sec int,
  max_attempts int,
  question_count int,
  topic_ids uuid[],
  instructions text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_assignments_positive check (
    (max_attempts is null or max_attempts >= 1)
    and (time_limit_sec is null or time_limit_sec >= 30)
    and (question_count is null or question_count >= 1)
  )
);

create table if not exists public.test_assignment_students (
  assignment_id uuid not null references public.test_assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  primary key (assignment_id, student_id)
);

create index if not exists test_assignments_teacher_idx
  on public.test_assignments (teacher_id);
create index if not exists test_assignments_group_idx
  on public.test_assignments (group_id);
create index if not exists test_assignments_test_idx
  on public.test_assignments (test_id);
create index if not exists test_assignment_students_student_idx
  on public.test_assignment_students (student_id);

alter table public.test_assignments enable row level security;
alter table public.test_assignment_students enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'test_assignments'
      and policyname = 'test_assignments_select_teacher_or_group_v1'
  ) then
    create policy test_assignments_select_teacher_or_group_v1 on public.test_assignments
      for select to authenticated
      using (
        teacher_id = (select auth.uid())
        or group_id in (
          select gm.group_id from public.group_memberships gm
          where gm.user_id = (select auth.uid()) and gm.is_active = true
        )
        or exists (
          select 1 from public.test_assignment_students s
          where s.assignment_id = test_assignments.id
            and s.student_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'test_assignment_students'
      and policyname = 'test_assignment_students_select_own_v1'
  ) then
    create policy test_assignment_students_select_own_v1 on public.test_assignment_students
      for select to authenticated
      using (
        student_id = (select auth.uid())
        or exists (
          select 1 from public.test_assignments ta
          where ta.id = test_assignment_students.assignment_id
            and ta.teacher_id = (select auth.uid())
        )
      );
  end if;
end $$;

revoke all on public.test_assignments from anon;
revoke all on public.test_assignment_students from anon;
grant select on public.test_assignments, public.test_assignment_students to authenticated;
grant all on public.test_assignments, public.test_assignment_students to service_role;

comment on table public.test_assignments is
  'Назначения тестов: группа + настройки прохождения. Пишет только Worker после проверки области преподавателя.';
comment on table public.test_assignment_students is
  'Персональные получатели назначения (дополнение к группе).';
