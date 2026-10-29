-- 2026-10-30 · FA5: обсуждение в сообществе — комментарии к постам и жалобы
-- в модерскую очередь. Паттерн — question_comments (20261025000000).

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_comments_post_idx
  on public.community_comments (post_id, created_at);
create index if not exists community_comments_user_idx
  on public.community_comments (user_id);

alter table public.community_comments enable row level security;

create policy "community_comments_select_auth"
  on public.community_comments
  for select
  to authenticated
  using (true);

create policy "community_comments_insert_own"
  on public.community_comments
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "community_comments_update_own"
  on public.community_comments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "community_comments_delete_own"
  on public.community_comments
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.community_comments to authenticated;

-- Жалобы на посты: модерская очередь. Повторная жалоба того же студента на
-- тот же пост не создаёт дубликат; статус закрывает админ.
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_user_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_user_id)
);

create index if not exists community_reports_status_idx
  on public.community_reports (status, created_at);

alter table public.community_reports enable row level security;

create policy "community_reports_insert_own"
  on public.community_reports
  for insert
  to authenticated
  with check (reporter_user_id = (select auth.uid()));

create policy "community_reports_select_admin"
  on public.community_reports
  for select
  to authenticated
  using (private.has_app_role((select auth.uid()), 'admin'));

create policy "community_reports_update_admin"
  on public.community_reports
  for update
  to authenticated
  using (private.has_app_role((select auth.uid()), 'admin'))
  with check (private.has_app_role((select auth.uid()), 'admin'));

grant select, insert, update on public.community_reports to authenticated;
