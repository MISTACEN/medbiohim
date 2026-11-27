-- Пять бонус-карточек роговицы остались без вариантов: рабочей карточки с тем же
-- препаратом нет, но методичка есть (`epithelium-nonkeratinized-cornea`).
-- Собираем варианты из методичек: верный — эта методичка, три обманки — соседние
-- препараты того же раздела. Формат совпадает с рабочими карточками
-- (`{id,label,correct}`), поэтому проверка ответа не меняется.
--
-- Идемпотентно: только карточки без массива вариантов.

with target as (
  select key, name, section
  from public.preparation_guides
  where key = 'epithelium-nonkeratinized-cornea'
),
distractors as (
  select g.key, g.name
  from public.preparation_guides as g
  join target as t on g.section = t.section
  where g.key <> t.key
  order by g.key
  limit 3
),
options as (
  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object('id', key, 'label', name, 'correct', is_correct)
         ) as value
  from (
    select key, name, true as is_correct from target
    union all
    select key, name, false as is_correct from distractors
  ) as s
)
update public.trainer_feed_cards as b
   set question = pg_catalog.jsonb_build_object(
         'prompt', 'Какой препарат изображён на фотографии?',
         'mode', 'identify',
         'options', (select value from options)
       ),
       preparation = pg_catalog.jsonb_set(
         b.preparation, '{name}', pg_catalog.to_jsonb('Неороговевающий эпителий роговицы'::text)
       ),
       updated_at = pg_catalog.now()
 where b.id like 'feed-prep-bonus-%'
   and b.preparation->>'name' = 'Многослойный плоский неороговевающий (роговица)'
   and pg_catalog.jsonb_typeof(b.question->'options') is distinct from 'array';
