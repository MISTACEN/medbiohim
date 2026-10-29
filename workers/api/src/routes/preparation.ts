import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
// Reuse the archived, already hardened Supabase/RLS preparation implementation while
// the API is consolidated into one Worker. This is bundled into this Worker, not a
// runtime proxy to PHP/SpaceWeb or the Shadow Worker.
import {
  startSupabasePreparation,
  getSupabasePreparation,
  saveSupabasePreparation,
  finishSupabasePreparation,
  retrySupabasePreparationGrading,
  reviewSupabasePreparation,
} from "../../../../integrations/cloudflare-api/src/planner.js";

const preparation = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(c: any, rid: string, result: any, fallback: string) {
  if (!result || typeof result !== "object") {
    const { body, status } = fail("PREPARATION_UNAVAILABLE", fallback, 503, rid);
    return c.json(body, status as 503);
  }
  if (result.ok === false) {
    const status = [400, 401, 403, 404, 409, 413, 422].includes(Number(result.status)) ? Number(result.status) : 503;
    const code = /^[A-Z0-9_]{1,60}$/.test(String(result.code || "")) ? String(result.code) : "PREPARATION_UNAVAILABLE";
    const { body, status: responseStatus } = fail(code, String(result.message || fallback).slice(0, 240), status, rid, result.details);
    return c.json(body, responseStatus as any);
  }
  if (result.ok !== true || result.data == null) {
    const { body, status } = fail("PREPARATION_UNAVAILABLE", fallback, 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok(result.data, rid), Number(result.status) === 201 ? 201 : 200);
}

async function readBody(c: any) {
  try {
    const value = await c.req.raw.clone().json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value;
  } catch { return null; }
}

/**
 * FA11: дедлайн попытки = started_at + tests.time_limit_sec (если лимит задан).
 * Архивная реализация подготовки лимит не знает — дедлайн считается на уровне
 * роута и отдаётся клиенту как deadline_at; сохранение ответов после срока
 * отклоняется, завершение разрешено всегда (автофиниш честно фиксирует время).
 */
async function loadDeadline(supabase: any, sessionId: string): Promise<string | null> {
  try {
    const { data: session } = await supabase
      .from("test_preparation_sessions")
      .select("test_id,status,started_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session?.test_id || !session.started_at) return null;
    const started = Date.parse(String(session.started_at));
    if (Number.isNaN(started)) return null;
    const { data: testRows } = await supabase
      .from("tests")
      .select("time_limit_sec")
      .eq("id", String(session.test_id))
      .limit(1);
    const limit = Number(testRows?.[0]?.time_limit_sec || 0);
    if (!Number.isFinite(limit) || limit <= 0) return null;
    return new Date(started + limit * 1000).toISOString();
  } catch (error) {
    console.error("[preparation:deadline]", error);
    return null;
  }
}

function isExpired(deadline: string | null): boolean {
  if (!deadline) return false;
  const at = Date.parse(deadline);
  return Number.isFinite(at) && Date.now() > at;
}

preparation.post("/:id/preparation/start", requireAuth, async (c) => {
  const rid = requestId();
  const testId = String(c.req.param("id") || "");
  if (!UUID.test(testId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID теста", 422, rid);
    return c.json(body, status as 422);
  }
  const input = await readBody(c);
  if (!input) {
    const { body, status } = fail("VALIDATION", "Передайте настройки подготовки в JSON", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const result = await startSupabasePreparation(c.req.raw.clone(), c.env, testId, input);
    if (result?.ok && result.data?.session?.id) {
      const deadline = await loadDeadline(c.get("supabase"), String(result.data.session.id));
      if (deadline) result.data.session.deadline_at = deadline;
    }
    return respond(c, rid, result, "Не удалось начать подготовку");
  } catch (error) {
    console.error("MEDBIOHIM_PREPARATION_START_ROUTE", String(error));
    const { body, status } = fail("PREPARATION_UNAVAILABLE", "Не удалось начать подготовку", 503, rid);
    return c.json(body, status as 503);
  }
});

preparation.get("/preparation/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID сессии подготовки", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const result = await getSupabasePreparation(c.req.raw.clone(), c.env, id);
    if (result?.ok && result.data?.session?.id) {
      const deadline = await loadDeadline(c.get("supabase"), String(result.data.session.id));
      if (deadline) result.data.session.deadline_at = deadline;
    }
    return respond(c, rid, result, "Подготовка временно недоступна");
  } catch {
    const { body, status } = fail("PREPARATION_UNAVAILABLE", "Подготовка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

preparation.patch("/preparation/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID сессии подготовки", 422, rid);
    return c.json(body, status as 422);
  }
  const input = await readBody(c);
  if (!input) {
    const { body, status } = fail("VALIDATION", "Передайте ответ в JSON", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    // Серверный контроль срока: после дедлайна ответы не принимаются — иначе
    // клиентский таймер можно было бы просто проигнорировать.
    const deadline = await loadDeadline(c.get("supabase"), id);
    if (deadline && isExpired(deadline)) {
      const { body, status } = fail("TIME_EXCEEDED", "Время теста вышло — завершите попытку, чтобы увидеть результат", 422, rid, { deadline_at: deadline });
      return c.json(body, status as 422);
    }
    return respond(c, rid, await saveSupabasePreparation(c.req.raw.clone(), c.env, id, input), "Не удалось сохранить ответ");
  } catch {
    const { body, status } = fail("PREPARATION_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

preparation.post("/preparation/:id/finish", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID сессии подготовки", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    // Завершение разрешено всегда (автофиниш по таймеру в том числе), но
    // честно помечаем, что лимит был превышен.
    const deadline = await loadDeadline(c.get("supabase"), id);
    const result = await finishSupabasePreparation(c.req.raw.clone(), c.env, id);
    if (result?.ok && result.data && deadline && isExpired(deadline)) {
      result.data.time_exceeded = true;
      result.data.deadline_at = deadline;
    }
    return respond(c, rid, result, "Не удалось завершить подготовку");
  } catch {
    const { body, status } = fail("PREPARATION_UNAVAILABLE", "Не удалось завершить подготовку", 503, rid);
    return c.json(body, status as 503);
  }
});

preparation.post("/preparation/:id/retry-grading", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID сессии подготовки", 422, rid);
    return c.json(body, status as 422);
  }
  const input = await readBody(c);
  const questionId = input && typeof input.question_id === "string" ? input.question_id : "";
  if (questionId && !UUID.test(questionId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID вопроса", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    return respond(c, rid, await retrySupabasePreparationGrading(c.req.raw.clone(), c.env, id, questionId), "Не удалось повторно проверить ответ");
  } catch {
    const { body, status } = fail("GRADING_RETRY_ERROR", "Не удалось повторно проверить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

preparation.post("/preparation/:id/ai-review", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID сессии подготовки", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    return respond(c, rid, await reviewSupabasePreparation(c.req.raw.clone(), c.env, id), "Не удалось подготовить разбор");
  } catch {
    const { body, status } = fail("AI_REVIEW_ERROR", "Не удалось подготовить разбор", 503, rid);
    return c.json(body, status as 503);
  }
});

export default preparation;
