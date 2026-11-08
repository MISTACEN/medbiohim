-- MEDBIOHIM 8.39–8.42: ручная проверка открытых ответов преподавателем.
-- Преподаватель подтверждает/опровергает открытый ответ: статус 'manual',
-- вердикт пишется в is_correct/score, комментарий — в grading_feedback.

alter table public.test_answers
  drop constraint if exists test_answers_grading_status_check;
alter table public.test_answers
  add constraint test_answers_grading_status_check
  check (grading_status in ('deterministic','ai','pending','error','manual'));

alter table public.test_preparation_results
  drop constraint if exists test_preparation_results_grading_status_check;
alter table public.test_preparation_results
  add constraint test_preparation_results_grading_status_check
  check (grading_status in ('deterministic','ai','pending','error','manual'));
