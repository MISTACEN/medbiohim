-- Allow the sequential "whole bank" preparation mode used by the test UI.
ALTER TABLE public.test_preparation_sessions
  DROP CONSTRAINT IF EXISTS test_preparation_sessions_mode_check;

ALTER TABLE public.test_preparation_sessions
  ADD CONSTRAINT test_preparation_sessions_mode_check
  CHECK (mode = ANY (ARRAY['full'::text, 'count'::text, 'sequential'::text]));
