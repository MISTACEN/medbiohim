-- 2026-10-30 · Аудит Supabase, часть 2: консолидация дублирующих RLS-политик
-- и добивка покрывающих индексов на холодные внешние ключи.
--
-- Linter 0006 (multiple permissive policies): на одну роль и действие было
-- несколько PERMISSIVE политик — Postgres выполняет каждую на каждом запросе.
-- Объединяем их в одну через OR с точным сохранением исходных условий
-- (каждое прежнее qual/with_check входит в объединение дословно).
-- Доступы не расширяются и не сужаются.

-- ── users ────────────────────────────────────────────────────────────────
drop policy if exists users_select_admin_v1 on public.users;
drop policy if exists users_select_self on public.users;
create policy users_select_authenticated
  on public.users for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.has_app_role((select auth.uid()), 'admin')
  );

drop policy if exists users_update_admin_v1 on public.users;
drop policy if exists users_update_self on public.users;
create policy users_update_authenticated
  on public.users for update
  to authenticated
  using (
    id = (select auth.uid())
    or private.has_app_role((select auth.uid()), 'admin')
  )
  with check (
    id = (select auth.uid())
    or private.has_app_role((select auth.uid()), 'admin')
  );

-- ── user_roles ───────────────────────────────────────────────────────────
drop policy if exists user_roles_read_own on public.user_roles;
drop policy if exists user_roles_select_admin_v1 on public.user_roles;
create policy user_roles_select_authenticated
  on public.user_roles for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_app_role((select auth.uid()), 'admin')
  );

-- ── site_content: чтение студентом всех ключей + админские ключи ─────────
drop policy if exists site_content_read on public.site_content;
drop policy if exists site_content_admin_curriculum_read on public.site_content;
drop policy if exists site_content_admin_dashboard_read on public.site_content;
create policy site_content_select_authenticated
  on public.site_content for select
  to authenticated
  using (
    is_student()
    or (
      (key = 'lectures' or key like 'subject_plan:%' or key = any (array['site','announcements']))
      and private.has_app_role((select auth.uid()), 'admin')
    )
  );

-- ── homeworks ────────────────────────────────────────────────────────────
drop policy if exists homework_read_group on public.homeworks;
drop policy if exists homework_read_personal on public.homeworks;
create policy homework_select_authenticated
  on public.homeworks for select
  to authenticated
  using (
    (group_id is null and created_by = (select auth.uid()))
    or exists (
      select 1 from group_memberships gm
      where gm.group_id = homeworks.group_id
        and gm.user_id = (select auth.uid())
    )
  );

drop policy if exists homework_insert_group_member on public.homeworks;
drop policy if exists homework_insert_personal on public.homeworks;
create policy homework_insert_authenticated
  on public.homeworks for insert
  to authenticated
  with check (
    (
      group_id is not null
      and created_by = (select auth.uid())
      and exists (
        select 1 from group_memberships gm
        where gm.group_id = homeworks.group_id
          and gm.user_id = (select auth.uid())
          and gm.is_active is true
      )
    )
    or (
      group_id is null
      and created_by = (select auth.uid())
      and created_by_role = 'student'
    )
  );

drop policy if exists homework_update_personal on public.homeworks;
drop policy if exists homework_update_starosta on public.homeworks;
create policy homework_update_authenticated
  on public.homeworks for update
  to authenticated
  using (
    (group_id is null and created_by = (select auth.uid()))
    or is_group_starosta(group_id)
  )
  with check (
    (group_id is null and created_by = (select auth.uid()) and created_by_role = 'student')
    or (is_group_starosta(group_id) and created_by = (select auth.uid()))
  );

drop policy if exists homework_delete_personal on public.homeworks;
drop policy if exists homework_delete_starosta on public.homeworks;
create policy homework_delete_authenticated
  on public.homeworks for delete
  to authenticated
  using (
    (group_id is null and created_by = (select auth.uid()))
    or is_group_starosta(group_id)
  );

-- ── Linter 0001: покрывающие индексы на холодные внешние ключи ───────────
create index if not exists academic_calendar_periods_year_idx on public.academic_calendar_periods (academic_year_id);
create index if not exists academic_progress_history_item_idx on public.academic_progress_history (curriculum_item_id);
create index if not exists academic_sessions_year_idx on public.academic_sessions (academic_year_id);
create index if not exists ai_study_plan_items_item_idx on public.ai_study_plan_items (curriculum_item_id);
create index if not exists ai_study_plan_items_entry_idx on public.ai_study_plan_items (schedule_entry_id);
create index if not exists ai_study_plan_items_topic_idx on public.ai_study_plan_items (topic_id);
create index if not exists ai_study_plans_session_idx on public.ai_study_plans (session_id);
create index if not exists chemical_questions_molecule_idx on public.chemical_questions (molecule_id);
create index if not exists chemical_questions_reaction_idx on public.chemical_questions (reaction_id);
create index if not exists chemical_spectra_molecule_idx on public.chemical_spectra (molecule_id);
create index if not exists chemical_topics_parent_idx on public.chemical_topics (parent_id);
create index if not exists content_versions_actor_idx on public.content_versions (actor_user_id);
create index if not exists content_work_items_created_by_idx on public.content_work_items (created_by);
create index if not exists content_work_items_question_idx on public.content_work_items (question_id);
create index if not exists content_work_items_report_idx on public.content_work_items (report_id);
create index if not exists curriculum_items_year_idx on public.curriculum_items (academic_year_id);
create index if not exists histology_assets_preparation_idx on public.histology_assets (preparation_id);
create index if not exists homework_attachments_message_idx on public.homework_attachments (telegram_message_id);
create index if not exists question_reports_resolved_by_idx on public.question_reports (resolved_by);
create index if not exists question_reports_work_idx on public.question_reports (work_id);
create index if not exists srs_cards_source_idx on public.srs_cards (source_id);
create index if not exists student_academic_states_subject_idx on public.student_academic_states (subject_id);
create index if not exists test_preparation_reviews_session_idx on public.test_preparation_ai_reviews (session_id);
create index if not exists test_preparation_reviews_user_idx on public.test_preparation_ai_reviews (user_id);
create index if not exists training_answers_question_idx on public.training_answers (question_id);

-- ── Гранты на RLS-хелперы ─────────────────────────────────────────────────
-- Политики вызывают is_student() и is_group_starosta(), но EXECUTE для
-- authenticated на этих функциях не было: student-чтение site_content
-- отвечало «permission denied for function is_student» (воркер маскировал
-- это service-фолбэком), а starosta-ветки ДЗ сломались бы при первом
-- обращении. has_app_role уже была выдана — потому users/user_roles работали.
grant execute on function public.is_student() to authenticated;
grant execute on function public.is_group_starosta(uuid) to authenticated;
