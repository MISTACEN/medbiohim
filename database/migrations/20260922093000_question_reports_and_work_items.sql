create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('wrong_answer','wording','multiple_correct','no_correct','typo','other')),
  message text,
  status text not null default 'new' check (status in ('new','reviewing','fixed','rejected')),
  work_id uuid,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.content_work_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new','in_progress','review','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  question_id uuid references public.questions(id) on delete set null,
  report_id uuid references public.question_reports(id) on delete set null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.question_reports add constraint question_reports_work_fk foreign key (work_id) references public.content_work_items(id) on delete set null;
alter table public.question_reports enable row level security;
alter table public.content_work_items enable row level security;
create policy "question_reports_own_select" on public.question_reports for select to authenticated using ((select auth.uid())=reporter_user_id);
create policy "question_reports_own_insert" on public.question_reports for insert to authenticated with check ((select auth.uid())=reporter_user_id);
create policy "content_work_admin_all" on public.content_work_items for all to authenticated using (exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=(select auth.uid()) and r.code='admin')) with check (exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=(select auth.uid()) and r.code='admin'));
create policy "question_reports_admin_select" on public.question_reports for select to authenticated using (exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=(select auth.uid()) and r.code='admin'));
create policy "question_reports_admin_update" on public.question_reports for update to authenticated using (exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=(select auth.uid()) and r.code='admin')) with check (exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=(select auth.uid()) and r.code='admin'));
create index if not exists question_reports_question_status_idx on public.question_reports(question_id,status,created_at desc);
create index if not exists question_reports_reporter_idx on public.question_reports(reporter_user_id,created_at desc);
create index if not exists content_work_status_priority_idx on public.content_work_items(status,priority,updated_at desc);