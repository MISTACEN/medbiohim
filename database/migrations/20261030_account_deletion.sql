-- SA6 (PRODUCT-AUDIT-PLAN-2026-10-27): удаление аккаунта с grace-периодом.
--
-- Что здесь есть и чего здесь принципиально нет:
--   1. Таблица public.account_deletion_requests фиксирует НАМЕРЕНИЕ пользователя
--      удалить аккаунт. Это не удаление: строка не стирает ни прогресс, ни карточки,
--      ни сам аккаунт. Реальное удаление из auth.users выполняет служебный процесс
--      под service_role (Supabase Admin API), потому что каскадное удаление данных
--      и сессий — операция администратора, а не клиента.
--   2. RPC для клиента (запрос / отмена / статус). Все три функции security definer,
--      но каждая работает только с auth.uid(): посмотреть или отменить чужой запрос
--      невозможно, потому что параметра «чей запрос» в интерфейсе функции нет.
--   3. Служебные функции для процесса удаления (список просроченных запросов и
--      отметка об исполнении): execute выдан только service_role, клиенту — нет.
--
-- Идемпотентность: create table/index if not exists, create or replace function,
-- drop policy if exists, revoke/grant можно применять повторно.

-- 1. Учёт запросов ---------------------------------------------------------

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  -- Момент, начиная с которого служебный процесс вправе удалить аккаунт.
  scheduled_for timestamptz not null,
  -- null — запрос активен; заполняется отменой пользователя.
  cancelled_at timestamptz,
  -- Необязательная причина: пользовательский текст, не влияет на срок.
  reason text,
  -- Заполняет только служебный процесс после реального удаления аккаунта.
  executed_at timestamptz,
  constraint account_deletion_requests_reason_len
    check (reason is null or char_length(reason) <= 1000),
  constraint account_deletion_requests_grace_window
    check (scheduled_for > requested_at)
);

comment on table public.account_deletion_requests is
  'Запросы на удаление аккаунта с grace-периодом. Строка — намерение, не удаление: исполняет служебный процесс service_role.';
comment on column public.account_deletion_requests.scheduled_for is
  'Дата, после которой служебный процесс удаляет аккаунт (requested_at + grace).';
comment on column public.account_deletion_requests.cancelled_at is
  'Отмена пользователем; NULL — запрос активен.';
comment on column public.account_deletion_requests.executed_at is
  'Ставит только служебный процесс после удаления аккаунта; клиенту не доступно.';

-- Два активных запроса одного пользователя — это ошибка данных, а не дубль.
create unique index if not exists account_deletion_requests_active_uidx
  on public.account_deletion_requests (user_id)
  where cancelled_at is null and executed_at is null;

-- Выборка просроченных запросов для служебного процесса.
create index if not exists account_deletion_requests_due_idx
  on public.account_deletion_requests (scheduled_for)
  where cancelled_at is null and executed_at is null;

alter table public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_requests_select_own on public.account_deletion_requests;
create policy account_deletion_requests_select_own
  on public.account_deletion_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Запись идёт только через RPC ниже: если разрешить insert/update напрямую,
-- клиент сможет сам назначить себе scheduled_for = 'now' и обойти grace-период.
revoke all on public.account_deletion_requests from anon;
revoke insert, update, delete on public.account_deletion_requests from authenticated;
grant select on public.account_deletion_requests to authenticated;
grant select, insert, update, delete on public.account_deletion_requests to service_role;

-- 2. Срок grace — один источник истины ------------------------------------
-- API не считает дату сам: он показывает то, что вернула БД. Поэтому срок
-- задаётся здесь, а не в Worker-роуте.

create or replace function public.medbiohim_account_deletion_grace_days()
returns integer
language sql
immutable
as $fn$
  -- 7 дней: неделя на отмену случайного удаления.
  select 7;
$fn$;

-- 3. Клиентские RPC -------------------------------------------------------

-- 3.1 Запросить удаление. Повторный запрос не создаёт вторую строку.
create or replace function public.medbiohim_request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_user uuid := auth.uid();
  v_grace_days integer := public.medbiohim_account_deletion_grace_days();
  v_existing public.account_deletion_requests;
  v_created public.account_deletion_requests;
