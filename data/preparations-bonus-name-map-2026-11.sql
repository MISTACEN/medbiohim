-- Часть бонус-карточек названа по структуре («Мерцательный эпителий (трахея)»),
-- а рабочая карточка того же препарата — по органу («Трахея»). Точное сравнение
-- имён их не связывает, поэтому связываем явной картой.
--
-- Заодно карточка получает рабочее имя препарата: иначе в атласе и статистике
-- один и тот же препарат назывался бы по-разному.
--
-- Идемпотентно: трогаем только бонус-карточки без массива вариантов.
-- Роговица сюда не входит: рабочей карточки с вариантами для неё нет,
-- это отдельное решение по контенту.

with pairs(bonus_name, source_name) as (
  values
    ('Мерцательный эпителий (трахея)', 'Трахея'),
    ('Многослойный переходный (мочевой пузырь)', 'Мочевой пузырь'),
    ('Цилиндрический эпителий (тонкая кишка)', 'Тонкая кишка'),
    ('Эластический хрящ', 'Хрящ.тк. Эласт. хрящ')
),
source as (
  select distinct on (m.preparation->>'name')
    m.preparation->>'name' as name,
    m.question
  from public.trainer_feed_cards as m
  where m.is_published
    and not coalesce(m.is_archived, false)
    and m.id not like 'feed-prep-bonus-%'
    and jsonb_typeof(m.question->'options') = 'array'
    and m.preparation->>'name' in (select source_name from pairs)
  order by m.preparation->>'name', m.updated_at desc nulls last
)
update public.trainer_feed_cards as b
   set question = source.question,
       preparation = jsonb_set(b.preparation, '{name}', to_jsonb(source.name)),
       updated_at = now()
  from pairs
  join source on source.name = pairs.source_name
 where b.id like 'feed-prep-bonus-%'
   and b.preparation->>'name' = pairs.bonus_name
   and jsonb_typeof(b.question->'options') is distinct from 'array';
