/**
 * Learning sessions API — PHP ContentStore / sessions_rest.php parity.
 * Table: public.learning_sessions (caller JWT + RLS; no service-role).
 *
 * Routes:
 *   GET    /api/v1/sessions
 *   POST   /api/v1/sessions
 *   GET    /api/v1/sessions/{id}
 *   PATCH  /api/v1/sessions/{id}
 */

import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;
const TITLE_MAX = 500;
const TYPE_MAX = 64;
const REF_ID_MAX = 200;
const BODY_KEYS = new Set([
  "type", "ref_id", "title", "status", "current_index", "answers", "payload", "score", "finished_at",
]);

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function restFailure(error, fallbackCode, fallbackMessage) {
  const status = Number(error?.status || 0);
  if (status === 401) return failure(401, "UNAUTHORIZED", "Недействительная или истёкшая сессия");
  if (status === 403) return failure(403, "FORBIDDEN", "Нет доступа к сессиям");
  return failure(503, fallbackCode, fallbackMessage);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uuidLike(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function createRestClient(request, env, fetcher) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !anonKey || !token) throw new Error("configuration");
  } catch {
    throw Object.assign(new Error("Supabase REST is not configured"), { status: 0 });
  }

  async function call(table, query = {}, options = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        endpoint.searchParams.set(key, String(value));
      }
    }
    const headers = {
      apikey: anonKey,
      authorization: "Bearer " + token,
      accept: "application/json",
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.prefer) headers.prefer = options.prefer;
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: options.method || "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw Object.assign(new Error("Supabase REST request failed"), { status: 0 });
    }
    if (response.status >= 300 && response.status < 400) {
      throw Object.assign(new Error("Supabase REST redirect refused"), { status: response.status });
    }
    let payload = null;
    if (response.status !== 204) {
      try { payload = await response.json(); } catch { payload = null; }
    }
    if (!response.ok) {
      throw Object.assign(new Error("Supabase REST request failed"), {
        status: response.status,
        databaseCode: String(payload?.code || ""),
      });
    }
    return payload;
  }

  async function rows(table, query = {}) {
    const payload = await call(table, query);
    if (!Array.isArray(payload)) {
      throw Object.assign(new Error("Invalid Supabase REST collection"), { status: 502 });
    }
    return payload;
  }

  async function insert(table, row) {
    const payload = await call(table, {}, {
      method: "POST",
      body: row,
      prefer: "return=representation",
    });
    if (!Array.isArray(payload)) {
      throw Object.assign(new Error("Invalid insert response"), { status: 502 });
    }
    return payload[0] || null;
  }

  async function patch(table, query, values) {
    const payload = await call(table, query, {
      method: "PATCH",
      body: values,
      prefer: "return=representation",
    });
    if (!Array.isArray(payload)) {
      throw Object.assign(new Error("Invalid update response"), { status: 502 });
    }
    return payload[0] || null;
  }

  return { rows, insert, patch };
}

function normalizeSessionRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id ?? null,
    user_id: row.user_id ?? null,
    type: row.type ?? "practice",
    ref_id: row.ref_id ?? null,
    title: row.title ?? "Сессия",
    status: row.status ?? "in_progress",
    current_index: Number.isFinite(Number(row.current_index)) ? Number(row.current_index) : 0,
    answers: row.answers ?? {},
    payload: row.payload ?? {},
    score: row.score ?? null,
    finished_at: row.finished_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

