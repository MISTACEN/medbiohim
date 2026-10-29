-- SA4 (PRODUCT-AUDIT-PLAN-2026-10-27): активные сессии и «выйти на других устройствах».
--
-- Supabase хранит refresh-сессии в auth.sessions; схема auth наружу через PostgREST
-- не выставлена. Поэтому доступ к ней идёт только через SECURITY DEFINER функции,
-- которые жёстко ограничены текущим пользователем (auth.uid()) и текущей сессией
-- из claims. Никакого способа посмотреть или закрыть чужую сессию нет.

-- 1. Список сессий текущего пользователя. current — та сессия, из которой пришёл
--    запрос (session_id в JWT claims), её нельзя «завершить» — для неё есть выход.
create or replace function public.medbiohim_user_sessions()
returns table (
  session_id uuid,
  created_at timestamptz,
  last_used_at timestamptz,
  user_agent text,
  ip text,
  aal text,
  is_current boolean
)
language sql
security definer
set search_path = public, auth
as $fn$
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at, s.updated_at, s.created_at) as last_used_at,
    s.user_agent,
    host(s.ip) as ip,
    s.aal,
    s.id = nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc
  limit 50;
$fn$;

-- 2. Завершить одну сессию (кроме текущей). Удаление строки auth.sessions —
--    ровно то, что делает сам GoTrue при выходе: refresh-токен перестаёт работать.
create or replace function public.medbiohim_revoke_session(p_session_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare
  v_current uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_session_id is null then
    raise exception 'session id is required' using errcode = '22023';
  end if;
  if p_session_id = v_current then
    -- Честно: текущую сессию закрывает выход из аккаунта, а не «завершить».
    return json_build_object('revoked', false, 'reason', 'current_session');
  end if;

  delete from auth.sessions s
   where s.id = p_session_id
     and s.user_id = auth.uid();
  get diagnostics v_deleted = row_count;

  return json_build_object('revoked', v_deleted > 0, 'deleted', v_deleted);
end;
$fn$;

-- 3. Завершить все сессии, кроме текущей («выйти на всех других устройствах»).
create or replace function public.medbiohim_revoke_other_sessions()
returns json
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare
  v_current uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from auth.sessions s
   where s.user_id = auth.uid()
     and (v_current is null or s.id <> v_current);
  get diagnostics v_deleted = row_count;

  return json_build_object('revoked', v_deleted, 'kept_current', v_current is not null);
end;
$fn$;

-- Доступ: только аутентифицированным ролям, анониму и public — запрещено.
revoke all on function public.medbiohim_user_sessions() from public, anon;
revoke all on function public.medbiohim_revoke_session(uuid) from public, anon;
revoke all on function public.medbiohim_revoke_other_sessions() from public, anon;

grant execute on function public.medbiohim_user_sessions() to authenticated, service_role;
grant execute on function public.medbiohim_revoke_session(uuid) to authenticated, service_role;
grant execute on function public.medbiohim_revoke_other_sessions() to authenticated, service_role;
