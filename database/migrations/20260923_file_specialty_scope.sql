alter table public.files
  add column if not exists specialty_slug text;

create index if not exists files_specialty_slug_idx on public.files(specialty_slug);