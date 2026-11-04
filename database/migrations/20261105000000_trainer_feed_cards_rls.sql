-- MEDBIOHIM: воспроизводимая RLS-миграция для trainer_feed_cards.
--
-- Контекст (аудит 2026-11-05): RLS на trainer_feed_cards был включён вживую,
-- но соответствующая миграция в репозитории отсутствовала — расхождение
-- схемы в БД и репо. supabase/migrations/20261104140959_trainer_feed_cards_search_grants.sql
-- ссылается на «existing authenticated SELECT policy restricts rows to published cards»,
-- однако ни одна миграция эту политику не создавала.
--
-- Миграция идемпотентна и безопасна для повторного запуска:
--  * enable RLS — no-op, если уже включён;
--  * политика создаётся только если на таблице ещё нет ни одной политики
--    (чтобы не менять поведение живой политики с другим именем).
--
-- Обратимость: alter table ... disable row level security;
-- (не рекомендуется: политика остаётся, но таблица снова открыта для владельца роли).

-- 1) RLS обязан быть включён: без него GRANT-ы из 20261104140959 открывают
--    весь столбец question (с answer-key) через Data API.
alter table public.trainer_feed_cards enable row level security;

-- 2) Политика чтения только опубликованных карточек для authenticated.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trainer_feed_cards'
  ) then
    create policy trainer_feed_cards_select_published
      on public.trainer_feed_cards
      for select
      to authenticated
      using (is_published = true);
  end if;
end $$;

-- service_role обходит RLS и продолжает использоваться серверными фолбэками
-- (workers/api/src/routes/trainers.ts), изменений для Worker нет.
