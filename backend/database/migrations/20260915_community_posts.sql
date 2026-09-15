create table if not exists public.community_posts (
    id uuid primary key default gen_random_uuid(),
    author_id uuid not null references public.users(id) on delete cascade,
    title text not null,
    body text not null,
    is_deleted boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_community_posts_created on public.community_posts(created_at desc);
create index if not exists idx_community_posts_author on public.community_posts(author_id);

alter table public.community_posts enable row level security;

create policy if not exists community_posts_select_auth
on public.community_posts for select to authenticated
using (is_deleted = false);

create policy if not exists community_posts_insert_self
on public.community_posts for insert to authenticated
with check (author_id = auth.uid());

create policy if not exists community_posts_update_self
on public.community_posts for update to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy if not exists community_posts_delete_self
on public.community_posts for delete to authenticated
using (author_id = auth.uid());