begin
  if v_user is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  select * into v_existing
    from public.account_deletion_requests r
   where r.user_id = v_user
     and r.cancelled_at is null
     and r.executed_at is null
   order by r.requested_at desc
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'status', 'already_requested',
      'request_id', v_existing.id,
      'requested_at', v_existing.requested_at,
      'scheduled_for', v_existing.scheduled_for,
      'cancelled_at', v_existing.cancelled_at,
      'grace_days', v_grace_days,
      'days_left', greatest(0, ceil(extract(epoch from (v_existing.scheduled_for - now())) / 86400.0))::integer,
      'execution', 'service_role_only',
      'deletion_executed', false
    );
  end if;

  begin
    insert into public.account_deletion_requests (user_id, requested_at, scheduled_for, reason)
    values (
      v_user,
      now(),
      now() + make_interval(days => v_grace_days),
      nullif(btrim(coalesce(p_reason, '')), '')
    )
    returning * into v_created;
  exception
    when unique_violation then
      -- Параллельный запрос успел первым: отдаём уже созданный, а не 500.
      select * into v_created
        from public.account_deletion_requests r
       where r.user_id = v_user
         and r.cancelled_at is null
         and r.executed_at is null
       order by r.requested_at desc
       limit 1;
      return jsonb_build_object(
        'status', 'already_requested',
        'request_id', v_created.id,
        'requested_at', v_created.requested_at,
        'scheduled_for', v_created.scheduled_for,
        'cancelled_at', v_created.cancelled_at,
        'grace_days', v_grace_days,
        'days_left', greatest(0, ceil(extract(epoch from (v_created.scheduled_for - now())) / 86400.0))::integer,
        'execution', 'service_role_only',
        'deletion_executed', false
      );
  end;

  return jsonb_build_object(
    'status', 'scheduled',
    'request_id', v_created.id,
    'requested_at', v_created.requested_at,
    'scheduled_for', v_created.scheduled_for,
    'cancelled_at', v_created.cancelled_at,
    'grace_days', v_grace_days,
    'days_left', greatest(0, ceil(extract(epoch from (v_created.scheduled_for - now())) / 86400.0))::integer,
    'execution', 'service_role_only',
    'deletion_executed', false
  );
end;
$fn$;

-- 3.2 Отменить запрос. Отменять можно только пока он активен.
create or replace function public.medbiohim_cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_user uuid := auth.uid();
  v_grace_days integer := public.medbiohim_account_deletion_grace_days();
  v_cancelled public.account_deletion_requests;
  v_latest public.account_deletion_requests;
begin
  if v_user is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  update public.account_deletion_requests r
     set cancelled_at = now()
   where r.id = (
           select a.id
             from public.account_deletion_requests a
            where a.user_id = v_user
              and a.cancelled_at is null
              and a.executed_at is null
            order by a.requested_at desc
            limit 1
         )
  returning * into v_cancelled;

  if v_cancelled.id is not null then
    return jsonb_build_object(
      'status', 'cancelled',
      'cancelled', true,
      'request_id', v_cancelled.id,
      'requested_at', v_cancelled.requested_at,
      'scheduled_for', v_cancelled.scheduled_for,
      'cancelled_at', v_cancelled.cancelled_at,
      'grace_days', v_grace_days,
      'days_left', null,
      'execution', 'service_role_only',
      'deletion_executed', false
    );
  end if;

  -- Отменять нечего. Если аккаунт уже исполнен службой — говорим это прямо,
  -- иначе пользователь решит, что отмена сработала.
  select * into v_latest
    from public.account_deletion_requests r
   where r.user_id = v_user
   order by r.requested_at desc
   limit 1;

  if v_latest.id is not null and v_latest.executed_at is not null then
    return jsonb_build_object(
      'status', 'executed',
      'cancelled', false,
      'request_id', v_latest.id,
      'requested_at', v_latest.requested_at,
      'scheduled_for', v_latest.scheduled_for,
      'cancelled_at', v_latest.cancelled_at,
      'executed_at', v_latest.executed_at,
      'grace_days', v_grace_days,
      'days_left', null,
      'execution', 'service_role_only',
      'deletion_executed', true
    );
  end if;

  return jsonb_build_object(
    'status', 'not_requested',
    'cancelled', false,
    'request_id', null,
    'requested_at', null,
    'scheduled_for', null,
    'cancelled_at', null,
    'grace_days', v_grace_days,
    'days_left', null,
    'execution', 'service_role_only',
    'deletion_executed', false
  );
end;
$fn$;

