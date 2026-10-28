-- 2026-10-28 · Отдельная таблица импортов расширения (итог диалога по сбору
-- контента: site_content — временный «мусорный бак», где extimport:: записи
-- лежат рядом с лекциями и контентом порталов). Заменяет ключи
-- extimport:<user_id>:<hash> в site_content. Приватность та же: строка видна
-- только владельцу; RLS в стиле user_preferences, без service-role.

create table if not exists public.imported_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'other'
    check (source in ('eios', 'neofamily', 'sechenov', 'fesmu', 'other')),
  kind text not null default 'link'
    check (kind in ('announcement', 'event', 'document', 'topic', 'link')),
  content_hash text not null,
  title text not null,
  url text not null,
  summary text,
  published_at text,
  created_at timestamptz not null default now(),
  unique (user_id, content_hash)
);

create index if not exists imported_sources_user_created_idx
  on public.imported_sources (user_id, created_at desc);

alter table public.imported_sources enable row level security;

drop policy if exists imported_sources_select_own on public.imported_sources;
create policy imported_sources_select_own
  on public.imported_sources
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists imported_sources_insert_own on public.imported_sources;
create policy imported_sources_insert_own
  on public.imported_sources
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists imported_sources_delete_own on public.imported_sources;
create policy imported_sources_delete_own
  on public.imported_sources
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.imported_sources to authenticated;

-- Разовый перенос записей из site_content (extimport:<uid>:<hash>).
-- Повторный запуск пропускается по unique(user_id, content_hash) через on conflict do nothing.
insert into public.imported_sources (user_id, source, kind, content_hash, title, url, summary, published_at, created_at)
select
  (substring(key from '^extimport:([0-9a-f-]{36}):'))::uuid,
  coalesce(payload->>'source', 'other'),
  coalesce(payload->>'kind', 'link'),
  substring(key from ':([0-9a-f]+)$'),
  coalesce(payload->>'title', 'Без названия'),
  coalesce(payload->>'url', ''),
  payload->>'summary',
  payload->>'published_at',
  coalesce(nullif(payload->>'imported_at', '')::timestamptz, updated_at, now())
from public.site_content
where key like 'extimport:%'
on conflict (user_id, content_hash) do nothing;
