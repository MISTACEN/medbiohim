-- MEDBIOHIM: student-first homework creation with explicit owner-scoped personal rows.
-- Shared group tasks remain visible through the existing membership-scoped read policy.
-- No service-role bypass is introduced; every mutation still goes through caller JWT + RLS.

DROP POLICY IF EXISTS homework_insert_starosta ON public.homeworks;

CREATE POLICY homework_insert_group_member ON public.homeworks
  FOR INSERT TO authenticated
  WITH CHECK (
    group_id IS NOT NULL
    AND created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.group_memberships gm
      WHERE gm.group_id = homeworks.group_id
        AND gm.user_id = (SELECT auth.uid())
        AND gm.is_active IS TRUE
    )
  );

CREATE POLICY homework_insert_personal ON public.homeworks
  FOR INSERT TO authenticated
  WITH CHECK (
    group_id IS NULL
    AND created_by = (SELECT auth.uid())
    AND created_by_role = 'student'
  );

DROP POLICY IF EXISTS homework_read_personal ON public.homeworks;
CREATE POLICY homework_read_personal ON public.homeworks
  FOR SELECT TO authenticated
  USING (
    group_id IS NULL
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS homework_update_personal ON public.homeworks;
CREATE POLICY homework_update_personal ON public.homeworks
  FOR UPDATE TO authenticated
  USING (
    group_id IS NULL
    AND created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    group_id IS NULL
    AND created_by = (SELECT auth.uid())
    AND created_by_role = 'student'
  );

DROP POLICY IF EXISTS homework_delete_personal ON public.homeworks;
CREATE POLICY homework_delete_personal ON public.homeworks
  FOR DELETE TO authenticated
  USING (
    group_id IS NULL
    AND created_by = (SELECT auth.uid())
  );

CREATE INDEX IF NOT EXISTS homeworks_personal_owner_due_idx
  ON public.homeworks (created_by, due_date, created_at)
  WHERE group_id IS NULL;
