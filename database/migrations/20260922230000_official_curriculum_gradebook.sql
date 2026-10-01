-- Official curriculum/gradebook schema.
-- Source data is strictly the user-provided XLSX/photos.
-- The production database was populated from those files in the same rollout;
-- the importer source is backend/data/curriculum_master.json plus the gradebook mapping.
-- Do not use external university curriculum data.

alter table public.subjects
  add column if not exists self_study_hours integer,
  add column if not exists total_hours integer,
  add column if not exists credits numeric(5,2);

create table if not exists public.subject_gradebook_entries (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  display_name text not null,
  hours integer,
  credits numeric(5,2),
  control_form text,
  hours_scope text not null default 'semester'
    check (hours_scope in ('semester','course')),
  source_note text,
  source_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id)
);

alter table public.subject_gradebook_entries enable row level security;
drop policy if exists "gradebook entries read authenticated" on public.subject_gradebook_entries;
create policy "gradebook entries read authenticated"
  on public.subject_gradebook_entries for select to authenticated using (true);

-- Workload data is synchronized from the user-provided plan(1).xlsx.
-- Gradebook data is synchronized from the two user-provided photos.
