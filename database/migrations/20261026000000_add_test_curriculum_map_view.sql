-- Карта предмета для меню тестов: предмет → раздел (модуль) → тема занятия.
--
-- `/api/v1/tests/curriculum-map` (workers/api/src/routes/tests.ts) читает view
-- `test_curriculum_map`, но самой view в базе не было: запрос падал, роут молча
-- отдавал `{ ok: true, items: [] }`, и фронтенд (TestsHub) не мог сгруппировать
-- тесты по темам — все банки складывались в один блок «Банки вопросов».
--
-- Форма строки совпадает с тем, что ожидает TestsHub:
--   { subject_id, subject_name, unclassified_questions,
--     modules: [{ module_id, title, order_index,
--                 topics: [{ topic_id, title, order_index,
--                            question_count, test_count,
--                            planned_date, is_extra }] }] }
-- planned_date / is_extra пока не хранятся в topics и отдаются как null/false.
--
-- Представление читается по одному разу на предмет, поэтому счётчики считаются
-- коррелированными подзапросами: индексы по questions(topic_id) и tests(topic_id)
-- держат это дешёвым, а PostgREST не обрезает агрегаты по max-rows.

create or replace view public.test_curriculum_map as
with module_tree as (
  select
    m.subject_id,
    m.id as module_id,
    m.title,
    m.order_index,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'topic_id', t.id,
          'title', t.title,
          'order_index', t.order_index,
          'question_count', (
            select count(*) from public.questions q
            where q.topic_id = t.id and q.is_published and q.archived_at is null
          ),
          'test_count', (
            select count(*) from public.tests te
            where te.topic_id = t.id and te.is_published and te.archived_at is null
          ),
          'planned_date', null,
          'is_extra', false
        )
        order by t.order_index nulls last, t.title
      ) filter (where t.id is not null),
      '[]'::jsonb
    ) as topics
  from public.modules m
  left join public.topics t on t.module_id = m.id and t.is_published
  where m.is_published
  group by m.subject_id, m.id, m.title, m.order_index
)
select
  s.id as subject_id,
  s.name as subject_name,
  (
    select count(*) from public.questions q
    where q.subject_id = s.id and q.is_published and q.archived_at is null and q.topic_id is null
  ) as unclassified_questions,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'module_id', mt.module_id,
          'title', mt.title,
          'order_index', mt.order_index,
          'topics', mt.topics
        )
        order by mt.order_index nulls last, mt.title
      )
      from module_tree mt
      where mt.subject_id = s.id
    ),
    '[]'::jsonb
  ) as modules
from public.subjects s
where s.is_active;

comment on view public.test_curriculum_map is
  'Меню тестов: предмет → раздел → тема занятия со счётчиками вопросов и тестов.';
