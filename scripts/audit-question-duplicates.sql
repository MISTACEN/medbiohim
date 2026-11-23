-- Аудит повторов вопросов в банке Supabase. ТОЛЬКО ЧТЕНИЕ.
--
-- Зачем: импорт методичек и конспектов приносит один вопрос дважды — разные id,
-- одинаковый текст, отличается регистр, знак в конце или перенос слова из PDF
-- («называ-ется» / «называется»). Студент видит вопрос дважды.
--
-- Правило сравнения (v2, 2026-11-23):
--   * ё → е, регистр, пробелы и пунктуация не различают вопросы;
--   * дефис ВНУТРИ слова снимается: перенос из PDF — не различие;
--   * ключ обрезается btrim: иначе точка в конце даёт другой ключ;
--   * вопросы-подписи к фотографиям исключены: «Какой препарат изображён на
--     фотографии?» повторяется у разных препаратов, совпадают текст, ответ и
--     варианты, различает только картинка.
--
-- "Активный" вопрос = is_published and archived_at is null. Отчёт 2026-11-23
-- считал активными все строки с archived_at is null: в гистологии это 1320
-- вместо 1220, потому что в них входят 100 неопубликованных черновиков.
--
-- Чистку выполняет scripts/apply-question-dedup.mjs (снятие публикации, лог и
-- откат). Здесь — те же запросы для SQL-редактора Supabase.

-- 1. Группы одинаковых формулировок.
with normalised as (
  select
    q.id,
    q.subject_id,
    q.text,
    btrim(lower(regexp_replace(
      replace(regexp_replace(coalesce(q.text, ''), '([0-9a-zA-Zа-яА-ЯёЁ])-([0-9a-zA-Zа-яА-ЯёЁ])', '\1\2', 'g'), 'ё', 'е'),
      '[^0-9a-zA-Zа-яА-Я]+', ' ', 'g'))) as key
  from questions q
  where q.archived_at is null
    and q.is_published
    and length(btrim(coalesce(q.text, ''))) > 12
    and lower(coalesce(q.text, '')) not like '%изображен%'
    and lower(coalesce(q.text, '')) not like '%фотографи%'
    and lower(coalesce(q.text, '')) not like '%электронограмм%'
    and lower(coalesce(q.text, '')) not like '%на снимке%'
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

-- 2. По предметам: сколько строк лишние.
with normalised as (
  select
    q.subject_id,
    btrim(lower(regexp_replace(
      replace(regexp_replace(coalesce(q.text, ''), '([0-9a-zA-Zа-яА-ЯёЁ])-([0-9a-zA-Zа-яА-ЯёЁ])', '\1\2', 'g'), 'ё', 'е'),
      '[^0-9a-zA-Zа-яА-Я]+', ' ', 'g'))) as key
  from questions q
  where q.archived_at is null and q.is_published
    and length(btrim(coalesce(q.text, ''))) > 12
    and lower(coalesce(q.text, '')) not like '%изображен%'
    and lower(coalesce(q.text, '')) not like '%фотографи%'
    and lower(coalesce(q.text, '')) not like '%электронограмм%'
    and lower(coalesce(q.text, '')) not like '%на снимке%'
)
select
  s.slug,
  count(*) filter (where n.copies > 1) as rows_in_duplicate_groups,
  sum(n.copies - 1) filter (where n.copies > 1) as extra_rows
from (
  select subject_id, key, count(*) as copies
  from normalised
  group by subject_id, key
) n
join subjects s on s.id = n.subject_id
where n.copies > 1
group by s.slug
order by extra_rows desc;

-- 3. Состояние после чистки 2026-11-23 (полных дубликатов не осталось).
--    Биология 475 → 428, органическая химия 261 → 257,
--    гистология 1220 → 1202, физиология 3089 → 3084 (+1 строка методички в архиве).
select count(*) as full_duplicate_groups
from (
  select q.subject_id,
         btrim(lower(regexp_replace(
           replace(regexp_replace(coalesce(q.text, ''), '([0-9a-zA-Zа-яА-ЯёЁ])-([0-9a-zA-Zа-яА-ЯёЁ])', '\1\2', 'g'), 'ё', 'е'),
           '[^0-9a-zA-Zа-яА-Я]+', ' ', 'g'))) as key,
         q.type, coalesce(q.answer, '') as answer,
         coalesce((select string_agg(coalesce(o->>'label','') || ':' || coalesce(o->>'correct','f'), '|'
                                     order by coalesce(o->>'label',''))
                     from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o), '') as opts
  from questions q
  where q.is_published and q.archived_at is null
) g
group by subject_id, key, type, answer, opts
having count(*) > 1;

-- 4. Почему НЕ delete: внешние ключи questions (test_answers,
--    user_question_states, test_preparation_results, test_questions,
--    question_comments) объявлены ON DELETE CASCADE — удаление строки стирает
--    ответы и прогресс студентов. Чистка выполняется снятием публикации:
--
--    update questions set is_published = false where id in (...);
--
--    После проверки банк не теряет вопрос: если копия входила в тест, которого
--    нет у канонической записи, канон сначала добавляется в этот тест
--    (scripts/apply-question-dedup.mjs --carry).
