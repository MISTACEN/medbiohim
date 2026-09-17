-- MEDBIOHIM RLS policy and legacy RPC hardening.
-- Applied to Supabase project gnobvyjywtqbdfeejxmf as migration rls_policy_and_rpc_hardening_20260918.

CREATE OR REPLACE FUNCTION private.current_group_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT gm.group_id FROM public.group_memberships gm WHERE gm.user_id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION private.is_member_of_group(target_group_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = target_group_id AND gm.user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION private.is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = auth.uid() AND r.code IN ('admin','moderator','teacher')); $$;

CREATE OR REPLACE FUNCTION private.is_starosta_of_group(target_group_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = target_group_id AND gm.user_id = auth.uid() AND gm.role_in_group = 'starosta'); $$;

-- Replace public helper usage in the policies that currently call it.
DROP POLICY IF EXISTS community_insert ON public.community_posts;
DROP POLICY IF EXISTS community_read ON public.community_posts;
DROP POLICY IF EXISTS files_read ON public.files;
DROP POLICY IF EXISTS homework_group_read ON public.homeworks;
DROP POLICY IF EXISTS schedule_entries_manager_read_v2 ON public.schedule_entries;
DROP POLICY IF EXISTS schedule_entries_student_read_v2 ON public.schedule_entries;
DROP POLICY IF EXISTS schedules_manager_read_v2 ON public.schedules;
DROP POLICY IF EXISTS schedules_student_read_v2 ON public.schedules;

DROP POLICY IF EXISTS comments_insert ON public.comments;
DROP POLICY IF EXISTS comments_read ON public.comments;
DROP POLICY IF EXISTS comments_read_group ON public.comments;
DROP POLICY IF EXISTS posts_insert_own ON public.community_posts;
DROP POLICY IF EXISTS posts_read_group ON public.community_posts;
DROP POLICY IF EXISTS files_delete_own ON public.files;
DROP POLICY IF EXISTS files_delete_self ON public.files;
DROP POLICY IF EXISTS files_insert_own ON public.files;
DROP POLICY IF EXISTS files_insert_self ON public.files;
DROP POLICY IF EXISTS files_update_self ON public.files;

CREATE POLICY schedule_entries_read_v3 ON public.schedule_entries
  FOR SELECT TO authenticated
  USING (
    private.has_app_role((SELECT auth.uid()), 'teacher')
    OR private.has_app_role((SELECT auth.uid()), 'moderator')
    OR private.has_app_role((SELECT auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.id = schedule_entries.schedule_id
        AND private.is_member_of_group(s.group_id)
        AND COALESCE(s.is_active, true)
    )
  );

CREATE POLICY schedules_read_v3 ON public.schedules
  FOR SELECT TO authenticated
  USING (
    private.has_app_role((SELECT auth.uid()), 'teacher')
    OR private.has_app_role((SELECT auth.uid()), 'moderator')
    OR private.has_app_role((SELECT auth.uid()), 'admin')
    OR (private.is_member_of_group(group_id) AND COALESCE(is_active, true))
  );

REVOKE EXECUTE ON FUNCTION public.current_group_ids() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_member_of_group(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_starosta_of_group(uuid) FROM PUBLIC, anon, authenticated;
