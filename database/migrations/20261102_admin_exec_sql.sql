-- 2026-11-02 · RPC для SQL-консоли админки (страница «База данных / SQL»).
--
-- Воркер (`workers/api/src/routes/admin-database.ts`, POST /admin/database/supabase_primary/sql)
-- вызывает эту функцию service-role ключом ТОЛЬКО после проверки роли администратора
-- (`gateAdmin`). Без функции консоль отвечает 503 SQL_RPC_MISSING — так и было на проде.
--
-- Права: EXECUTE только у service_role. anon/authenticated и PUBLIC отозваны, чтобы
-- функция не стала публичным SQL-окном через PostgREST. Владелец — postgres, поэтому
-- консоль может выполнять и DDL (изменение схемы), что и обещает интерфейс.
--
-- Идемпотентно: повторный запуск пересоздаёт функцию и права.

create or replace function public.admin_exec_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  q text := btrim(coalesce(query, ''));
  result jsonb;
  affected bigint;
begin
  if q = '' then
    raise exception 'query is required' using errcode = '22023';
  end if;

  -- Сначала как SELECT: возвращаем массив строк в JSON (консоль рендерит таблицу).
  begin
    execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || regexp_replace(q, ';+\s*$', '') || ') t'
      into result;
    return result;
  exception
    when syntax_error or feature_not_supported or insufficient_privilege then
      -- Не SELECT (DDL/DML/EXPLAIN/SHOW): выполняем как есть и отдаём число строк.
      execute q;
      get diagnostics affected = row_count;
      return jsonb_build_object('command', 'ok', 'rowCount', affected);
  end;
end
$fn$;

revoke all on function public.admin_exec_sql(text) from public;
revoke all on function public.admin_exec_sql(text) from anon;
revoke all on function public.admin_exec_sql(text) from authenticated;
grant execute on function public.admin_exec_sql(text) to service_role;

comment on function public.admin_exec_sql(text) is
  'SQL-консоль админки: выполняет запрос от имени владельца. Вызывается только воркером с service-role после проверки роли администратора; анонимным и обычным пользователям EXECUTE запрещён.';
