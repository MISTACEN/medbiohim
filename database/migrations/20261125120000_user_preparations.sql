-- Свои препараты студента: личные карточки микропрепаратов.
--
-- Отдельная таблица, а не строки в public.trainer_feed_cards: каталог
-- препаратов остаётся общим и опубликованным, а личные снимки не должны
-- попадать в общий атлас или импорт. Владелец видит и меняет только свои
-- строки (RLS), чтение общего банка это не затрагивает.
--
-- Фото: либо внешний/статический URL (image_url), либо файл из
-- public.files (file_id) — Worker подписывает ссылку на чтение при выдаче.

create table if not exists public.user_preparations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_slug text not null default 'histology',
  name text not null,
  organ text,
  stain text,
  description text,
  image_url text,
  file_id uuid references public.files(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_preparations_owner_idx
  on public.user_preparations (user_id, subject_slug, created_at desc);

alter table public.user_preparations enable row level security;

revoke all on public.user_preparations from public, anon;
grant select, insert, update, delete on public.user_preparations to authenticated;

drop policy if exists user_preparations_owner_select on public.user_preparations;
create policy user_preparations_owner_select on public.user_preparations
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_preparations_owner_insert on public.user_preparations;
create policy user_preparations_owner_insert on public.user_preparations
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_preparations_owner_update on public.user_preparations;
create policy user_preparations_owner_update on public.user_preparations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_preparations_owner_delete on public.user_preparations;
create policy user_preparations_owner_delete on public.user_preparations
  for delete to authenticated
  using (user_id = auth.uid());
