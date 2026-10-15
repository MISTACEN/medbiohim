-- Enforce at most one active histology training per user, including races
-- between concurrent requests that both pass the RPC's pre-insert lookup.
-- This is non-destructive: existing training rows are never rewritten/deleted.
CREATE UNIQUE INDEX IF NOT EXISTS trainings_one_active_histology_per_user_idx
  ON public.trainings (user_id)
  WHERE subject_slug = 'histology' AND status = 'in_progress';
