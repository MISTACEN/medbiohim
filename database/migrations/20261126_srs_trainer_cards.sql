-- SRS микропрепаратов: третий источник карточек — методички препаратов.
--
-- Зачем отдельный `source_key`: `source_id` — uuid с FK на `questions(id)`,
-- а препараты идентифицируются текстовым ключом гида (`nerve-myelin` и т.п.).
-- Поэтому у карточек препаратов `source_id` остаётся null, а ключ живёт в
-- `source_key`; уникальность — по (user_id, source_type, source_key).
--
-- Миграция аддитивная: существующие карточки вопросов и личные карточки не
-- затрагиваются, старые значения source_type остаются разрешёнными.

alter table public.srs_cards
  add column if not exists source_key text;

alter table public.srs_cards
  drop constraint if exists srs_cards_source_type_check;

alter table public.srs_cards
  add constraint srs_cards_source_type_check
  check (source_type in ('question', 'personal', 'trainer_card'));

create unique index if not exists srs_cards_user_trainer_uidx
  on public.srs_cards(user_id, source_type, source_key)
  where source_key is not null;

comment on column public.srs_cards.source_key is
  'Стабильный ключ внешнего источника без uuid: ключ методички препарата для source_type = trainer_card.';
