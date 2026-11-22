-- Недельный рейтинг лиги: агрегация очков в SQL вместо выборки событий в память.
--
-- Почему: воркер вытягивал до 20 000 строк `activity_events`, складывал очки в
-- Map, и уже потом брал имена. При росте активности это лишний трафик из Supabase
-- в Worker на каждый промах кэша (TTL 120 с). Здесь считается то же самое одним
-- GROUP BY: веса и окно недели совпадают с KIND_POINTS/weekStartUtc в
-- `workers/api/src/routes/league.ts` — менять их нужно вместе.
--
-- Доступ: только service_role. Наружу очки отдаёт маршрут `/league`, он же
-- решает, что показывать, поэтому клиент не должен вызывать функцию напрямую.
--
-- Если миграция не применена, маршрут считает по-старому (fallback) — рейтинг
-- продолжает работать, просто прежним путём.
--
-- Идемпотентно: повторный прогон пересоздаёт функцию, не падая.

create or replace function public.medbiohim_week_leaderboard(
  p_week_start timestamptz,
  p_limit integer default 50
)
returns table (user_id uuid, name text, points integer)
language sql
stable
security definer
set search_path = public
as $$
  with weights(kind, weight) as (
    values
      ('test_finished', 10),
      ('assignment_updated', 8),
      ('homework_marked', 5),
      ('srs_review', 2),
      ('lecture_opened', 2),
      ('quest_chest', 3),
      ('tutor_message', 1)
  ),
  totals as (
    select e.user_id, sum(w.weight)::integer as points
    from public.activity_events e
    join weights w on w.kind = e.kind
    where e.created_at >= p_week_start
      and e.user_id is not null
    group by e.user_id
    order by points desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  )
  select t.user_id,
         coalesce(nullif(u.display_name, ''), nullif(u.full_name, ''), 'Студент') as name,
         t.points
  from totals t
  left join public.users u on u.id = t.user_id
  order by t.points desc;
$$;

revoke all on function public.medbiohim_week_leaderboard(timestamptz, integer) from public;
revoke all on function public.medbiohim_week_leaderboard(timestamptz, integer) from anon;
revoke all on function public.medbiohim_week_leaderboard(timestamptz, integer) from authenticated;
grant execute on function public.medbiohim_week_leaderboard(timestamptz, integer) to service_role;
