-- MEDBIOHIM: persistent SRS cards used by /cards and subject-level card scopes.
create table if not exists public.srs_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_type text not null default 'personal'
    check (source_type in ('question','personal')),
  source_id uuid references public.questions(id) on delete set null,
  front text not null,
  back text not null default '',
  subject_id uuid references public.subjects(id) on delete set null,
  subject_slug text,
  topic text,
  ease numeric(5,2) not null default 2.5,
  interval integer not null default 0,
  reps integer not null default 0,
  due_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists srs_cards_user_source_uidx
  on public.srs_cards(user_id, source_type, source_id)
  where source_id is not null;

create index if not exists srs_cards_user_due_idx
  on public.srs_cards(user_id, due_at);

create index if not exists srs_cards_user_subject_idx
  on public.srs_cards(user_id, subject_slug);

create index if not exists srs_cards_user_source_type_idx
  on public.srs_cards(user_id, source_type);

alter table public.srs_cards enable row level security;

drop policy if exists srs_cards_select_own on public.srs_cards;
drop policy if exists srs_cards_insert_own on public.srs_cards;
drop policy if exists srs_cards_update_own on public.srs_cards;
drop policy if exists srs_cards_delete_own on public.srs_cards;

create policy srs_cards_select_own on public.srs_cards
for select to authenticated
using ((select auth.uid()) = user_id);

create policy srs_cards_insert_own on public.srs_cards
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy srs_cards_update_own on public.srs_cards
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy srs_cards_delete_own on public.srs_cards
for delete to authenticated
using ((select auth.uid()) = user_id);
