create table if not exists public.admin_change_log (
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid references auth.users(id) on delete set null,
 action text not null check (action in ('insert','update','delete','import','move')),
 table_name text not null,
 row_key jsonb not null default '{}'::jsonb,
 old_data jsonb,
 new_data jsonb,
 source text not null default 'admin_ui',
 created_at timestamptz not null default now()
);
create index if not exists admin_change_log_created_at_idx on public.admin_change_log(created_at desc);
create index if not exists admin_change_log_table_idx on public.admin_change_log(table_name,created_at desc);
alter table public.admin_change_log enable row level security;
drop policy if exists "admins can read admin change log" on public.admin_change_log;
create policy "admins can read admin change log" on public.admin_change_log for select to authenticated using (exists (select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and r.code='admin'));
drop policy if exists "admins can insert admin change log" on public.admin_change_log;
create policy "admins can insert admin change log" on public.admin_change_log for insert to authenticated with check (exists (select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and r.code='admin'));