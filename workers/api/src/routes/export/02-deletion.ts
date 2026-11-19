import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { normalizeDeletion, deletionFailure, withExecution } from "./shared";

import type { ExportRouter } from "./types";

export function registerDeletionRoutes(account: ExportRouter) {
account.get("/deletion", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_account_deletion_status");
    if (error) throw error;
    return c.json(ok(withExecution(normalizeDeletion(data, "none"), c.env), rid));
  } catch (error) {
    const { body, status } = deletionFailure(error, rid);
    return c.json(body, status as 503);
  }
});

account.post("/deletion", requireAuth, async (c) => {
  const rid = requestId();
  let payload: unknown = {};
  try {
    payload = await c.req.json();
  } catch {
    // Пустое тело допустимо: причина удаления не обязательна.
    payload = {};
  }
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const reason = input.reason == null ? "" : String(input.reason).trim();
  if (reason.length > 1000) {
    const { body, status } = fail("VALIDATION_ERROR", "Причина удаления слишком длинная: не более 1000 символов", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_request_account_deletion", {
      p_reason: reason || null,
    });
    if (error) throw error;
    const result = withExecution(normalizeDeletion(data, "scheduled"), c.env);
    // Повторный запрос не создаёт дубль и не считается ошибкой пользователя.
    return c.json(ok(result, rid), result.status === "already_requested" ? 200 : 201);
  } catch (error) {
    const { body, status } = deletionFailure(error, rid);
    return c.json(body, status as 503);
  }
});

account.delete("/deletion", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_cancel_account_deletion");
    if (error) throw error;
    const result = withExecution(normalizeDeletion(data, "not_requested"), c.env);
    if (result.status === "cancelled") return c.json(ok(result, rid));
    if (result.status === "executed") {
      const { body, status } = fail(
        "DELETION_ALREADY_EXECUTED",
        "Аккаунт уже помечен как удалённый: отменить запрос нельзя. Обратитесь в поддержку.",
        409,
        rid
      );
      return c.json(body, status as 409);
    }
    const { body, status } = fail(
      "DELETION_NOT_REQUESTED",
      "Активного запроса на удаление нет — отменять нечего.",
      409,
      rid
    );
    return c.json(body, status as 409);
  } catch (error) {
    const { body, status } = deletionFailure(error, rid);
    return c.json(body, status as 503);
  }
});
}
