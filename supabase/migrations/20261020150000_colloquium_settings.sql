-- Physiology colloquium settings and content overrides live in the existing
-- keyed JSON document store. The base site_content table is managed outside
-- this repository, so do not create or alter it here.

insert into public.site_content (key, payload, updated_at)
values (
  'colloquium:physiology',
  jsonb_build_object(
    'version', 1,
    'enabled', true,
    'subject_slug', 'physiology',
    'subject_name', 'Физиология',
    'course_number', 2,
    'semester', 3,
    'title', 'Коллоквиум по физиологии',
    'subtitle', 'Подготовка к коллоквиуму по физиологии возбудимых систем',
    'description', 'План подготовки: теория, тесты с разбором ошибок, ситуационные задачи и пробный экзамен.',
    'opens_at', null,
    'closes_at', null,
    'exam', jsonb_build_object(
      'default_question_count', 20,
      'pass_percent', 70,
      'default_minutes', 30,
      'max_attempts', 0,
      'question_counts', jsonb_build_array(10, 20, 30, 50),
      'timer_minutes', jsonb_build_array(15, 30, 45, 60, 0)
    ),
    'plan', jsonb_build_object('total_minutes', 705),
    'features', jsonb_build_object(
      'plan', true,
      'theory', true,
      'tests', true,
      'tasks', true,
      'exam', true
    )
  ),
  now()
)
on conflict (key) do nothing;

-- Authenticated members may read colloquium settings and optional content.
drop policy if exists site_content_colloquium_member_read on public.site_content;
create policy site_content_colloquium_member_read
  on public.site_content
  for select
  to authenticated
  using (key like 'colloquium:%');

-- Admins may read, create and update colloquium documents.
drop policy if exists site_content_colloquium_admin_read on public.site_content;
create policy site_content_colloquium_admin_read
  on public.site_content
  for select
  to authenticated
  using (
    key like 'colloquium:%'
    and private.has_app_role((select auth.uid()), 'admin')
  );

drop policy if exists site_content_colloquium_admin_insert on public.site_content;
create policy site_content_colloquium_admin_insert
  on public.site_content
  for insert
  to authenticated
  with check (
    key like 'colloquium:%'
    and private.has_app_role((select auth.uid()), 'admin')
  );

drop policy if exists site_content_colloquium_admin_update on public.site_content;
create policy site_content_colloquium_admin_update
  on public.site_content
  for update
  to authenticated
  using (
    key like 'colloquium:%'
    and private.has_app_role((select auth.uid()), 'admin')
  )
  with check (
    key like 'colloquium:%'
    and private.has_app_role((select auth.uid()), 'admin')
  );

drop policy if exists site_content_colloquium_admin_delete on public.site_content;
create policy site_content_colloquium_admin_delete
  on public.site_content
  for delete
  to authenticated
  using (
    key like 'colloquium:%'
    and private.has_app_role((select auth.uid()), 'admin')
  );
