-- Compatibility migration for the current PHP API.
-- Safe to run against the current MEDBIOHIM Supabase schema.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS course_number smallint,
  ADD COLUMN IF NOT EXISTS semester smallint,
  ADD COLUMN IF NOT EXISTS control_type text,
  ADD COLUMN IF NOT EXISTS lecture_hours integer,
  ADD COLUMN IF NOT EXISTS practice_hours integer,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.homeworks
  ALTER COLUMN group_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text_answer text,
  file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','graded','returned')),
  grade numeric,
  teacher_comment text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(homework_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework
  ON public.homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_user
  ON public.homework_submissions(user_id);

DROP TRIGGER IF EXISTS trg_homework_submissions_updated_at ON public.homework_submissions;
CREATE TRIGGER trg_homework_submissions_updated_at
BEFORE UPDATE ON public.homework_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
