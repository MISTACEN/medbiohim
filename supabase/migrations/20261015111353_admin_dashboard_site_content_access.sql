-- Allow admins to read and update only the public dashboard documents.
-- The existing student read policy remains intact, and all other site_content
-- keys remain inaccessible to admins through this policy.

drop policy if exists site_content_admin_dashboard_read on public.site_content;
create policy site_content_admin_dashboard_read
  on public.site_content
  for select
  to authenticated
  using (
    key in ('site', 'announcements')
    and private.has_app_role((select auth.uid()), 'admin')
  );

-- Let the admin preview user-facing curriculum content from the subject pages.
-- Keep this read-only and restricted to the public lecture/plan documents.
drop policy if exists site_content_admin_curriculum_read on public.site_content;
create policy site_content_admin_curriculum_read
  on public.site_content
  for select
  to authenticated
  using (
    (key = 'lectures' or key like 'subject_plan:%')
    and private.has_app_role((select auth.uid()), 'admin')
  );

drop policy if exists site_content_admin_dashboard_insert on public.site_content;
create policy site_content_admin_dashboard_insert
  on public.site_content
  for insert
  to authenticated
  with check (
    key in ('site', 'announcements')
    and private.has_app_role((select auth.uid()), 'admin')
  );

drop policy if exists site_content_admin_dashboard_update on public.site_content;
create policy site_content_admin_dashboard_update
  on public.site_content
  for update
  to authenticated
  using (
    key in ('site', 'announcements')
    and private.has_app_role((select auth.uid()), 'admin')
  )
  with check (
    key in ('site', 'announcements')
    and private.has_app_role((select auth.uid()), 'admin')
  );
