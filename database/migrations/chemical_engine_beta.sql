-- Chemistry Engine (promoted from beta experiment → main 2026-09-30)
create table if not exists public.chemical_molecules (
  id uuid primary key default gen_random_uuid(), name text not null, formula text,
  molecular_weight numeric, cid bigint, canonical_smiles text, isomeric_smiles text,
  inchi text, inchikey text, molfile text, image_2d_url text, image_3d_url text,
  source_type text not null default 'local', source_id text, source_url text,
  retrieved_at timestamptz, is_published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists chemical_molecules_inchikey_uidx on public.chemical_molecules (inchikey) where inchikey is not null;
create index if not exists chemical_molecules_name_idx on public.chemical_molecules using gin (to_tsvector('simple', name));
create table if not exists public.chemical_aliases (
 id uuid primary key default gen_random_uuid(), molecule_id uuid not null references public.chemical_molecules(id) on delete cascade,
 alias text not null, alias_type text not null default 'synonym', source_type text not null default 'local', created_at timestamptz not null default now()
);
create index if not exists chemical_aliases_alias_idx on public.chemical_aliases(alias);
create index if not exists chemical_aliases_molecule_idx on public.chemical_aliases(molecule_id);
create table if not exists public.chemical_properties (
 id uuid primary key default gen_random_uuid(), molecule_id uuid not null references public.chemical_molecules(id) on delete cascade,
 property_name text not null, property_value jsonb not null, source_type text not null default 'local', source_id text, created_at timestamptz not null default now()
);
create index if not exists chemical_properties_molecule_idx on public.chemical_properties(molecule_id);
create table if not exists public.chemical_reactions (
 id uuid primary key default gen_random_uuid(), name text, reaction_smarts text, reaction_class text,
 conditions jsonb not null default '{}'::jsonb, source_type text not null default 'local', source_id text, source_url text,
 is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.chemical_reaction_steps (
 id uuid primary key default gen_random_uuid(), reaction_id uuid not null references public.chemical_reactions(id) on delete cascade,
 step_order integer not null, step_type text not null default 'transformation', payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), unique(reaction_id, step_order)
);
create table if not exists public.chemical_sources (
 id uuid primary key default gen_random_uuid(), source_type text not null, source_id text, source_url text, title text,
 retrieved_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.chemical_spectra (
 id uuid primary key default gen_random_uuid(), molecule_id uuid references public.chemical_molecules(id) on delete cascade,
 spectrum_type text not null, data jsonb not null default '{}'::jsonb, source_type text not null default 'local',
 source_id text, source_url text, created_at timestamptz not null default now()
);
create table if not exists public.chemical_functional_groups (
 id uuid primary key default gen_random_uuid(), name text not null unique, smarts text, description text, created_at timestamptz not null default now()
);
create table if not exists public.chemical_topics (
 id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, discipline text not null,
 parent_id uuid references public.chemical_topics(id) on delete set null, description text, created_at timestamptz not null default now()
);
create table if not exists public.chemical_questions (
 id uuid primary key default gen_random_uuid(), subject_id uuid references public.subjects(id) on delete set null,
 topic_id uuid references public.chemical_topics(id) on delete set null, molecule_id uuid references public.chemical_molecules(id) on delete set null,
 reaction_id uuid references public.chemical_reactions(id) on delete set null, question_type text not null default 'concept',
 prompt jsonb not null default '{}'::jsonb, answer jsonb not null default '{}'::jsonb, difficulty smallint,
 is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.chemical_molecules enable row level security;
alter table public.chemical_aliases enable row level security;
alter table public.chemical_properties enable row level security;
alter table public.chemical_reactions enable row level security;
alter table public.chemical_reaction_steps enable row level security;
alter table public.chemical_sources enable row level security;
alter table public.chemical_spectra enable row level security;
alter table public.chemical_functional_groups enable row level security;
alter table public.chemical_topics enable row level security;
alter table public.chemical_questions enable row level security;
drop policy if exists "chemical published molecules are readable" on public.chemical_molecules;
create policy "chemical published molecules are readable" on public.chemical_molecules for select to anon, authenticated using (is_published = true);
drop policy if exists "chemical aliases are readable for published molecules" on public.chemical_aliases;
create policy "chemical aliases are readable for published molecules" on public.chemical_aliases for select to anon, authenticated using (exists (select 1 from public.chemical_molecules m where m.id=molecule_id and m.is_published=true));
drop policy if exists "chemical properties are readable for published molecules" on public.chemical_properties;
create policy "chemical properties are readable for published molecules" on public.chemical_properties for select to anon, authenticated using (exists (select 1 from public.chemical_molecules m where m.id=molecule_id and m.is_published=true));
drop policy if exists "chemical published reactions are readable" on public.chemical_reactions;
create policy "chemical published reactions are readable" on public.chemical_reactions for select to anon, authenticated using (is_published=true);
drop policy if exists "chemical reaction steps are readable for published reactions" on public.chemical_reaction_steps;
create policy "chemical reaction steps are readable for published reactions" on public.chemical_reaction_steps for select to anon, authenticated using (exists (select 1 from public.chemical_reactions r where r.id=reaction_id and r.is_published=true));
drop policy if exists "chemical sources are readable" on public.chemical_sources;
create policy "chemical sources are readable" on public.chemical_sources for select to anon, authenticated using (true);
drop policy if exists "chemical spectra are readable for published molecules" on public.chemical_spectra;
drop policy if exists "chemical spectra are readable for published reactions" on public.chemical_spectra;
create policy "chemical spectra are readable for published molecules" on public.chemical_spectra for select to anon, authenticated using (molecule_id is null or exists (select 1 from public.chemical_molecules m where m.id=molecule_id and m.is_published=true));
drop policy if exists "chemical functional groups are readable" on public.chemical_functional_groups;
create policy "chemical functional groups are readable" on public.chemical_functional_groups for select to anon, authenticated using (true);
drop policy if exists "chemical topics are readable" on public.chemical_topics;
create policy "chemical topics are readable" on public.chemical_topics for select to anon, authenticated using (true);
drop policy if exists "chemical published questions are readable" on public.chemical_questions;
create policy "chemical published questions are readable" on public.chemical_questions for select to anon, authenticated using (is_published=true);
