-- MEDBIOHIM: persistent histology trainer sessions.
create table if not exists public.trainings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject_slug text not null default 'histology',
  specialty_slug text not null default 'mbh',
  topics jsonb not null default '[]'::jsonb,
  content_type text not null default 'all' check (content_type in ('all','preparation','electronogram')),
  question_count integer not null default 20,
  label_mode text not null default 'without' check (label_mode in ('with','without','manual')),
  layout_mode text not null default 'top' check (layout_mode in ('sidebar','list','top')),
  status text not null default 'in_progress' check (status in ('in_progress','completed','cancelled')),
  question_ids text[] not null default '{}',
  current_index integer not null default 0,
  score numeric,
  total_questions integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.training_answers (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  question_id text not null references public.trainer_feed_cards(id) on delete cascade,
  "order" integer not null,
  user_answer text,
  is_correct boolean,
  is_skipped boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  question_snapshot jsonb not null default '{}'::jsonb,
  review_snapshot jsonb not null default '{}'::jsonb,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(training_id, "order"),
  unique(training_id, question_id)
);
create index if not exists trainings_user_status_updated_idx on public.trainings(user_id, status, updated_at desc);
create index if not exists training_answers_training_order_idx on public.training_answers(training_id, "order");
alter table public.trainings enable row level security;
alter table public.training_answers enable row level security;
drop policy if exists trainings_select_own on public.trainings;
drop policy if exists trainings_insert_own on public.trainings;
drop policy if exists trainings_update_own on public.trainings;
create policy trainings_select_own on public.trainings for select to authenticated using ((select auth.uid()) = user_id);
create policy trainings_insert_own on public.trainings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy trainings_update_own on public.trainings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists training_answers_select_own on public.training_answers;
drop policy if exists training_answers_insert_own on public.training_answers;
drop policy if exists training_answers_update_own on public.training_answers;
create policy training_answers_select_own on public.training_answers for select to authenticated using (exists (select 1 from public.trainings t where t.id = training_id and t.user_id = (select auth.uid())));
create policy training_answers_insert_own on public.training_answers for insert to authenticated with check (exists (select 1 from public.trainings t where t.id = training_id and t.user_id = (select auth.uid())));
create policy training_answers_update_own on public.training_answers for update to authenticated using (exists (select 1 from public.trainings t where t.id = training_id and t.user_id = (select auth.uid()))) with check (exists (select 1 from public.trainings t where t.id = training_id and t.user_id = (select auth.uid())));
