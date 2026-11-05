-- Централизованное управление доступом к разделам (концепция §5, Access Control).
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
