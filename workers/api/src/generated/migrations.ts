/**
 * СГЕНЕРИРОВАНО: tools/generate-migrations-ts.mjs — не править вручную.
 * Источник: supabase/migrations. Регенерировать после изменения миграций:
 * node tools/generate-migrations-ts.mjs
 */

export const TEACHER_ASSIGNMENTS_SQL = `-- Область преподавателя (план §10): кому именно преподаватель выставлен
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
`;

export const MODULE_ACCESS_SQL = `-- Централизованное управление доступом к разделам (концепция §5, Access Control).
--
-- Принципы:
--  * реестр разделов (app_modules) с режимом по умолчанию: open — раздел виден
--    всем авторизованным, restricted — только выданным разрешениям;
--  * индивидуальные (user_module_access) и групповые (group_module_access)
--    разрешения: allow/deny, срок действия, автор выдачи;
--  * запрет сильнее разрешения: deny перекрывает allow любого уровня;
--  * по умолчанию все существующие разделы open — текущие пользователи ничего
--    не теряют; администратор переводит раздел в restricted, когда готов;
--    новые разделы создаются restricted;
--  * журнал выдачи/отзыва прав (access_audit_log);
--  * RLS: пользователь читает только свои строки и реестр разделов. Эффективный
--    доступ вычисляет Worker (service client), поэтому клиент не получает
--    каталог чужих прав и групповых разрешений.
--
-- Миграция аддитивная: существующие таблицы не изменяются.

create table if not exists public.app_modules (
  key text primary key,
  title text not null,
  sort_order int not null default 100,
  default_mode text not null default 'restricted'
    check (default_mode in ('open', 'restricted')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Текущая навигация MEDBIOHIM: существующие разделы стартуют открытыми,
-- чтобы миграция не меняла поведение действующих пользователей.
insert into public.app_modules (key, title, sort_order, default_mode) values
  ('schedule',     'Расписание',        10, 'open'),
  ('subjects',     'Предметы',          20, 'open'),
  ('progress',     'Прогресс',          30, 'open'),
  ('community',    'Сообщество',        40, 'open'),
  ('search',       'Поиск',             50, 'open'),
  ('library',      'Библиотека',        60, 'open'),
  ('university',   'Вуз и ЕИОС',        70, 'open'),
  ('atlas',        'Атлас',             80, 'open'),
  ('workshop',     'Мастерская',        90, 'open'),
  ('academic',     'Учебный план',     100, 'open'),
  ('assignments',  'Отработки',        110, 'open'),
  ('calculators',  'Калькуляторы',     120, 'open'),
  ('attestations', 'Аттестации',       130, 'open'),
  ('tutor',        'AI-тьютор',        140, 'open'),
  ('group',        'Кабинет старосты', 150, 'open')
on conflict (key) do nothing;

create table if not exists public.user_module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  module_key text not null references public.app_modules(key) on delete cascade,
  mode text not null check (mode in ('allow', 'deny')),
  expires_at timestamptz,
  note text,
  granted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_module_access_unique unique (user_id, module_key)
);

create table if not exists public.group_module_access (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  module_key text not null references public.app_modules(key) on delete cascade,
  mode text not null check (mode in ('allow', 'deny')),
  expires_at timestamptz,
  note text,
  granted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_module_access_unique unique (group_id, module_key)
);

create table if not exists public.access_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('grant', 'revoke', 'set_default', 'toggle_active')),
  scope text not null check (scope in ('user', 'group', 'module')),
  target text,
  module_key text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists access_audit_log_created_idx
  on public.access_audit_log (created_at desc);
create index if not exists user_module_access_user_idx
  on public.user_module_access (user_id);
create index if not exists group_module_access_group_idx
  on public.group_module_access (group_id);

alter table public.app_modules enable row level security;
alter table public.user_module_access enable row level security;
alter table public.group_module_access enable row level security;
alter table public.access_audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_modules'
      and policyname = 'app_modules_select_authenticated_v1'
  ) then
    create policy app_modules_select_authenticated_v1 on public.app_modules
      for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_module_access'
      and policyname = 'user_module_access_select_own_v1'
  ) then
    create policy user_module_access_select_own_v1 on public.user_module_access
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;

  -- Запись/правка доступов и журнал — только через Worker (service_role).
  -- Прямой записи из клиента нет ни у одной роли.
end $$;

revoke all on public.app_modules from anon;
grant select on public.app_modules to authenticated;

revoke all on public.user_module_access from anon;
grant select on public.user_module_access to authenticated;

revoke all on public.group_module_access from anon, authenticated;
revoke all on public.access_audit_log from anon, authenticated;

grant all on public.app_modules, public.user_module_access,
  public.group_module_access, public.access_audit_log to service_role;

comment on table public.app_modules is
  'Реестр разделов платформы: default_mode open = виден всем, restricted = только выданным разрешениям. Пишет только service_role.';
comment on table public.user_module_access is
  'Индивидуальные разрешения на разделы: allow/deny с сроком действия. Запись только через Worker.';
comment on table public.group_module_access is
  'Групповые разрешения на разделы. Клиент не читает: доступ вычисляет Worker.';
comment on table public.access_audit_log is
  'Журнал выдачи/отзыва прав на разделы и смены режимов.';
`;

export const TEST_ASSIGNMENTS_SQL = `-- Назначения тестов преподавателем (план кабинета 8.20–8.24).
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
`;

export const TEACHER_CATALOG_SQL = `-- Каталог преподавателя: владелец теста, видимость теста для преподавателей
-- и предметы, которые ведёт преподаватель.
--
-- Зачем:
--   * без \`tests.created_by\` автор не мог увидеть собственный черновик —
--     кабинет показывал только опубликованные тесты;
--   * \`tests.teacher_visible\` даёт администратору право решать, какие
--     опубликованные тесты вообще доступны преподавателям;
--   * \`teacher_subjects\` — связь многие-ко-многим: один преподаватель может
--     вести несколько предметов.
--
-- Миграция аддитивная: существующие тесты получают \`created_by = null\`
-- (автор неизвестен) и \`teacher_visible = true\`, поэтому текущий каталог
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
`;

export const RESULT_DETAIL_SQL = `-- Настраиваемая детализация результатов (кабинет, уровни 1–4 из ТЗ).
--
-- Администратор задаёт максимальный уровень преподавателю на каждое назначение
-- группы (teacher_assignments.detail_level):
--   1 — только статистика (оценки, проценты, средние);
--   2 — статистика + ответы студентов;
--   3 — дополнительно эталоны, ошибки и комментарии;
--   4 — полный отчёт: история попыток, аналитика, экспорт.
-- Уровень ниже 3 скрывает разбор ответов в карточке студента; экспорт
-- разрешён только с уровнем 4.
--
-- Миграция аддитивная; всем текущим назначениям ставится максимум (4),
-- существующее поведение не меняется.

alter table public.teacher_assignments
  add column if not exists detail_level int not null default 4
  check (detail_level between 1 and 4);

comment on column public.teacher_assignments.detail_level is
  'Максимальный уровень детализации результатов: 1 статистика, 2 ответы, 3 разбор, 4 полный отчёт и экспорт. Меняет только администратор.';
`;

