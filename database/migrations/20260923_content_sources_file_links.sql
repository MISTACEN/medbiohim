alter table public.content_sources
  add column if not exists file_id uuid references public.files(id) on delete set null;

create index if not exists content_sources_file_id_idx on public.content_sources(file_id);

alter table public.trainer_feed_cards
  add column if not exists source_file_id uuid references public.files(id) on delete set null;

create index if not exists trainer_feed_cards_source_file_id_idx on public.trainer_feed_cards(source_file_id);
