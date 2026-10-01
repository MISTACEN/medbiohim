-- Safe content management: archive + immutable version snapshots
alter table public.tests add column if not exists archived_at timestamptz;
alter table public.questions add column if not exists archived_at timestamptz;
create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_key jsonb not null,
  version_no integer not null,
  data jsonb not null,
  source text not null default 'admin_ui',
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(table_name,row_key,version_no)
);
alter table public.content_versions enable row level security;
drop policy if exists content_versions_admin_select on public.content_versions;
create policy content_versions_admin_select on public.content_versions
for select to authenticated using (
  exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id=ur.role_id
    where ur.user_id=auth.uid() and r.name='admin'
  )
);
