-- Лабораторные: схема labs не отдана через PostgREST, поэтому API Worker
-- (workers/api/src/routes/labs.ts) не может её прочитать и страница /labs
-- показывает «раздел готовится». Эта миграция публикует минимальные
-- read-only вьюхи в public и выдаёт SELECT авторизованным пользователям.
--
-- Аддитивная миграция: данные не меняются, исходные таблицы остаются
-- источником истины. Запись сессий/ответов идёт в labs.* серверным клиентом,
-- поэтому вьюхи нужны только для чтения каталога шаблонов и сессий.
--
-- ВАЖНО: применить в production после явного разрешения владельца.

create or replace view public.lab_templates_public as
  select id, title, subject_area, estimated_duration_min, difficulty_level,
         prerequisite_lab_id, is_published, created_at, updated_at
  from labs.lab_templates
  where is_published = true;

create or replace view public.lab_sessions_public as
  select id, user_id, template_id, lab_type, lab_name, status, progress_pct,
         started_at, completed_at, last_updated_at
  from labs.lab_sessions;

create or replace view public.laboratory_checkpoints_public as
  select id, session_id, checkpoint_order, title, checkpoint_type, question_flow
  from labs.laboratory_checkpoints;

create or replace view public.laboratory_results_public as
  select id, checkpoint_id, user_id, score, grading_status, submitted_at, updated_at
  from labs.laboratory_results;

grant select on public.lab_templates_public to authenticated;
grant select on public.lab_sessions_public to authenticated;
grant select on public.laboratory_checkpoints_public to authenticated;
grant select on public.laboratory_results_public to authenticated;
