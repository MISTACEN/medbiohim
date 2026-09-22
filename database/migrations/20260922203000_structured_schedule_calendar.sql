-- MEDBIOHIM: structured academic calendar and schedule detail metadata
create table if not exists public.academic_calendar_periods (
 id uuid primary key default gen_random_uuid(),
 academic_year_id uuid references public.academic_years(id) on delete set null,
 course_number smallint,
 semester smallint,
 title text not null,
 type text not null check (type in ('theoretical','exam_session','holidays','semester_start','other')),
 start_date date not null,
 end_date date,
 notes text,
 is_current boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_academic_calendar_periods_scope on public.academic_calendar_periods(course_number,semester,start_date);
alter table public.academic_calendar_periods enable row level security;
drop policy if exists "academic calendar authenticated read" on public.academic_calendar_periods;
create policy "academic calendar authenticated read" on public.academic_calendar_periods for select to authenticated using (true);

create table if not exists public.subject_schedule_rules (
 id uuid primary key default gen_random_uuid(),
 academic_year_id uuid references public.academic_years(id) on delete set null,
 course_number smallint,
 semester smallint,
 subject_id uuid references public.subjects(id) on delete set null,
 subject_name text not null,
 academic_hours smallint not null check (academic_hours > 0),
 notes text,
 created_at timestamptz not null default now(),
 unique(academic_year_id,course_number,semester,subject_name)
);
alter table public.subject_schedule_rules enable row level security;
drop policy if exists "subject schedule rules authenticated read" on public.subject_schedule_rules;
create policy "subject schedule rules authenticated read" on public.subject_schedule_rules for select to authenticated using (true);

alter table public.schedule_entries
 add column if not exists teacher text,
 add column if not exists academic_hours smallint,
 add column if not exists week_parity text check (week_parity in ('numerator','denominator','all')),
 add column if not exists recurrence_group text,
 add column if not exists parent_entry_id uuid references public.schedule_entries(id) on delete set null,
 add column if not exists source_detail text;
create index if not exists idx_schedule_entries_recurrence on public.schedule_entries(schedule_id,recurrence_group,date);
create index if not exists idx_schedule_entries_parent on public.schedule_entries(parent_entry_id);
grant select on public.academic_calendar_periods, public.subject_schedule_rules to authenticated;