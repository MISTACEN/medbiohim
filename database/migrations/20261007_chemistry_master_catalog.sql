-- MEDBIOHIM chemistry master catalog
-- 2026-10-07
-- Canonical additive catalog; does not replace production tests/questions.

create table if not exists public.chemistry_master_documents (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null,
  title text not null,
  version text not null,
  source_archive text,
  source_documents jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  content jsonb not null default '[]'::jsonb,
  formula_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chemistry_master_documents_subject_version_uq
on public.chemistry_master_documents(subject_slug, version);

alter table public.chemistry_master_documents enable row level security;

drop policy if exists chemistry_master_documents_authenticated_read on public.chemistry_master_documents;
create policy chemistry_master_documents_authenticated_read
on public.chemistry_master_documents
for select to authenticated using (true);
