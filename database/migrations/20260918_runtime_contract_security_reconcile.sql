-- MEDBIOHIM runtime contract + security + performance reconciliation.
-- Applied to Supabase project gnobvyjywtqbdfeejxmf as migration
-- runtime_contract_security_reconcile_20260918.
-- No data reset.

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS b2_file_id text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'group',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS files_b2_file_id_idx ON public.files (b2_file_id);
CREATE INDEX IF NOT EXISTS files_group_id_idx ON public.files (group_id);
CREATE INDEX IF NOT EXISTS files_uploaded_by_idx ON public.files (uploaded_by);

ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_submissions_select ON public.homework_submissions;
DROP POLICY IF EXISTS homework_submissions_insert ON public.homework_submissions;
DROP POLICY IF EXISTS homework_submissions_update ON public.homework_submissions;
DROP POLICY IF EXISTS homework_submissions_delete ON public.homework_submissions;
CREATE POLICY homework_submissions_select ON public.homework_submissions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.has_app_role((SELECT auth.uid()), 'teacher') OR private.has_app_role((SELECT auth.uid()), 'moderator') OR private.has_app_role((SELECT auth.uid()), 'admin'));
CREATE POLICY homework_submissions_insert ON public.homework_submissions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY homework_submissions_update ON public.homework_submissions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.has_app_role((SELECT auth.uid()), 'teacher') OR private.has_app_role((SELECT auth.uid()), 'moderator') OR private.has_app_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (user_id = (SELECT auth.uid()) OR private.has_app_role((SELECT auth.uid()), 'teacher') OR private.has_app_role((SELECT auth.uid()), 'moderator') OR private.has_app_role((SELECT auth.uid()), 'admin'));
CREATE POLICY homework_submissions_delete ON public.homework_submissions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.has_app_role((SELECT auth.uid()), 'teacher') OR private.has_app_role((SELECT auth.uid()), 'moderator') OR private.has_app_role((SELECT auth.uid()), 'admin'));

CREATE INDEX IF NOT EXISTS homework_submissions_file_id_idx ON public.homework_submissions (file_id);
CREATE INDEX IF NOT EXISTS homework_submissions_homework_user_idx ON public.homework_submissions (homework_id, user_id);

DROP POLICY IF EXISTS user_roles_insert_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_own ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM anon;

ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_homework_submission_updated_at() SET search_path = public, pg_temp;

DROP INDEX IF EXISTS public.idx_group_memberships_group_active;
DROP INDEX IF EXISTS public.idx_group_memberships_user_active;
DROP INDEX IF EXISTS public.groups_code_uidx;
DROP INDEX IF EXISTS public.idx_schedule_entries_schedule_date;
DROP INDEX IF EXISTS public.idx_schedule_entries_schedule_date_time;

CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments (author_id);
CREATE INDEX IF NOT EXISTS exam_questions_subject_id_idx ON public.exam_questions (subject_id);
CREATE INDEX IF NOT EXISTS homework_progress_file_id_idx ON public.homework_progress (file_id);
CREATE INDEX IF NOT EXISTS homework_progress_user_id_idx ON public.homework_progress (user_id);
CREATE INDEX IF NOT EXISTS homeworks_created_by_idx ON public.homeworks (created_by);
CREATE INDEX IF NOT EXISTS homeworks_subject_id_idx ON public.homeworks (subject_id);
CREATE INDEX IF NOT EXISTS materials_file_id_idx ON public.materials (file_id);
CREATE INDEX IF NOT EXISTS materials_module_id_idx ON public.materials (module_id);
CREATE INDEX IF NOT EXISTS materials_subject_id_idx ON public.materials (subject_id);
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON public.notes (user_id);
CREATE INDEX IF NOT EXISTS questions_module_id_idx ON public.questions (module_id);
CREATE INDEX IF NOT EXISTS questions_subject_id_idx ON public.questions (subject_id);
CREATE INDEX IF NOT EXISTS schedules_academic_year_id_idx ON public.schedules (academic_year_id);
CREATE INDEX IF NOT EXISTS test_answers_question_id_idx ON public.test_answers (question_id);
CREATE INDEX IF NOT EXISTS test_attempts_test_id_idx ON public.test_attempts (test_id);
CREATE INDEX IF NOT EXISTS test_questions_question_id_idx ON public.test_questions (question_id);
CREATE INDEX IF NOT EXISTS tests_module_id_idx ON public.tests (module_id);
CREATE INDEX IF NOT EXISTS tests_subject_id_idx ON public.tests (subject_id);
CREATE INDEX IF NOT EXISTS tests_topic_id_idx ON public.tests (topic_id);
CREATE INDEX IF NOT EXISTS ticket_banks_subject_id_idx ON public.ticket_banks (subject_id);
CREATE INDEX IF NOT EXISTS tickets_subject_id_idx ON public.tickets (subject_id);
CREATE INDEX IF NOT EXISTS user_question_states_question_id_idx ON public.user_question_states (question_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON public.user_roles (role_id);
CREATE INDEX IF NOT EXISTS user_subject_progress_subject_id_idx ON public.user_subject_progress (subject_id);
CREATE INDEX IF NOT EXISTS user_topic_progress_topic_id_idx ON public.user_topic_progress (topic_id);

DROP POLICY IF EXISTS comments_delete_own ON public.comments;
DROP POLICY IF EXISTS comments_insert_own ON public.comments;
DROP POLICY IF EXISTS comments_update_own ON public.comments;
DROP POLICY IF EXISTS community_posts_delete_own ON public.community_posts;
DROP POLICY IF EXISTS posts_delete_own ON public.community_posts;
DROP POLICY IF EXISTS posts_update_own ON public.community_posts;
DROP POLICY IF EXISTS favorites_owner ON public.favorites;
DROP POLICY IF EXISTS homework_progress_owner ON public.homework_progress;
DROP POLICY IF EXISTS notes_owner ON public.notes;
DROP POLICY IF EXISTS answers_owner ON public.test_answers;
DROP POLICY IF EXISTS test_attempts_own ON public.test_attempts;
DROP POLICY IF EXISTS question_states_owner ON public.user_question_states;
DROP POLICY IF EXISTS subject_progress_owner ON public.user_subject_progress;
DROP POLICY IF EXISTS topic_progress_owner ON public.user_topic_progress;
DROP POLICY IF EXISTS posts_read_group ON public.community_posts;
DROP POLICY IF EXISTS community_posts_delete_own ON public.community_posts;

DROP POLICY IF EXISTS user_roles_read_own ON public.user_roles;
CREATE POLICY user_roles_read_own ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
