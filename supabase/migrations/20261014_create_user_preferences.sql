-- Persist account UI preferences under the authenticated user's own row.
-- No service-role key is needed from the Worker; requests use the user's JWT.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_preferences_object
    check (jsonb_typeof(preferences) = 'object')
);

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own
  on public.user_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own
  on public.user_preferences
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own
  on public.user_preferences
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own
  on public.user_preferences
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_preferences to authenticated;
