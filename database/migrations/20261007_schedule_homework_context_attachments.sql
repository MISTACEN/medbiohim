-- MEDBIOHIM: bind shared homework to an exact schedule lesson.
-- Photos/files stay in public.files; this table only links the existing metadata row.

ALTER TABLE public.homeworks
  ADD COLUMN IF NOT EXISTS schedule_entry_id uuid
    REFERENCES public.schedule_entries(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS homeworks_schedule_entry_idx
  ON public.homeworks(schedule_entry_id);
