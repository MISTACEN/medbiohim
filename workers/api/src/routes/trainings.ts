import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const trainings = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["in_progress", "completed", "cancelled"]);

function validation(c: any, rid: string, message: string) {
  const { body, status } = fail("VALIDATION", message, 422, rid);
  return c.json(body, status as 422);
}
function rpcFailure(c: any, rid: string, error: any, fallback: string) {
  const statusCode = Number(error?.code === "PGRST116" ? 404 : 0);
  const { body, status } = fail(statusCode ? "NOT_FOUND" : "TRAINING_UNAVAILABLE", statusCode ? "Тренировка не найдена" : fallback, statusCode || 503, rid);
  return c.json(body, status as any);
}
function normalizeRpc(c: any, rid: string, data: any, fallback: string) {
  if (data && typeof data === "object" && data.ok === false) {
    const status = [400, 401, 403, 404, 409, 413, 422].includes(Number(data.status)) ? Number(data.status) : 503;
    const code = /^[A-Z0-9_]{1,60}$/.test(String(data.code || "")) ? String(data.code) : "TRAINING_UNAVAILABLE";
    const { body, status: responseStatus } = fail(code, String(data.message || fallback).slice(0, 240), status, rid);
    return c.json(body, responseStatus as any);
  }
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    const { body, status } = fail("TRAINING_UNAVAILABLE", fallback, 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok(data, rid));
}

trainings.get("/", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const status = String(c.req.query("status") || "").trim();
  if (status && !STATUSES.has(status)) return validation(c, rid, "Недопустимый статус тренировки");
  try {
    const { data, error } = await db.rpc("histology_training_list", { p_status: status || null });
    if (error) return rpcFailure(c, rid, error, "Тренажёры временно недоступны");
    return normalizeRpc(c, rid, data, "Некорректный ответ списка тренировок");
  } catch {
    const { body, status: st } = fail("TRAINING_UNAVAILABLE", "Тренажёры временно недоступны", 503, rid);
    return c.json(body, st as 503);
  }
});

trainings.post("/", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  let input: unknown;
  try { input = await c.req.json(); } catch { return validation(c, rid, "Передайте настройки тренировки в JSON"); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return validation(c, rid, "Передайте настройки тренировки");
  try {
    const { data, error } = await db.rpc("histology_training_create", { p_input: input });
    if (error) return rpcFailure(c, rid, error, "Не удалось создать тренировку");
    return normalizeRpc(c, rid, data, "Некорректный ответ создания тренировки");
  } catch {
    const { body, status } = fail("TRAINING_UNAVAILABLE", "Не удалось создать тренировку", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.get("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
  if (!UUID.test(id)) return validation(c, rid, "Некорректный идентификатор тренировки");
  try {
    const { data, error } = await db.rpc("histology_training_get", { p_training_id: id });
    if (error) return rpcFailure(c, rid, error, "Тренировка временно недоступна");
    return normalizeRpc(c, rid, data, "Некорректный ответ тренировки");
  } catch {
    const { body, status } = fail("TRAINING_UNAVAILABLE", "Тренировка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.post("/:id/answer", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
  if (!UUID.test(id)) return validation(c, rid, "Некорректный идентификатор тренировки");
  let p: { order?: unknown; user_answer?: unknown; is_skipped?: unknown };
  try { p = await c.req.json(); } catch { return validation(c, rid, "Некорректный JSON"); }
  if (!p || typeof p !== "object" || Array.isArray(p)) return validation(c, rid, "Некорректный ответ");
  const order = Number(p.order);
  if (!Number.isInteger(order) || order < 0 || order > 499) return validation(c, rid, "Некорректный номер вопроса");
  if (p.is_skipped !== undefined && typeof p.is_skipped !== "boolean") return validation(c, rid, "Некорректный признак пропуска");
  const skipped = p.is_skipped === true;
  if (p.user_answer != null && typeof p.user_answer !== "string") return validation(c, rid, "Ответ должен быть текстом");
  if (!skipped && !String(p.user_answer || "").trim()) return validation(c, rid, "Введите ответ или пропустите вопрос");
  if (String(p.user_answer || "").length > 5000) {
    const { body, status } = fail("PAYLOAD_TOO_LARGE", "Ответ слишком длинный", 413, rid);
    return c.json(body, status as 413);
  }
  try {
    const { data, error } = await db.rpc("histology_training_answer", {
      p_training_id: id, p_order: order, p_user_answer: skipped ? null : (p.user_answer ?? null), p_is_skipped: skipped,
    });
    if (error) return rpcFailure(c, rid, error, "Не удалось сохранить ответ");
    return normalizeRpc(c, rid, data, "Некорректный ответ сохранения");
  } catch {
    const { body, status } = fail("TRAINING_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.post("/:id/complete", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
  if (!UUID.test(id)) return validation(c, rid, "Некорректный идентификатор тренировки");
  try {
    const { data, error } = await db.rpc("histology_training_complete", { p_training_id: id });
    if (error) return rpcFailure(c, rid, error, "Не удалось завершить тренировку");
    return normalizeRpc(c, rid, data, "Некорректный ответ завершения");
  } catch {
    const { body, status } = fail("TRAINING_UNAVAILABLE", "Не удалось завершить тренировку", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.post("/:id/cancel", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
  if (!UUID.test(id)) return validation(c, rid, "Некорректный идентификатор тренировки");
  try {
    const { data, error } = await db.rpc("histology_training_cancel", { p_training_id: id });
    if (error) return rpcFailure(c, rid, error, "Не удалось отменить тренировку");
    return normalizeRpc(c, rid, data, "Некорректный ответ отмены");
  } catch {
    const { body, status } = fail("TRAINING_UNAVAILABLE", "Не удалось отменить тренировку", 503, rid);
    return c.json(body, status as 503);
  }
});

export default trainings;
