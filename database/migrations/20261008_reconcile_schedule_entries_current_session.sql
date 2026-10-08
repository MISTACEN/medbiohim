-- Reconcile current schedule entries with the canonical current academic session.
-- Safe/idempotent: only fills NULL session_id when exactly one current session
-- matches the group's course and contains the entry date.
update public.schedule_entries se
set session_id = (
  select s.id
  from public.schedules sch
  join public.groups g on g.id = sch.group_id
  join public.academic_sessions s
    on s.is_current = true
   and s.course_number = g.course_number
   and se.date between s.start_date and s.end_date
  where sch.id = se.schedule_id
  limit 1
)
where se.session_id is null
  and exists (
    select 1
    from public.schedules sch
    join public.groups g on g.id = sch.group_id
    join public.academic_sessions s
      on s.is_current = true
     and s.course_number = g.course_number
     and se.date between s.start_date and s.end_date
    where sch.id = se.schedule_id
  );

create index if not exists schedule_entries_session_id_idx
  on public.schedule_entries (session_id);
