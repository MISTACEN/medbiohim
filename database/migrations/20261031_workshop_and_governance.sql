-- 2026-10-31 · Workshop (публикация материалов) и роли быстрого реагирования.
--
-- Workshop — общий пул студенческих материалов: фотолекции, конспекты,
-- выгрузки вопросов. Публикация может идти автоматически (open) или через
-- очередь модератора (manual).
--
-- Governance — запросы старост, заявки на вступление, журнал быстрых фиксов с
-- откатом в течение 24 часов и уведомления вышестоящей роли.

-- ── Workshop ───────────────────────────────────────────────────────────────
create table if not exists public.workshop_settings (
  id boolean primary key default true,
  moderation_mode text not null default 'open' check (moderation_mode in ('open', 'manual')),
  personal_data_warning boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint workshop_settings_singleton check (id)
);
insert into public.workshop_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.workshop_items (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  topic text,
  title text not null,
  summary text,
  kind text not null default 'other' check (kind in ('photo_lecture', 'notes', 'test_questions', 'pdf', 'other')),
  tags text[] not null default '{}',
  status text not null default 'published' check (status in ('draft', 'pending', 'published', 'hidden', 'rejected', 'deleted')),
  previous_status text check (previous_status in ('draft', 'pending', 'published', 'rejected')),
  moderation_note text,
  personal_data_confirmed boolean not null default false,
  personal_data_flags text[] not null default '{}',
  version_no integer not null default 1,
  report_count integer not null default 0,
  downloads integer not null default 0,
  hidden_by uuid references public.users(id) on delete set null,
  hidden_until timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workshop_items_status_idx on public.workshop_items (status, created_at desc);
create index if not exists workshop_items_author_idx on public.workshop_items (author_id, created_at desc);
create index if not exists workshop_items_subject_idx on public.workshop_items (subject_id);
create index if not exists workshop_items_tags_idx on public.workshop_items using gin (tags);

create table if not exists public.workshop_item_files (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.workshop_items(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  object_key text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists workshop_item_files_item_idx on public.workshop_item_files (item_id, position);

create table if not exists public.workshop_item_questions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.workshop_items(id) on delete cascade,
  position integer not null default 0,
  text text not null,
  topic text,
  created_at timestamptz not null default now()
);
create index if not exists workshop_item_questions_item_idx on public.workshop_item_questions (item_id, position);

create table if not exists public.workshop_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.workshop_items(id) on delete cascade,
  version_no integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_id, version_no)
);

create table if not exists public.workshop_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.workshop_items(id) on delete cascade,
  reporter_user_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, reporter_user_id)
);
create index if not exists workshop_reports_status_idx on public.workshop_reports (status, created_at desc);

-- ── Governance ─────────────────────────────────────────────────────────────
alter table public.group_memberships add column if not exists subgroup text;
alter table public.groups add column if not exists stream text;
alter table public.topics add column if not exists archived_at timestamptz;

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  unique (group_id, user_id, status)
);
create index if not exists group_join_requests_group_idx on public.group_join_requests (group_id, status, created_at desc);

create table if not exists public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('course_change', 'admission_year_change', 'material_publish', 'role_change')),
  requester_id uuid not null references public.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists staff_requests_status_idx on public.staff_requests (status, created_at desc);
create index if not exists staff_requests_requester_idx on public.staff_requests (requester_id, created_at desc);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users(id) on delete cascade,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  before jsonb,
  after jsonb,
  reason text,
  revertible_until timestamptz not null default (now() + interval '24 hours'),
  reverted_at timestamptz,
  reverted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.workshop_settings enable row level security;
alter table public.workshop_items enable row level security;
alter table public.workshop_item_files enable row level security;
alter table public.workshop_item_questions enable row level security;
alter table public.workshop_item_versions enable row level security;
alter table public.workshop_reports enable row level security;
alter table public.group_join_requests enable row level security;
alter table public.staff_requests enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.notifications enable row level security;

drop policy if exists workshop_settings_read on public.workshop_settings;
create policy workshop_settings_read on public.workshop_settings
  for select to authenticated using (true);
drop policy if exists workshop_settings_admin_write on public.workshop_settings;
create policy workshop_settings_admin_write on public.workshop_settings
  for all to authenticated
  using (private.has_app_role((select auth.uid()), 'admin'))
  with check (private.has_app_role((select auth.uid()), 'admin'));

drop policy if exists workshop_items_read on public.workshop_items;
create policy workshop_items_read on public.workshop_items
  for select to authenticated
  using (
    status = 'published'
    or author_id = (select auth.uid())
    or private.has_app_role((select auth.uid()), 'moderator')
    or private.has_app_role((select auth.uid()), 'admin')
  );
