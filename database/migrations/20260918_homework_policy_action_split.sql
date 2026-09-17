-- Split the old ALL policy into explicit mutation policies so SELECT is not duplicated.
-- Applied to Supabase project gnobvyjywtqbdfeejxmf.
DROP POLICY IF EXISTS homework_manage_starosta ON public.homeworks;
DROP POLICY IF EXISTS homework_insert_starosta ON public.homeworks;
DROP POLICY IF EXISTS homework_update_starosta ON public.homeworks;
DROP POLICY IF EXISTS homework_delete_starosta ON public.homeworks;

CREATE POLICY homework_insert_starosta ON public.homeworks
  FOR INSERT TO authenticated
  WITH CHECK (is_group_starosta(group_id) AND created_by = (SELECT auth.uid()));
CREATE POLICY homework_update_starosta ON public.homeworks
  FOR UPDATE TO authenticated
  USING (is_group_starosta(group_id))
  WITH CHECK (is_group_starosta(group_id) AND created_by = (SELECT auth.uid()));
CREATE POLICY homework_delete_starosta ON public.homeworks
  FOR DELETE TO authenticated
  USING (is_group_starosta(group_id));
