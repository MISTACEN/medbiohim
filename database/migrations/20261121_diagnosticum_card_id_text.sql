-- Починка прод-бага диагностикума (найдено ролевой приёмкой 2026-11-21):
-- trainer_feed_cards.id — text ("feed-prep-..."), а diagnosticum_attempts.card_id
-- был uuid. Вставка /attempt с реальным id карточки падала с
-- "invalid input syntax for type uuid" → 503 DB_UNAVAILABLE на /diagnosticum/start
-- (на моках worker-тестов не проявлялось — ловится только на живой БД).
--
-- Тип приведён к text; id нужен строкой для deep-link повторения ?cards=... .
-- Файл идемпотентен: повторный ALTER ... TYPE text безвреден.

alter table public.diagnosticum_attempts
  alter column card_id type text using card_id::text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.diagnosticum_attempts'::regclass
      and conname = 'diagnosticum_attempts_card_id_fkey'
  ) then
    alter table public.diagnosticum_attempts
      add constraint diagnosticum_attempts_card_id_fkey
      foreign key (card_id) references public.trainer_feed_cards(id) on delete set null;
  end if;
end $$;
