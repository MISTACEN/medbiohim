-- MEDBIOHIM: semantic AI answer grading metadata
alter table public.test_answers
  add column if not exists grading_status text not null default 'deterministic',
  add column if not exists grading_source text not null default 'deterministic',
  add column if not exists grading_confidence numeric(5,4),
  add column if not exists grading_feedback text,
  add column if not exists grading_model text,
  add column if not exists graded_at timestamptz;

alter table public.test_preparation_results
  add column if not exists grading_status text not null default 'deterministic',
  add column if not exists grading_source text not null default 'deterministic',
  add column if not exists grading_confidence numeric(5,4),
  add column if not exists grading_feedback text,
  add column if not exists grading_model text,
  add column if not exists graded_at timestamptz;

alter table public.test_answers
  drop constraint if exists test_answers_grading_status_check;
alter table public.test_answers
  add constraint test_answers_grading_status_check
  check (grading_status in ('deterministic','ai','pending','error'));

alter table public.test_preparation_results
  drop constraint if exists test_preparation_results_grading_status_check;
alter table public.test_preparation_results
  add constraint test_preparation_results_grading_status_check
  check (grading_status in ('deterministic','ai','pending','error'));

create index if not exists idx_test_answers_grading_status
  on public.test_answers (attempt_id, grading_status);

create index if not exists idx_test_preparation_results_grading_status
  on public.test_preparation_results (session_id, grading_status);
