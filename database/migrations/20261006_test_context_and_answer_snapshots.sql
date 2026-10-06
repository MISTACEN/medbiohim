ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id),
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.academic_sessions(id),
  ADD COLUMN IF NOT EXISTS context_version text,
  ADD COLUMN IF NOT EXISTS question_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.test_preparation_sessions
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id),
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.academic_sessions(id),
  ADD COLUMN IF NOT EXISTS context_version text,
  ADD COLUMN IF NOT EXISTS question_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.test_preparation_results
  ADD COLUMN IF NOT EXISTS answer_snapshot jsonb;

CREATE INDEX IF NOT EXISTS test_attempts_group_id_idx ON public.test_attempts(group_id);
CREATE INDEX IF NOT EXISTS test_attempts_session_id_idx ON public.test_attempts(session_id);
CREATE INDEX IF NOT EXISTS test_preparation_sessions_group_id_idx ON public.test_preparation_sessions(group_id);
CREATE INDEX IF NOT EXISTS test_preparation_sessions_session_id_idx ON public.test_preparation_sessions(session_id);
CREATE INDEX IF NOT EXISTS test_preparation_results_session_question_idx ON public.test_preparation_results(session_id,question_id);
CREATE UNIQUE INDEX IF NOT EXISTS test_answers_attempt_question_uidx ON public.test_answers(attempt_id,question_id);