/** GET /api/v1/sessions?status= */
export async function listSupabaseLearningSessions(request, env, options = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  let client;
  try {
    client = await createRestClient(request, env, fetcher);
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Сессии временно недоступны");
  }

  const statusFilter = String(options.status || "").trim();
  try {
    const query = {
      select: "*",
      user_id: "eq." + identity.user.id,
      order: "updated_at.desc",
      limit: "500",
    };
    if (statusFilter) query.status = "eq." + statusFilter;
    const items = (await client.rows("learning_sessions", query))
      .map(normalizeSessionRow)
      .filter(Boolean);
    return { ok: true, data: { items } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Сессии временно недоступны");
  }
}

/** GET /api/v1/sessions/{id} */
export async function getSupabaseLearningSession(request, env, sessionId, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const id = String(sessionId || "").trim();
  if (!uuidLike(id)) {
    return failure(422, "VALIDATION_ERROR", "Некорректный id сессии");
  }

  let client;
  try {
    client = await createRestClient(request, env, fetcher);
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Сессии временно недоступны");
  }

  try {
    const rows = await client.rows("learning_sessions", {
      select: "*",
      id: "eq." + id,
      user_id: "eq." + identity.user.id,
      limit: "1",
    });
    const session = normalizeSessionRow(rows[0]);
    if (!session) return failure(404, "NOT_FOUND", "Session not found");
    return { ok: true, data: { session } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Сессии временно недоступны");
  }
}

/** POST /api/v1/sessions */
export async function createSupabaseLearningSession(request, env, payload, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  if (!isPlainObject(payload)) {
    return failure(422, "VALIDATION_ERROR", "Тело запроса должно быть JSON-объектом");
  }

  const type = String(payload.type ?? "practice").trim() || "practice";
  const refIdRaw = payload.ref_id;
  const refId = refIdRaw === null || refIdRaw === undefined || refIdRaw === ""
    ? null
    : String(refIdRaw).trim();
  const title = String(payload.title ?? "Сессия").trim() || "Сессия";
  const currentIndex = Number(payload.current_index ?? 0);
  const answers = payload.answers;
  const sessionPayload = payload.payload;

  if (type.length > TYPE_MAX) {
    return failure(422, "VALIDATION_ERROR", "type слишком длинный");
  }
  if (refId !== null && refId.length > REF_ID_MAX) {
    return failure(422, "VALIDATION_ERROR", "ref_id слишком длинный");
  }
  if (title.length > TITLE_MAX) {
    return failure(422, "VALIDATION_ERROR", "title слишком длинный");
  }
  if (!Number.isFinite(currentIndex) || currentIndex < 0 || currentIndex > 100_000) {
    return failure(422, "VALIDATION_ERROR", "current_index некорректен");
  }
  if (answers !== undefined && answers !== null && typeof answers !== "object") {
    return failure(422, "VALIDATION_ERROR", "answers должен быть объектом или массивом");
  }
  if (sessionPayload !== undefined && sessionPayload !== null && typeof sessionPayload !== "object") {
    return failure(422, "VALIDATION_ERROR", "payload должен быть объектом или массивом");
  }

  let client;
  try {
    client = await createRestClient(request, env, fetcher);
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Сессии временно недоступны");
  }

  const now = new Date().toISOString();
  const row = {
    user_id: identity.user.id,
    type,
    ref_id: refId,
    title,
    status: "in_progress",
    current_index: Math.floor(currentIndex),
    answers: answers === undefined || answers === null ? {} : answers,
    payload: sessionPayload === undefined || sessionPayload === null ? {} : sessionPayload,
    score: null,
    finished_at: null,
    updated_at: now,
  };

  try {
    const session = normalizeSessionRow(await client.insert("learning_sessions", row));
    if (!session) return failure(503, "DB_UNAVAILABLE", "Не удалось создать сессию");
    return { ok: true, status: 201, data: { session } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Не удалось создать сессию");
  }
}

/** PATCH /api/v1/sessions/{id} */
export async function patchSupabaseLearningSession(request, env, sessionId, payload, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const id = String(sessionId || "").trim();
  if (!uuidLike(id)) {
    return failure(422, "VALIDATION_ERROR", "Некорректный id сессии");
  }
  if (!isPlainObject(payload)) {
    return failure(422, "VALIDATION_ERROR", "Тело запроса должно быть JSON-объектом");
  }

  const patch = {};
  for (const key of BODY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      patch[key] = payload[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    return failure(422, "VALIDATION_ERROR", "Нет полей для обновления");
  }

  if (patch.type !== undefined) {
    const type = String(patch.type ?? "").trim();
    if (!type || type.length > TYPE_MAX) {
      return failure(422, "VALIDATION_ERROR", "type некорректен");
    }
    patch.type = type;
  }
  if (patch.title !== undefined) {
    const title = String(patch.title ?? "").trim();
    if (!title || title.length > TITLE_MAX) {
      return failure(422, "VALIDATION_ERROR", "title некорректен");
    }
    patch.title = title;
  }
  if (patch.ref_id !== undefined && patch.ref_id !== null) {
    const refId = String(patch.ref_id).trim();
    if (refId.length > REF_ID_MAX) {
      return failure(422, "VALIDATION_ERROR", "ref_id слишком длинный");
    }
    patch.ref_id = refId === "" ? null : refId;
  }
  if (patch.current_index !== undefined) {
    const currentIndex = Number(patch.current_index);
    if (!Number.isFinite(currentIndex) || currentIndex < 0 || currentIndex > 100_000) {
      return failure(422, "VALIDATION_ERROR", "current_index некорректен");
    }
    patch.current_index = Math.floor(currentIndex);
  }
  if (patch.status !== undefined) {
    const status = String(patch.status ?? "").trim();
    if (!status || status.length > 64) {
      return failure(422, "VALIDATION_ERROR", "status некорректен");
    }
    patch.status = status;
    if (status === "finished" && patch.finished_at === undefined) {
      patch.finished_at = new Date().toISOString();
    }
  }
  if (patch.answers !== undefined && patch.answers !== null && typeof patch.answers !== "object") {
    return failure(422, "VALIDATION_ERROR", "answers должен быть объектом или массивом");
  }
  if (patch.payload !== undefined && patch.payload !== null && typeof patch.payload !== "object") {
    return failure(422, "VALIDATION_ERROR", "payload должен быть объектом или массивом");
  }

  delete patch.user_id;
  delete patch.id;
  patch.updated_at = new Date().toISOString();

  let client;
  try {
    client = await createRestClient(request, env, fetcher);
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Сессии временно недоступны");
  }

  try {
    const existing = await client.rows("learning_sessions", {
      select: "id",
      id: "eq." + id,
      user_id: "eq." + identity.user.id,
      limit: "1",
    });
    if (!existing[0]) return failure(404, "NOT_FOUND", "Session not found");

    const session = normalizeSessionRow(await client.patch(
      "learning_sessions",
      { id: "eq." + id, user_id: "eq." + identity.user.id },
      patch,
    ));
    if (!session) return failure(503, "DB_UNAVAILABLE", "Не удалось обновить сессию");
    return { ok: true, data: { session } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Не удалось обновить сессию");
  }
}
