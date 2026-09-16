-- P0 content model for universal question bank
create table if not exists public.questions (
  id text primary key,
  subject text not null,
  subject_slug text,
  course int,
  semester text,
  topic text,
  module text,
  kind text default 'main',
  type text default 'open',
  text text not null,
  answer text,
  options jsonb,
  correct int,
  rubric text,
  legacy_source text,
  created_at timestamptz default now()
);

create table if not exists public.ticket_banks (
  id text primary key,
  title text not null,
  subject text,
  subject_slug text,
  question_ids jsonb not null default '[]',
  legacy_source text
);

create table if not exists public.trainers (
  id text primary key,
  title text not null,
  subject text,
  module text,
  type text default 'matching_table',
  columns jsonb,
  rows jsonb,
  legacy_source text
);

create index if not exists questions_subject_slug_idx on public.questions (subject_slug);
create index if not exists questions_kind_idx on public.questions (kind);