-- 3.3 Статус последнего запроса текущего пользователя.
create or replace function public.medbiohim_account_deletion_status()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_user uuid := auth.uid();
  v_grace_days integer := public.medbiohim_account_deletion_grace_days();
  v_latest public.account_deletion_requests;
  v_status text;
begin
  if v_user is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  select * into v_latest
    from public.account_deletion_requests r
   where r.user_id = v_user
   order by r.requested_at desc
   limit 1;

  if v_latest.id is null then
    return jsonb_build_object(
      'status', 'none',
      'request_id', null,
      'requested_at', null,
      'scheduled_for', null,
      'cancelled_at', null,
      'executed_at', null,
      'grace_days', v_grace_days,
      'days_left', null,
      'execution', 'service_role_only',
      'deletion_executed', false
    );
  end if;

  v_status := case
    when v_latest.executed_at is not null then 'executed'
    when v_latest.cancelled_at is not null then 'cancelled'
    else 'scheduled'
  end;

  return jsonb_build_object(
    'status', v_status,
    'request_id', v_latest.id,
    'requested_at', v_latest.requested_at,
    'scheduled_for', v_latest.scheduled_for,
    'cancelled_at', v_latest.cancelled_at,
    'executed_at', v_latest.executed_at,
    'grace_days', v_grace_days,
    'days_left', case
      when v_status = 'scheduled'
        then greatest(0, ceil(extract(epoch from (v_latest.scheduled_for - now())) / 86400.0))::integer
      else null
    end,
    'execution', 'service_role_only',
    'deletion_executed', v_status = 'executed'
  );
end;
$fn$;

-- 4. Служебный путь удаления (service_role only) --------------------------
-- Клиент не может вызвать эти функции: execute выдан только service_role.
-- Сам процесс удаления (Supabase Admin API → deleteUser → каскад) вызывается
-- вне SQL и вне клиентского API.

create or replace function public.medbiohim_due_account_deletions(p_limit integer default 100)
returns table (
  request_id uuid,
  user_id uuid,
  requested_at timestamptz,
  scheduled_for timestamptz
)
language sql
security definer
set search_path = public, auth, pg_temp
as $fn$
  select r.id, r.user_id, r.requested_at, r.scheduled_for
    from public.account_deletion_requests r
   where r.cancelled_at is null
     and r.executed_at is null
     and r.scheduled_for <= now()
   order by r.scheduled_for asc
   limit greatest(1, least(coalesce(p_limit, 100), 1000));
$fn$;

create or replace function public.medbiohim_mark_account_deletion_executed(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_row public.account_deletion_requests;
begin
  if p_request_id is null then
    raise exception 'request id is required' using errcode = '22023';
  end if;

  update public.account_deletion_requests r
     set executed_at = now()
   where r.id = p_request_id
     and r.cancelled_at is null
     and r.executed_at is null
  returning * into v_row;

  if v_row.id is null then
    -- Уже отменён или уже исполнен: повторная отметка не должна врать об успехе.
    return jsonb_build_object('status', 'not_updated', 'updated', false);
  end if;

  return jsonb_build_object(
    'status', 'executed',
    'updated', true,
    'request_id', v_row.id,
    'user_id', v_row.user_id,
    'executed_at', v_row.executed_at
  );
end;
$fn$;

-- 5. Права -----------------------------------------------------------------

revoke all on function public.medbiohim_account_deletion_grace_days() from public, anon;
grant execute on function public.medbiohim_account_deletion_grace_days() to authenticated, service_role;

revoke all on function public.medbiohim_request_account_deletion(text) from public, anon;
grant execute on function public.medbiohim_request_account_deletion(text) to authenticated, service_role;

revoke all on function public.medbiohim_cancel_account_deletion() from public, anon;
grant execute on function public.medbiohim_cancel_account_deletion() to authenticated, service_role;

revoke all on function public.medbiohim_account_deletion_status() from public, anon;
grant execute on function public.medbiohim_account_deletion_status() to authenticated, service_role;

-- Клиенту эти две функции недоступны даже с валидным access-токеном.
revoke all on function public.medbiohim_due_account_deletions(integer) from public, anon, authenticated;
grant execute on function public.medbiohim_due_account_deletions(integer) to service_role;

revoke all on function public.medbiohim_mark_account_deletion_executed(uuid) from public, anon, authenticated;
grant execute on function public.medbiohim_mark_account_deletion_executed(uuid) to service_role;
