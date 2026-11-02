-- 2026-11-02 · Блок 1 + ROLES-AND-MODULES: структурные вопросы от студента.
--
-- Студент создаёт тест в Workshop (контур модерации), модератор конвертирует
-- в банк (см. 20261102_workshop_question_conversion.sql). Чтобы модератору не
-- собирать варианты с нуля, вопрос Workshop может нести структурный черновик:
-- options (label/correct/image_file_id) и эталон ответа.
--
-- kind='lecture' открывает путь «лекция в свободном редакторе у студента»
-- (ROLES-AND-MODULES, направление «свои лекции»); редактор — следующий шаг.

alter table public.workshop_item_questions
  add column if not exists options jsonb;
alter table public.workshop_item_questions
  add column if not exists answer text;

comment on column public.workshop_item_questions.options is
  'Черновик вариантов от автора: [{label, correct, image_file_id?}]. Конвертация сеется отсюда, публикация только после ручной сверки модератора.';
comment on column public.workshop_item_questions.answer is
  'Эталон ответа автора для открытых вопросов (черновик).';

do $$ begin
  alter table public.workshop_items drop constraint workshop_items_kind_check;
exception when undefined_object then null; end $$;

alter table public.workshop_items
  add constraint workshop_items_kind_check
  check (kind in ('photo_lecture', 'notes', 'test_questions', 'pdf', 'lecture', 'other'));
