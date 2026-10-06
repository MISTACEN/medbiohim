-- Prevent concurrent duplicate active attempts for the same user/test.
-- Production applied to Supabase project gnobvyjywtqbdfeejxmf.
CREATE UNIQUE INDEX IF NOT EXISTS test_attempts_one_active_per_user_test_idx
ON public.test_attempts (test_id, user_id)
WHERE status = 'in_progress';
