-- 2026-11-15 · Журнал ИИ-вызовов.
--
-- До этой миграции 11 точек вызова ИИ (тьютор, карточки, конспект с пропусками,
-- сортировка Telegram, генерация лекций, диагностика) не оставляли ни одной
-- записи: было непонятно, сколько тратится на провайдеров и что деградировало.
-- Пишет только service_role (воркер): у браузерных ролей нет ни политик, ни
-- грантов, поэтому журнал нельзя ни прочитать, ни подделать через API.
--
-- ВАЖНО: миграция не применена к живой Supabase. Применять вручную после
-- проверки в staging, как и остальные миграции этого репозитория.

create table if not exists public.ai_call_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Маршрут API, из которого пришёл вызов: «POST /ai/chat».
  route text not null,
  -- Функция платформы: tutor_chat, lecture_cloze, card_pack, lecture_generate,
  -- telegram_sort, diagnostics. По ней считаются суточные лимиты.
  feature text not null,
  provider text,
  model text,
  -- Задержка всего логического вызова, включая фолбэки между провайдерами.
  latency_ms integer,
  -- ok — ответ получен; error — провайдеры отказали; rate_limited — вызов
  -- отклонён суточной квотой и до провайдера не дошёл.
  outcome text not null check (outcome in ('ok', 'error', 'rate_limited')),
  error_code text,
  -- Владелец запроса. Для бота и админских проверок может быть пусто.
  user_id uuid references auth.users(id) on delete set null,
  subject_slug text,
  request_id text,
  -- Попытки по провайдерам (provider, outcome, status, ms) — видно, кто отказал.
  attempts jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.ai_call_log is
  'Журнал вызовов ИИ: маршрут, провайдер, модель, задержка, результат. Пишет только service_role.';

create index if not exists ai_call_log_created_idx
  on public.ai_call_log (created_at desc);
create index if not exists ai_call_log_feature_created_idx
  on public.ai_call_log (feature, created_at desc);
create index if not exists ai_call_log_provider_created_idx
  on public.ai_call_log (provider, created_at desc);
create index if not exists ai_call_log_user_created_idx
  on public.ai_call_log (user_id, created_at desc);
create index if not exists ai_call_log_route_created_idx
  on public.ai_call_log (route, created_at desc);

alter table public.ai_call_log enable row level security;

-- Политик нет намеренно: журнал читается и пишется только служебным клиентом.
revoke all on public.ai_call_log from anon, authenticated;
grant select, insert on public.ai_call_log to service_role;

-- Сводка для админки: одна поездка в БД вместо выгрузки тысяч строк в воркер.
-- security definer нужен, чтобы агрегировать таблицу без RLS-политик, поэтому
-- выполнение разрешено только service_role (маршрут дополнительно требует admin).
create or replace function public.medbiohim_ai_call_stats(p_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select created_at, feature, provider, model, route, outcome, latency_ms
    from public.ai_call_log
    where created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
  ),
  by_day as (
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as key,
           count(*)::int as calls,
           count(*) filter (where outcome = 'ok')::int as ok,
           count(*) filter (where outcome = 'error')::int as errors,
           count(*) filter (where outcome = 'rate_limited')::int as rate_limited,
           coalesce(round(avg(latency_ms))::int, 0) as avg_latency_ms,
           coalesce(percentile_disc(0.95) within group (order by latency_ms)::int, 0) as p95_latency_ms
    from scope group by 1 order by 1
  ),
  by_feature as (
    select feature as key,
           count(*)::int as calls,
           count(*) filter (where outcome = 'ok')::int as ok,
           count(*) filter (where outcome = 'error')::int as errors,
           count(*) filter (where outcome = 'rate_limited')::int as rate_limited,
           coalesce(round(avg(latency_ms))::int, 0) as avg_latency_ms,
           coalesce(percentile_disc(0.95) within group (order by latency_ms)::int, 0) as p95_latency_ms
    from scope group by 1 order by calls desc
  ),
  by_provider as (
    select coalesce(provider, 'unknown') as key,
           count(*)::int as calls,
           count(*) filter (where outcome = 'ok')::int as ok,
           count(*) filter (where outcome = 'error')::int as errors,
           count(*) filter (where outcome = 'rate_limited')::int as rate_limited,
           coalesce(round(avg(latency_ms))::int, 0) as avg_latency_ms,
           coalesce(percentile_disc(0.95) within group (order by latency_ms)::int, 0) as p95_latency_ms
    from scope group by 1 order by calls desc
  ),
  by_model as (
    select coalesce(model, 'unknown') as key,
           count(*)::int as calls,
           count(*) filter (where outcome = 'ok')::int as ok,
           count(*) filter (where outcome = 'error')::int as errors,
           count(*) filter (where outcome = 'rate_limited')::int as rate_limited,
           coalesce(round(avg(latency_ms))::int, 0) as avg_latency_ms,
           coalesce(percentile_disc(0.95) within group (order by latency_ms)::int, 0) as p95_latency_ms
    from scope group by 1 order by calls desc
  ),
  by_route as (
    select route as key,
           count(*)::int as calls,
           count(*) filter (where outcome = 'ok')::int as ok,
           count(*) filter (where outcome = 'error')::int as errors,
           count(*) filter (where outcome = 'rate_limited')::int as rate_limited,
           coalesce(round(avg(latency_ms))::int, 0) as avg_latency_ms,
           coalesce(percentile_disc(0.95) within group (order by latency_ms)::int, 0) as p95_latency_ms
    from scope group by 1 order by calls desc
  )
  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 7), 90)),
    'totals', (
      select jsonb_build_object(
        'calls', count(*),
        'ok', count(*) filter (where outcome = 'ok'),
        'errors', count(*) filter (where outcome = 'error'),
        'rate_limited', count(*) filter (where outcome = 'rate_limited'),
        'avg_latency_ms', coalesce(round(avg(latency_ms))::int, 0),
        'p95_latency_ms', coalesce(percentile_disc(0.95) within group (order by latency_ms)::int, 0)
      ) from scope
    ),
    'by_day', coalesce((select jsonb_agg(to_jsonb(by_day)) from by_day), '[]'::jsonb),
    'by_feature', coalesce((select jsonb_agg(to_jsonb(by_feature)) from by_feature), '[]'::jsonb),
    'by_provider', coalesce((select jsonb_agg(to_jsonb(by_provider)) from by_provider), '[]'::jsonb),
    'by_model', coalesce((select jsonb_agg(to_jsonb(by_model)) from by_model), '[]'::jsonb),
    'by_route', coalesce((select jsonb_agg(to_jsonb(by_route)) from by_route), '[]'::jsonb)
  );
$$;

revoke all on function public.medbiohim_ai_call_stats(integer) from public;
revoke all on function public.medbiohim_ai_call_stats(integer) from anon, authenticated;
grant execute on function public.medbiohim_ai_call_stats(integer) to service_role;
