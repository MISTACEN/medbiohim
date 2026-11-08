-- MEDBIOHIM Блок 8:
-- 1) Инвайт-ссылки в группы с подтверждением старостой (ЭТАП 3).
-- 2) Тревожная кнопка (SOS): быстрые сообщения студентов админу.

-- Инвайт-ссылки: токен в URL /invite/<token>, создаёт администратор.
create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token text not null unique,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  max_uses integer,
  uses integer not null default 0
);

-- Заявки на вступление: студент жмёт по ссылке, староста подтверждает.
create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  invite_id uuid references public.group_invites(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  unique (group_id, user_id)
);

create index if not exists group_join_requests_group_status_idx
  on public.group_join_requests (group_id, status);

alter table public.group_invites enable row level security;
alter table public.group_join_requests enable row level security;

-- Чтение инвайтов: все аутентифицированные (нужно для страницы /invite/:token).
drop policy if exists group_invites_read on public.group_invites;
create policy group_invites_read on public.group_invites
  for select to authenticated using (true);

-- Заявку видит автор, староста группы и админ; создаёт — только автор.
-- Админ определяется через user_roles/roles (таблицы ролей проекта).
drop policy if exists group_join_requests_read_own on public.group_join_requests;
create policy group_join_requests_read_own on public.group_join_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_starosta_of_group(group_id)
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

drop policy if exists group_join_requests_insert_own on public.group_join_requests;
create policy group_join_requests_insert_own on public.group_join_requests
  for insert to authenticated with check (user_id = auth.uid());

-- Решение по заявке принимает староста/админ (worker пишет service-клиентом).

-- Тревожная кнопка: студент отправляет, админ читает и закрывает.
create table if not exists public.sos_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  message text not null check (length(message) <= 2000),
  page_url text,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  closed_by uuid references public.users(id) on delete set null,
  closed_at timestamptz
);

create index if not exists sos_reports_status_created_idx
  on public.sos_reports (status, created_at desc);

alter table public.sos_reports enable row level security;

drop policy if exists sos_reports_insert_own on public.sos_reports;
create policy sos_reports_insert_own on public.sos_reports
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists sos_reports_read_own on public.sos_reports;
create policy sos_reports_read_own on public.sos_reports
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );
