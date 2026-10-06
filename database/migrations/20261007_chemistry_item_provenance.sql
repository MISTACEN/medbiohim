-- Preserve provenance for every item in the unified chemistry master catalog.
-- Two methodicals are independent sources; identical wording is not sufficient
-- reason to discard one occurrence.

create table if not exists public.chemistry_master_item_provenance (
  id uuid primary key default gen_random_uuid(),
  master_document_id uuid not null references public.chemistry_master_documents(id) on delete cascade,
  item_key text not null,
  source_key text not null references public.chemistry_source_documents(source_key) on delete restrict,
  source_document text,
  source_page integer,
  source_item_number text,
  item_type text not null,
  formula_kind text,
  extraction_status text not null default 'text',
  answer_status text not null default 'unprepared',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(master_document_id,item_key,source_key)
);

create index if not exists chemistry_master_item_provenance_source_idx
on public.chemistry_master_item_provenance(source_key);

create index if not exists chemistry_master_item_provenance_formula_idx
on public.chemistry_master_item_provenance(formula_kind)
where formula_kind is not null;

alter table public.chemistry_master_item_provenance enable row level security;

drop policy if exists chemistry_master_item_provenance_authenticated_read
on public.chemistry_master_item_provenance;

create policy chemistry_master_item_provenance_authenticated_read
on public.chemistry_master_item_provenance
for select to authenticated using (true);
