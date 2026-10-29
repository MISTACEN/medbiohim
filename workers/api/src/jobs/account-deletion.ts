/**
 * SA6 (PRODUCT-AUDIT-PLAN-2026-10-27): исполнение запросов на удаление аккаунта.
 *
 * Пользовательский API только фиксирует намерение (grace 7 дней). Реальное
 * удаление из `auth.users` делает этот cron-процесс под service_role: у него есть
 * право удалять пользователей, у клиента — нет.
 *
 * Принципы:
 * 1. Ничего не выдумываем: если service_role не настроен или RPC недоступен,
 *    процесс честно сообщает, что ничего не сделал, а не «успешно завершился».
 * 2. Ошибка одного аккаунта не останавливает остальные: каждая запись
 *    обрабатывается независимо и логируется.
 * 3. Удаление делает Supabase Admin API (`auth.admin.deleteUser`) — единственный
 *    корректный путь: он чистит auth, сессии и связанные строки по каскадам.
 */
import type { Env } from "../env";
import { createServiceClient } from "../lib/supabase";

/** Сколько запросов обрабатываем за один запуск: cron не должен работать минутами. */
export const DELETION_SWEEP_LIMIT = 20;

export type DeletionSweepResult = {
  /** Сколько записей вернула БД (due-запросы). */
  found: number;
  /** Сколько аккаунтов реально удалено. */
  deleted: number;
  /** Сколько не удалось удалить (сеть, права, ошибка Admin API). */
  failed: number;
  /** Процесс не запускался — с причиной, а не с нулями «как будто всё ок». */
  skipped: boolean;
  reason?: "service_role_missing" | "rpc_unavailable" | "bad_response";
};

type DueRow = { request_id?: unknown; user_id?: unknown };

/** Клиент минимально типизирован: тесты подменяют его без Supabase. */
export type SweepClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  auth: { admin: { deleteUser: (id: string) => PromiseLike<{ error: unknown }> } };
};

export type SweepDeps = {
  createClient?: (env: Env) => SweepClient | null;
  limit?: number;
  log?: (message: string, payload?: unknown) => void;
};

/** Настроен ли служебный ключ: по этому флагу UI честно говорит, будет ли удаление. */
export function serviceRoleConfigured(env: Env | null | undefined): boolean {
  if (!env || typeof env !== "object") return false;
  const record = env as Record<string, unknown>;
  const key = String(
    record.SUPABASE_SERVICE_ROLE_KEY || record.SUPABASE_SERVICE_KEY || record.SUPABASE_SECRET_KEY || ""
  ).trim();
  return key.length > 0;
}

function asClient(client: unknown): SweepClient | null {
  if (!client || typeof client !== "object") return null;
  const candidate = client as SweepClient;
  return typeof candidate.rpc === "function" ? candidate : null;
}

/** Supabase Admin API отвечает «User not found», если аккаунт уже удалён. */
function isMissingUser(error: unknown): boolean {
  const record = (error || {}) as Record<string, unknown>;
  const status = Number(record.status ?? record.statusCode ?? 0);
  if (status === 404) return true;
  const message = String(record.message ?? record.msg ?? record.error ?? "");
  return /user\s+not\s+found|not\s+found/i.test(message);
}

export async function runAccountDeletionSweep(env: Env, deps: SweepDeps = {}): Promise<DeletionSweepResult> {
  const log = deps.log ?? ((message, payload) => console.log(message, payload ?? ""));
  const limit = deps.limit ?? DELETION_SWEEP_LIMIT;
  const factory = deps.createClient ?? ((e: Env) => asClient(createServiceClient(e)));
  const supabase = factory(env);
  if (!supabase) {
    log("[account-deletion-sweep] service_role не настроен — удаление не выполняется");
    return { found: 0, deleted: 0, failed: 0, skipped: true, reason: "service_role_missing" };
  }

  // Список готовит БД: она же единственный источник срока (scheduled_for <= now()).
  const { data, error } = await supabase.rpc("medbiohim_due_account_deletions", { p_limit: limit });
  if (error) {
    log("[account-deletion-sweep] RPC недоступен (миграция не применена?)", error);
    return { found: 0, deleted: 0, failed: 0, skipped: true, reason: "rpc_unavailable" };
  }

  const rows: DueRow[] = Array.isArray(data) ? (data as DueRow[]) : [];
  if (rows.length === 0) return { found: 0, deleted: 0, failed: 0, skipped: false };

  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    const userId = typeof row?.user_id === "string" ? row.user_id : "";
    const requestId = typeof row?.request_id === "string" ? row.request_id : "";
    if (!userId) {
      failed += 1;
      log("[account-deletion-sweep] запись без user_id — пропущена", row);
      continue;
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError && !isMissingUser(deleteError)) {
      failed += 1;
      log("[account-deletion-sweep] Admin API не удалил пользователя", { userId, deleteError });
      continue;
    }
    deleted += 1;

    // Обычно строка запроса исчезает вместе с аккаунтом (on delete cascade).
    // Если аккаунта уже не было, строка осталась — помечаем исполнение, чтобы
    // запись не висела в очереди и не пыталась удаляться каждый день.
    if (requestId) {
      const { error: markError } = await supabase.rpc("medbiohim_mark_account_deletion_executed", {
        p_request_id: requestId,
      });
      if (markError) {
        log("[account-deletion-sweep] аккаунт удалён, отметка об исполнении не записана", { userId, markError });
      }
    }
  }

  log("[account-deletion-sweep] итог", { found: rows.length, deleted, failed });
  return { found: rows.length, deleted, failed, skipped: false };
}
