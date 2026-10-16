-- Allow the admin CMS to read and manage user directory and role assignments.
-- RLS remains enabled; student access is still limited by the existing self policies.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_select_admin_v1'
  ) THEN
    CREATE POLICY users_select_admin_v1 ON public.users
      FOR SELECT TO authenticated
      USING (private.has_app_role((SELECT auth.uid()), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_update_admin_v1'
  ) THEN
    CREATE POLICY users_update_admin_v1 ON public.users
      FOR UPDATE TO authenticated
      USING (private.has_app_role((SELECT auth.uid()), 'admin'))
      WITH CHECK (private.has_app_role((SELECT auth.uid()), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_select_admin_v1'
  ) THEN
    CREATE POLICY user_roles_select_admin_v1 ON public.user_roles
      FOR SELECT TO authenticated
      USING (private.has_app_role((SELECT auth.uid()), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_insert_admin_v1'
  ) THEN
    CREATE POLICY user_roles_insert_admin_v1 ON public.user_roles
      FOR INSERT TO authenticated
      WITH CHECK (private.has_app_role((SELECT auth.uid()), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_delete_admin_v1'
  ) THEN
    CREATE POLICY user_roles_delete_admin_v1 ON public.user_roles
      FOR DELETE TO authenticated
      USING (private.has_app_role((SELECT auth.uid()), 'admin'));
  END IF;
END $$;
