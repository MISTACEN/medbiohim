-- 2026-10-30 · Аудит Supabase (linter security + performance, MCP advisors):
-- безопасные чистки и ускорение RLS/индексов.
--
-- Что здесь и почему:
--  • _ma10_check — забытая диагностическая таблица пакета атомарных вариантов
--    (без PK и RLS, в коде не используется) — удаляется;
--  • search_path зафиксирован у SECURITY DEFINER функции grace-периода
--    удаления аккаунта (linter 0011);
--  • RLS-политики question_comments и user_calendar_events переписаны на
--    (select auth.uid()) — инициализация один раз на запрос, а не на строку
--    (linter 0003, семантика не меняется);
--  • дублирующий уникальный индекс site_content.key удалён — уникальность
--    уже держит первичный ключ (linter 0009);
--  • покрывающие индексы на внешние ключи горячих путей API (linter 0001):
--    план-прогресс, билеты/вопросы к экзамену, расписание, SRS, ДЗ,
--    подготовка к тестам, тренировки, календарь студента.
--
-- Осознанно НЕ менялось (зафиксировано как намеренное):
--  • view trainer_feed_cards_public и test_curriculum_map — SECURITY DEFINER
--    намеренно: первый вырезает правильные ответы до выдачи и сам гейтит
--    доступ по группе МБХ, второй показывает только опубликованный контент;
--  • telegram_account_link_tokens / telegram_accounts — RLS включена без
--    политик = deny-all через PostgREST, доступ только сервисный (это и
--    есть требуемое поведение);
--  • SECURITY DEFINER RPC (сессии, удаление аккаунта, попытки тестов,
--    telegram-линк) — рассчитаны на вызов авторизованным студентом и внутри
--    проверяют auth.uid(); ревокать EXECUTE нельзя, иначе сломается UI;
--  • multiple permissive policies (homeworks/users/user_roles/site_content) —
--    консолидация политик отдельная задача, сейчас семантика верна.

-- 1. Мусорная диагностическая таблица.
drop table if exists public._ma10_check;

-- 2. Фиксированный search_path у SECURITY DEFINER функции.
alter function public.medbiohim_account_deletion_grace_days() set search_path = '';

-- 3. RLS: auth.uid() один раз на запрос (select-обёртка).
drop policy if exists question_comments_insert_own on public.question_comments;
create policy question_comments_insert_own
  on public.question_comments for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists question_comments_update_own on public.question_comments;
create policy question_comments_update_own
  on public.question_comments for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists question_comments_delete_own on public.question_comments;
create policy question_comments_delete_own
  on public.question_comments for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user calendar events own rows" on public.user_calendar_events;
create policy "user calendar events own rows"
  on public.user_calendar_events for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4. Дубликат уникального индекса: pkey уже гарантирует уникальность key.
drop index if exists public.site_content_key_uidx;

-- 5. Покрывающие индексы на внешние ключи горячих путей.
create index if not exists exam_questions_plan_topic_idx on public.exam_questions (plan_topic_id);
create index if not exists exam_questions_plan_module_idx on public.exam_questions (plan_module_id);
create index if not exists curriculum_items_module_idx on public.curriculum_items (module_id);
create index if not exists curriculum_items_parent_idx on public.curriculum_items (parent_id);
create index if not exists trainer_feed_cards_subject_idx on public.trainer_feed_cards (subject_id);
create index if not exists trainer_feed_cards_plan_topic_idx on public.trainer_feed_cards (plan_topic_id);
create index if not exists trainer_feed_cards_plan_module_idx on public.trainer_feed_cards (plan_module_id);
create index if not exists srs_cards_subject_idx on public.srs_cards (subject_id);
create index if not exists user_calendar_events_subject_idx on public.user_calendar_events (subject_id);
create index if not exists user_calendar_events_topic_idx on public.user_calendar_events (topic_id);
create index if not exists chemical_questions_topic_idx on public.chemical_questions (topic_id);
create index if not exists chemical_questions_subject_idx on public.chemical_questions (subject_id);
create index if not exists test_preparation_results_user_idx on public.test_preparation_results (user_id);
create index if not exists test_preparation_results_question_idx on public.test_preparation_results (question_id);
create index if not exists ai_study_plan_items_user_idx on public.ai_study_plan_items (user_id);
create index if not exists ai_study_plan_items_subject_idx on public.ai_study_plan_items (subject_id);
create index if not exists academic_progress_history_subject_idx on public.academic_progress_history (subject_id);
create index if not exists admin_change_log_actor_idx on public.admin_change_log (actor_user_id);
create index if not exists content_work_items_assignee_idx on public.content_work_items (assignee_user_id);
create index if not exists homework_attachments_file_idx on public.homework_attachments (file_id);
create index if not exists subject_schedule_rules_subject_idx on public.subject_schedule_rules (subject_id);
