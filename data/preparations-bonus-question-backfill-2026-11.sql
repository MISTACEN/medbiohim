-- Бонус-карточки получили пустой `question` при импорте: снимок есть
-- (`preparation.imageStatic`), а вариантов ответа нет, поэтому карточка была
-- нерешаемой и выпадала из ленты.
--
-- Заполняем `question` из одноимённой обычной карточки: препарат тот же, а
-- ключи вариантов — это ключи методичек, а не id карточек, поэтому они не
-- зависят от снимка. Никаких новых сущностей не заводим.
--
-- Идемпотентно: обновляются только бонус-карточки без массива вариантов.

with source as (
  select distinct on (m.preparation->>'name')
    m.preparation->>'name' as name,
    m.question
  from public.trainer_feed_cards as m
  where m.is_published
    and not coalesce(m.is_archived, false)
    and m.id not like 'feed-prep-bonus-%'
    and jsonb_typeof(m.question->'options') = 'array'
    and coalesce(m.preparation->>'name', '') <> ''
  order by m.preparation->>'name', m.updated_at desc nulls last
)
update public.trainer_feed_cards as b
   set question = source.question,
       updated_at = now()
  from source
 where b.id like 'feed-prep-bonus-%'
   and b.preparation->>'name' = source.name
   and jsonb_typeof(b.question->'options') is distinct from 'array';
