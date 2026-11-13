-- Карточки-паки (Quizlet-стиль): пользовательские и ИИ-сгенерированные колоды.
-- Публикация в мастерскую = is_published; чужой пак копируется к себе импортом.

create table if not exists public.card_packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  subject_slug text,
  source text not null default 'user' check (source in ('user','ai')),
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.card_packs(id) on delete cascade,
  front text not null,
  back text not null default '',
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists card_packs_owner_idx on public.card_packs(owner_id);
create index if not exists card_packs_published_idx on public.card_packs(is_published, published_at desc nulls last) where is_published;
create index if not exists card_packs_subject_idx on public.card_packs(subject_slug) where subject_slug is not null;
create index if not exists card_pack_items_pack_idx on public.card_pack_items(pack_id, order_index);

alter table public.card_packs enable row level security;
alter table public.card_pack_items enable row level security;

create policy card_packs_owner_select on public.card_packs
  for select to authenticated
  using (owner_id = auth.uid() or is_published = true);
create policy card_packs_owner_insert on public.card_packs
  for insert to authenticated
  with check (owner_id = auth.uid());
create policy card_packs_owner_update on public.card_packs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy card_packs_owner_delete on public.card_packs
  for delete to authenticated
  using (owner_id = auth.uid());

create policy card_pack_items_visible on public.card_pack_items
  for select to authenticated
  using (
    exists (
      select 1 from public.card_packs cp
      where cp.id = card_pack_items.pack_id
        and (cp.owner_id = auth.uid() or cp.is_published = true)
    )
  );
create policy card_pack_items_owner_write on public.card_pack_items
  for all to authenticated
  using (exists (select 1 from public.card_packs cp where cp.id = card_pack_items.pack_id and cp.owner_id = auth.uid()))
  with check (exists (select 1 from public.card_packs cp where cp.id = card_pack_items.pack_id and cp.owner_id = auth.uid()));
