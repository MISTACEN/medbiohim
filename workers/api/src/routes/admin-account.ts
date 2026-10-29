/**
 * SA6: ручной запуск исполнения запросов на удаление аккаунта.
 *
 * Cron делает это сам раз в сутки, но при инциденте (или чтобы проверить
 * настройку) нужен запуск по требованию. Права — только администратор: удаление
 * аккаунтов необратимо, поэтому ни модератор, ни преподаватель сюда не допущены.
 *
 * Маршрут ничего не выдумывает: без service_role он честно отвечает 503 и
 * говорит, что именно не настроено.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { runAccountDeletionSweep, serviceRoleConfigured, DELETION_SWEEP_LIMIT } from "../jobs/account-deletion";

const adminAccount = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

async function requireAdminRole(c: any): Promise<boolean> {
  const rid = requestId();
  try {
    const user = c.get("user");
    const { data, error: queryError } = await c
      .get("supabase")
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", user.id)
      .limit(20);
    if (queryError) throw queryError;
    const codes = (data || []).map((row: any) => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      return String(role?.code || "");
    });
    if (codes.includes("admin")) return true;
    c.res = error(c, rid, 403, "FORBIDDEN", "Удаление аккаунтов доступно только администратору");
    return false;
  } catch {
    c.res = error(c, rid, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
    return false;
  }
}

/**
 * POST /admin/account-deletion/sweep
 * body: { limit?: number, dry_run?: boolean }
 *
 * dry_run показывает, кого процесс удалил бы, ничего не удаляя — это безопасный
 * способ проверить настройку на проде.
 */
adminAccount.post("/account-deletion/sweep", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdminRole(c))) return c.res;

  if (!serviceRoleConfigured(c.env)) {
    return error(
      c,
      rid,
      503,
      "SWEEP_NOT_CONFIGURED",
      "На воркере не настроен служебный ключ Supabase — удаление аккаунтов не выполняется"
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await c.req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const rawLimit = Number(payload.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), DELETION_SWEEP_LIMIT)
    : DELETION_SWEEP_LIMIT;
  const dryRun = payload.dry_run === true;

  const service = createServiceClient(c.env);
  if (!service) {
    return error(c, rid, 503, "SWEEP_NOT_CONFIGURED", "Служебный клиент Supabase недоступен");
  }

  if (dryRun) {
    const { data, error: rpcError } = await service.rpc("medbiohim_due_account_deletions", { p_limit: limit });
    if (rpcError) {
      return error(
        c,
        rid,
        503,
        "SWEEP_UNAVAILABLE",
        "Не удалось получить список запросов на удаление: миграция 20261030_account_deletion.sql не применена?"
      );
    }
    const rows = Array.isArray(data) ? data : [];
    return c.json(ok({ dry_run: true, due: rows.length, limit, requests: rows }, rid));
  }

  const result = await runAccountDeletionSweep(c.env, { limit });
  if (result.skipped) {
    return error(c, rid, 503, "SWEEP_SKIPPED", `Процесс не запускался: ${result.reason ?? "причина неизвестна"}`);
  }
  return c.json(ok({ dry_run: false, ...result }, rid));
});

export default adminAccount;
