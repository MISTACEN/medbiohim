import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const sessions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const MAX_TITLE = 500;
const MAX_TYPE = 64;
const MAX_REF_ID = 200;
const PATCHABLE = new Set(["type", "ref_id", "title", "status", "current_index", "answers", "payload", "score", "finished_at"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(c: any, rid: string, message: string) {
  const { body, status } = fail("VALIDATION", message, 422, rid);
  return c.json(body, status as 422);
}
function normalizeSession(row: any) {
  if (!row) return null;
  return {
    id: row.id, user_id: row.user_id, type: row.type ?? "practice", ref_id: row.ref_id ?? null,
    title: row.title ?? "Сессия", status: row.status ?? "in_progress",
    current_index: Number.isFinite(Number(row.current_index)) ? Number(row.current_index) : 0,
    answers: row.answers ?? {}, payload: row.payload ?? {}, score: row.score ?? null,
    finished_at: row.finished_at ?? null, created_at: row.created_at ?? null, updated_at: row.updated_at ?? null,
  };
}
function validJsonObject(value: unknown) {
  return value !== null && typeof value === "object";
}

sessions.get("/", requireAuth, async (c) => {
  const rid = requestId(), user = c.get("user"), db = c.get("supabase");
  const statusFilter = c.req.query("status");
  try {
    let q = db.from("learning_sessions").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(500);
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Сессии временно недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: (data || []).map(normalizeSession) }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Сессии временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

sessions.post("/", requireAuth, async (c) => {
  const rid = requestId(), user = c.get("user"), db = c.get("supabase");
  let p: Record<string, unknown>;
  try { p = await c.req.json(); } catch { return invalid(c, rid, "Тело запроса должно быть JSON-объектом"); }
  if (!p || typeof p !== "object" || Array.isArray(p)) return invalid(c, rid, "Тело запроса должно быть JSON-объектом");
  const type = String(p.type ?? "practice").trim() || "practice";
  const title = String(p.title ?? "Сессия").trim() || "Сессия";
  const refId = p.ref_id == null || p.ref_id === "" ? null : String(p.ref_id).trim();
  const index = Number(p.current_index ?? 0);
  if (type.length > MAX_TYPE) return invalid(c, rid, "type слишком длинный");
  if (title.length > MAX_TITLE) return invalid(c, rid, "title слишком длинный");
  if (refId !== null && refId.length > MAX_REF_ID) return invalid(c, rid, "ref_id слишком длинный");
  if (!Number.isFinite(index) || index < 0 || index > 100000) return invalid(c, rid, "current_index некорректен");
  if (p.answers != null && !validJsonObject(p.answers)) return invalid(c, rid, "answers должен быть объектом или массивом");
  if (p.payload != null && !validJsonObject(p.payload)) return invalid(c, rid, "payload должен быть объектом или массивом");
  try {
    const now = new Date().toISOString();
    const { data, error } = await db.from("learning_sessions").insert({
      user_id: user.id, type, ref_id: refId, title, status: "in_progress",
      current_index: Math.floor(index), answers: p.answers ?? {}, payload: p.payload ?? {},
      score: null, finished_at: null, updated_at: now,
    }).select("*").maybeSingle();
    if (error || !data) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось создать сессию", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ session: normalizeSession(data) }, rid), 201);
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось создать сессию", 503, rid);
    return c.json(body, status as 503);
  }
});

sessions.get("/:id", requireAuth, async (c) => {
  const rid = requestId(), user = c.get("user"), db = c.get("supabase"), id = c.req.param("id");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный id сессии");
  try {
    const { data, error } = await db.from("learning_sessions").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Сессия временно недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Сессия не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ session: normalizeSession(data) }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Сессия временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

sessions.patch("/:id", requireAuth, async (c) => {
  const rid = requestId(), user = c.get("user"), db = c.get("supabase"), id = c.req.param("id");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный id сессии");
  let p: Record<string, unknown>;
  try { p = await c.req.json(); } catch { return invalid(c, rid, "Тело запроса должно быть JSON-объектом"); }
  if (!p || typeof p !== "object" || Array.isArray(p)) return invalid(c, rid, "Тело запроса должно быть JSON-объектом");
  const patch: Record<string, unknown> = {};
  for (const key of PATCHABLE) if (Object.prototype.hasOwnProperty.call(p, key)) patch[key] = p[key];
  if (!Object.keys(patch).length) return invalid(c, rid, "Нет полей для обновления");
  if (patch.type !== undefined) {
    const value = String(patch.type ?? "").trim();
    if (!value || value.length > MAX_TYPE) return invalid(c, rid, "type некорректен");
    patch.type = value;
  }
  if (patch.title !== undefined) {
    const value = String(patch.title ?? "").trim();
    if (!value || value.length > MAX_TITLE) return invalid(c, rid, "title некорректен");
    patch.title = value;
  }
  if (patch.ref_id !== undefined && patch.ref_id !== null) {
    const value = String(patch.ref_id).trim();
    if (value.length > MAX_REF_ID) return invalid(c, rid, "ref_id слишком длинный");
    patch.ref_id = value || null;
  }
  if (patch.current_index !== undefined) {
    const value = Number(patch.current_index);
    if (!Number.isFinite(value) || value < 0 || value > 100000) return invalid(c, rid, "current_index некорректен");
    patch.current_index = Math.floor(value);
  }
  if (patch.answers != null && !validJsonObject(patch.answers)) return invalid(c, rid, "answers должен быть объектом или массивом");
  if (patch.payload != null && !validJsonObject(patch.payload)) return invalid(c, rid, "payload должен быть объектом или массивом");
  if (patch.status !== undefined) {
    const value = String(patch.status ?? "").trim();
    if (!value || value.length > 64) return invalid(c, rid, "status некорректен");
    patch.status = value;
    if (value === "finished" && patch.finished_at === undefined) patch.finished_at = new Date().toISOString();
  }
  patch.updated_at = new Date().toISOString();
  try {
    const { data, error } = await db.from("learning_sessions").update(patch).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить сессию", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Сессия не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ session: normalizeSession(data) }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить сессию", 503, rid);
    return c.json(body, status as 503);
  }
});

export default sessions;
