-- P0 / schedule performance indexes for Supabase-backed schedule reads.
CREATE INDEX IF NOT EXISTS idx_schedules_group_semester_version
  ON public.schedules (group_id, semester, version DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule_date_time
  ON public.schedule_entries (schedule_id, date, start_time);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_subject_date
  ON public.schedule_entries (subject_id, date);

CREATE INDEX IF NOT EXISTS idx_group_memberships_user_group
  ON public.group_memberships (user_id, group_id);