drop policy if exists workshop_items_author_write on public.workshop_items;
create policy workshop_items_author_write on public.workshop_items
  for all to authenticated
  using (author_id = (select auth.uid()) or private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  with check (author_id = (select auth.uid()) or private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'));

drop policy if exists workshop_item_files_read on public.workshop_item_files;
create policy workshop_item_files_read on public.workshop_item_files
  for select to authenticated using (true);
drop policy if exists workshop_item_files_author_write on public.workshop_item_files;
create policy workshop_item_files_author_write on public.workshop_item_files
  for all to authenticated
  using (exists (
    select 1 from public.workshop_items wi
    where wi.id = workshop_item_files.item_id
      and (wi.author_id = (select auth.uid()) or private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  ))
  with check (exists (
    select 1 from public.workshop_items wi
    where wi.id = workshop_item_files.item_id
      and (wi.author_id = (select auth.uid()) or private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  ));
drop policy if exists workshop_item_questions_read on public.workshop_item_questions;
create policy workshop_item_questions_read on public.workshop_item_questions
  for select to authenticated using (true);
drop policy if exists workshop_item_questions_author_write on public.workshop_item_questions;
create policy workshop_item_questions_author_write on public.workshop_item_questions
  for all to authenticated
  using (exists (
    select 1 from public.workshop_items wi
    where wi.id = workshop_item_questions.item_id
      and (wi.author_id = (select auth.uid()) or private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  ))
  with check (exists (
    select 1 from public.workshop_items wi
    where wi.id = workshop_item_questions.item_id
      and (wi.author_id = (select auth.uid()) or private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  ));
drop policy if exists workshop_item_versions_author_write on public.workshop_item_versions;
create policy workshop_item_versions_author_write on public.workshop_item_versions
  for insert to authenticated
  with check (exists (
    select 1 from public.workshop_items wi
    where wi.id = workshop_item_versions.item_id
      and (wi.author_id = (select auth.uid()) or private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  ));

drop policy if exists workshop_item_versions_read on public.workshop_item_versions;
create policy workshop_item_versions_read on public.workshop_item_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.workshop_items wi
      where wi.id = workshop_item_versions.item_id
        and (
          wi.author_id = (select auth.uid())
          or private.has_app_role((select auth.uid()), 'moderator')
          or private.has_app_role((select auth.uid()), 'admin')
        )
    )
  );

drop policy if exists workshop_reports_insert_own on public.workshop_reports;
create policy workshop_reports_insert_own on public.workshop_reports
  for insert to authenticated with check (reporter_user_id = (select auth.uid()));
drop policy if exists workshop_reports_staff on public.workshop_reports;
create policy workshop_reports_staff on public.workshop_reports
  for all to authenticated
  using (private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  with check (private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'));

drop policy if exists group_join_requests_own on public.group_join_requests;
create policy group_join_requests_own on public.group_join_requests
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists group_join_requests_insert_own on public.group_join_requests;
create policy group_join_requests_insert_own on public.group_join_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists group_join_requests_starosta on public.group_join_requests;
create policy group_join_requests_starosta on public.group_join_requests
  for all to authenticated
  using (public.is_group_starosta(group_id) or private.has_app_role((select auth.uid()), 'admin'))
  with check (public.is_group_starosta(group_id) or private.has_app_role((select auth.uid()), 'admin'));

drop policy if exists staff_requests_own on public.staff_requests;
create policy staff_requests_own on public.staff_requests
  for select to authenticated using (requester_id = (select auth.uid()));
drop policy if exists staff_requests_insert_own on public.staff_requests;
create policy staff_requests_insert_own on public.staff_requests
  for insert to authenticated with check (requester_id = (select auth.uid()));
drop policy if exists staff_requests_admin on public.staff_requests;
create policy staff_requests_admin on public.staff_requests
  for all to authenticated
  using (private.has_app_role((select auth.uid()), 'admin'))
  with check (private.has_app_role((select auth.uid()), 'admin'));

drop policy if exists moderation_actions_staff_read on public.moderation_actions;
create policy moderation_actions_staff_read on public.moderation_actions
  for select to authenticated
  using (private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'));
drop policy if exists moderation_actions_staff_write on public.moderation_actions;
create policy moderation_actions_staff_write on public.moderation_actions
  for insert to authenticated
  with check (private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'));
drop policy if exists moderation_actions_staff_update on public.moderation_actions;
create policy moderation_actions_staff_update on public.moderation_actions
  for update to authenticated
  using (private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'))
  with check (private.has_app_role((select auth.uid()), 'moderator') or private.has_app_role((select auth.uid()), 'admin'));

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Supabase default privileges выдают anon полный набор прав на новые таблицы.
-- RLS и так не пропускает anon (политики только для authenticated), но доступ
-- к TRUNCATE и прочим операциям, не покрытым RLS, ему не нужен.
revoke all on public.workshop_settings from anon;
revoke all on public.workshop_items from anon;
revoke all on public.workshop_item_files from anon;
revoke all on public.workshop_item_questions from anon;
revoke all on public.workshop_item_versions from anon;
revoke all on public.workshop_reports from anon;
revoke all on public.group_join_requests from anon;
revoke all on public.staff_requests from anon;
revoke all on public.moderation_actions from anon;
revoke all on public.notifications from anon;

grant select, insert, update, delete on public.workshop_settings to authenticated;
grant select, insert, update, delete on public.workshop_items to authenticated;
grant select, insert, update, delete on public.workshop_item_files to authenticated;
grant select, insert, update, delete on public.workshop_item_questions to authenticated;
grant select, insert, update, delete on public.workshop_item_versions to authenticated;
grant select, insert, update, delete on public.workshop_reports to authenticated;
grant select, insert, update, delete on public.group_join_requests to authenticated;
grant select, insert, update, delete on public.staff_requests to authenticated;
grant select, insert, update on public.moderation_actions to authenticated;
grant select, update on public.notifications to authenticated;
