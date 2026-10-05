-- MEDBIOHIM Supabase hardening: RLS auth init-plan optimization and report policy consolidation.
-- Applied to live project as harden_question_reports_and_trainer_rls_20261005
-- and harden_admin_rls_initplan_20261005.

DROP POLICY IF EXISTS trainer_feed_answers_own ON public.trainer_feed_answers;
CREATE POLICY trainer_feed_answers_own
  ON public.trainer_feed_answers
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS question_reports_admin_select ON public.question_reports;
DROP POLICY IF EXISTS question_reports_own_select ON public.question_reports;
CREATE POLICY question_reports_select
  ON public.question_reports
  FOR SELECT TO authenticated
  USING (
    reporter_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.code = 'admin'
    )
  );

DROP POLICY IF EXISTS content_versions_admin_select ON public.content_versions;
CREATE POLICY content_versions_admin_select
  ON public.content_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.name = 'admin'
    )
  );

DROP POLICY IF EXISTS "admins can read admin change log" ON public.admin_change_log;
CREATE POLICY "admins can read admin change log"
  ON public.admin_change_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.code = 'admin'
    )
  );

DROP POLICY IF EXISTS "admins can insert admin change log" ON public.admin_change_log;
CREATE POLICY "admins can insert admin change log"
  ON public.admin_change_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.code = 'admin'
    )
  );
