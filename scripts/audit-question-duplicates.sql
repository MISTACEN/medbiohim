-- Аудит повторов вопросов в банке Supabase. ТОЛЬКО ЧТЕНИЕ: ничего не меняет.
--
-- Зачем: импорт методичек приносит один вопрос дважды — разные id, одинаковый
-- текст, отличается лишь число подчёркиваний в пропуске, регистр или точка в
-- конце. Студент видит вопрос дважды и получает за него двойной вес.
--
-- ВАЖНО (проверено на данных): у гистологии 178 вопросов «Какой препарат
-- изображён на фотографии?» совпадают и текстом, и ответом, и вариантами, а
-- различает их только картинка. Поэтому такие формулировки из аудита исключены:
-- склейка по тексту выбросила бы реальные задания.
--
-- Запуск: SQL-редактор Supabase. Результат — пары/группы копий для ручной чистки.

-- 1. Группы одинаковых формулировок.
with normalised as (
  select
    q.id,
    q.subject_id,
    q.text,
    lower(regexp_replace(coalesce(q.text, ''), '[^0-9a-zA-Zа-яА-ЯёЁ]+', ' ', 'g')) as key
  from questions q
  where q.archived_at is null
    and q.is_published
    and length(btrim(coalesce(q.text, ''))) > 12
    -- фото-вопросы и электронограммы: одна подпись, разные препараты
    and lower(coalesce(q.text, '')) not like '%изображен%'
    and lower(coalesce(q.text, '')) not like '%фотографи%'
    and lower(coalesce(q.text, '')) not like '%электронограмм%'
)
select
  key,
  count(*) as copies,
  min(text) as sample,
  array_agg(id order by id) as question_ids
from normalised
group by key
having count(*) > 1
order by copies desc, sample
limit 200;

-- 2. По предметам: сколько строк лишние (для оценки объёма чистки).
with normalised as (
  select
    q.subject_id,
    lower(regexp_replace(coalesce(q.text, ''), '[^0-9a-zA-Zа-яА-ЯёЁ]+', ' ', 'g')) as key
  from questions q
  where q.archived_at is null
    and q.is_published
    and length(btrim(coalesce(q.text, ''))) > 12
    and lower(coalesce(q.text, '')) not like '%изображен%'
    and lower(coalesce(q.text, '')) not like '%фотографи%'
    and lower(coalesce(q.text, '')) not like '%электронограмм%'
)
select
  s.slug,
  s.name,
  count(*) filter (where n.copies > 1) as rows_in_duplicate_groups,
  sum(n.copies - 1) filter (where n.copies > 1) as extra_rows
from (
  select subject_id, key, count(*) as copies
  from normalised
  group by subject_id, key
) n
join subjects s on s.id = n.subject_id
where n.copies > 1
group by s.slug, s.name
order by extra_rows desc;

-- 3. Найденные вручную копии по физиологии (аудит 2026-11-22, 3089 вопросов).
--    Пары: одинаковый вопрос под двумя id; вторая строка каждой пары — лишняя.
--      b9cb6e81-c074-4887-acf0-2719387f2a3e  ↔  d5695897-f4f3-4f5e-aa24-75ac2d882330
--      e21c72af-c0c8-4ea9-ae3b-62469ea21d0d  ↔  ca9f7e4f-0287-4167-9bc4-0ff468d9da12
--      2c83989c-48e3-4ea0-9a4b-f5ec87ed0e95  ↔  5b62583b-0ff6-4ccc-81ea-aaf85858aef9
--    И строка-цель из методички, попавшая в банк как вопрос (удалить обе копии):
--      e9e29ab5-b7a4-427e-acfa-b06af6b94616, 6f9342f2-e3a9-4268-90e8-fdf6faffe4ed
select id, subject_id, topic_id, type, left(text, 90) as text
from questions
where id in (
  'b9cb6e81-c074-4887-acf0-2719387f2a3e',
  'd5695897-f4f3-4f5e-aa24-75ac2d882330',
  'e21c72af-c0c8-4ea9-ae3b-62469ea21d0d',
  'ca9f7e4f-0287-4167-9bc4-0ff468d9da12',
  '2c83989c-48e3-4ea0-9a4b-f5ec87ed0e95',
  '5b62583b-0ff6-4ccc-81ea-aaf85858aef9',
  'e9e29ab5-b7a4-427e-acfa-b06af6b94616',
  '6f9342f2-e3a9-4268-90e8-fdf6faffe4ed'
)
order by text;

-- 4. Шаблон чистки (раскомментировать после проверки пункта 3, в транзакции).
-- begin;
-- delete from test_questions where question_id in ('d5695897-…', 'ca9f7e4f-…', '5b62583b-…');
-- delete from questions where id in (
--   'd5695897-f4f3-4f5e-aa24-75ac2d882330',
--   'ca9f7e4f-0287-4167-9bc4-0ff468d9da12',
--   '5b62583b-0ff6-4ccc-81ea-aaf85858aef9',
--   'e9e29ab5-b7a4-427e-acfa-b06af6b94616',
--   '6f9342f2-e3a9-4268-90e8-fdf6faffe4ed'
-- );
-- commit;
