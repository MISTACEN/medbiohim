-- Existing production community_posts already stores posts in `text`.
-- Add normalized title/body/deletion fields so the application can expose a stable post shape.
alter table public.community_posts add column if not exists title text;
alter table public.community_posts add column if not exists body text;
alter table public.community_posts add column if not exists is_deleted boolean not null default false;
update public.community_posts
set body = coalesce(body, text),
    title = coalesce(title, nullif(tag, ''), left(text, 80))
where body is null or title is null;

create index if not exists idx_community_posts_created on public.community_posts(created_at desc);
create index if not exists idx_community_posts_author on public.community_posts(author_id);

alter table public.community_posts enable row level security;
