-- Adaptive academic planning: official plan + academic sessions + student academic state + history + AI plan
alter type public.schedule_type add value if not exists 'retake';

create table if not exists public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid references public.academic_years(id) on delete set null,
  course_number smallint,
  semester smallint,
  type text not null default 'primary' check (type in ('primary','retake','makeup','additional')),
  title text not null,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_items (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  module_id uuid references public.modules(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  parent_id uuid references public.curriculum_items(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  session_id uuid references public.academic_sessions(id) on delete set null,
  course_number smallint,
  semester smallint,
  item_type text not null check (item_type in ('module','topic','subtopic','lecture','practice','lab','homework','material','test','ticket','colloquium','control_work','credit','exam','other')),
  title text not null,
  description text,
  planned_date date,
  due_at timestamptz,
  order_index integer not null default 0,
  is_required boolean not null default true,
  is_active boolean not null default true,
  source text not null default 'admin',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_academic_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('curriculum_item','topic','subject')),
  target_id uuid not null,
  subject_id uuid references public.subjects(id) on delete cascade,
  learning_status text not null default 'not_started' check (learning_status in ('not_started','in_progress','completed')),
  academic_status text not null default 'not_required' check (academic_status in ('not_required','pending','passed','failed','retake_required')),
  execution_status text not null default 'not_done' check (execution_status in ('not_done','done','overdue')),
  manual_override boolean not null default false,
  note text,
  last_result numeric,
  last_result_max numeric,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id,target_type,target_id)
);

create table if not exists public.academic_progress_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  curriculum_item_id uuid references public.curriculum_items(id) on delete cascade,
  percent numeric check (percent is null or (percent >= 0 and percent <= 100)),
  learning_status text check (learning_status is null or learning_status in ('not_started','in_progress','completed')),
  academic_status text check (academic_status is null or academic_status in ('not_required','pending','passed','failed','retake_required')),
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create table if not exists public.ai_study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.academic_sessions(id) on delete set null,
  status text not null default 'active' check (status in ('active','completed','archived')),
  title text not null default 'План подготовки',
  summary text,
  context_snapshot jsonb not null default '{}'::jsonb,
  generated_by text not null default 'rule_engine',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_study_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.ai_study_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  curriculum_item_id uuid references public.curriculum_items(id) on delete set null,
  schedule_entry_id uuid references public.schedule_entries(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  action_type text not null check (action_type in ('study','review','attend','complete_homework','take_test','prepare_retake','prepare_exam','close_debt','other')),
  title text not null,
  reason text,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.schedule_entries
  add column if not exists session_id uuid references public.academic_sessions(id) on delete set null,
  add column if not exists event_kind text not null default 'class' check (event_kind in ('class','assessment','credit','exam','retake','makeup','colloquium','control_work','consultation','other')),
  add column if not exists is_makeup boolean not null default false,
  add column if not exists source text not null default 'schedule';

create index if not exists idx_curriculum_items_subject on public.curriculum_items(subject_id, semester, is_active);
create index if not exists idx_curriculum_items_topic on public.curriculum_items(topic_id);
create index if not exists idx_curriculum_items_session on public.curriculum_items(session_id);
create index if not exists idx_student_academic_states_user on public.student_academic_states(user_id, academic_status);
create index if not exists idx_student_academic_states_target on public.student_academic_states(target_type, target_id);
create index if not exists idx_academic_progress_history_user_time on public.academic_progress_history(user_id, recorded_at desc);
create index if not exists idx_academic_progress_history_topic_time on public.academic_progress_history(topic_id, recorded_at desc);
create index if not exists idx_ai_study_plans_user_status on public.ai_study_plans(user_id, status, updated_at desc);
create index if not exists idx_ai_study_plan_items_plan on public.ai_study_plan_items(plan_id, priority);
create index if not exists idx_schedule_entries_event on public.schedule_entries(event_kind, date);
create index if not exists idx_schedule_entries_session on public.schedule_entries(session_id);

alter table public.academic_sessions enable row level security;
alter table public.curriculum_items enable row level security;
alter table public.student_academic_states enable row level security;
alter table public.academic_progress_history enable row level security;
alter table public.ai_study_plans enable row level security;
alter table public.ai_study_plan_items enable row level security;

grant select on public.academic_sessions to authenticated;
grant select on public.curriculum_items to authenticated;
grant select,insert,update,delete on public.student_academic_states to authenticated;
grant select on public.academic_progress_history to authenticated;
grant select,insert,update,delete on public.ai_study_plans to authenticated;
grant select,insert,update,delete on public.ai_study_plan_items to authenticated;
grant select on public.schedule_entries to authenticated;

drop policy if exists academic_sessions_select on public.academic_sessions;
create policy academic_sessions_select on public.academic_sessions for select to authenticated using (true);
drop policy if exists curriculum_items_select on public.curriculum_items;
create policy curriculum_items_select on public.curriculum_items for select to authenticated using (true);
drop policy if exists student_academic_states_select on public.student_academic_states;
drop policy if exists student_academic_states_insert on public.student_academic_states;
drop policy if exists student_academic_states_update on public.student_academic_states;
drop policy if exists student_academic_states_delete on public.student_academic_states;
create policy student_academic_states_select on public.student_academic_states for select to authenticated using ((select auth.uid()) = user_id);
create policy student_academic_states_insert on public.student_academic_states for insert to authenticated with check ((select auth.uid()) = user_id);
create policy student_academic_states_update on public.student_academic_states for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy student_academic_states_delete on public.student_academic_states for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists academic_progress_history_select on public.academic_progress_history;
create policy academic_progress_history_select on public.academic_progress_history for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists ai_study_plans_select on public.ai_study_plans;
drop policy if exists ai_study_plans_insert on public.ai_study_plans;
drop policy if exists ai_study_plans_update on public.ai_study_plans;
drop policy if exists ai_study_plans_delete on public.ai_study_plans;
create policy ai_study_plans_select on public.ai_study_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_study_plans_insert on public.ai_study_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ai_study_plans_update on public.ai_study_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_study_plans_delete on public.ai_study_plans for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists ai_study_plan_items_select on public.ai_study_plan_items;
drop policy if exists ai_study_plan_items_insert on public.ai_study_plan_items;
drop policy if exists ai_study_plan_items_update on public.ai_study_plan_items;
drop policy if exists ai_study_plan_items_delete on public.ai_study_plan_items;
create policy ai_study_plan_items_select on public.ai_study_plan_items for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_study_plan_items_insert on public.ai_study_plan_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ai_study_plan_items_update on public.ai_study_plan_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_study_plan_items_delete on public.ai_study_plan_items for delete to authenticated using ((select auth.uid()) = user_id);
