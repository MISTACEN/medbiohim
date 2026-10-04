create table if not exists public.presence_online (
  user_id uuid primary key references public.users(id) on delete cascade,
  name text,
  role text,
  region text,
  country text,
  geo_source text,
  last_seen timestamptz not null default now()
);

create index if not exists presence_online_last_seen_idx on public.presence_online(last_seen desc);

alter table public.presence_online enable row level security;

drop policy if exists presence_online_select_own on public.presence_online;
drop policy if exists presence_online_insert_own on public.presence_online;
drop policy if exists presence_online_update_own on public.presence_online;
drop policy if exists presence_online_delete_own on public.presence_online;

create policy presence_online_select_own on public.presence_online
for select to authenticated using ((select auth.uid()) = user_id);

create policy presence_online_insert_own on public.presence_online
for insert to authenticated with check ((select auth.uid()) = user_id);

create policy presence_online_update_own on public.presence_online
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy presence_online_delete_own on public.presence_online
for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.presence_online to authenticated;
grant insert, update, delete on public.presence_online to authenticated;
