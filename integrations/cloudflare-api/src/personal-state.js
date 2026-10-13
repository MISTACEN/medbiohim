import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;
const NOTE_LIMIT = 10_000;
const SUPPORTED_TARGET_TYPES = new Set(["question"]);

function failure(status, code, message) {
  return { ok: false, status, code, message };
}
function restFailure(error, fallbackCode, fallbackMessage) {
  const status = Number(error?.status || 0);
  if (status === 401) return failure(401, "UNAUTHORIZED", "Недействительная или истёкшая сессия");
  if (status === 403) return failure(403, "FORBIDDEN", "Нет доступа к личным данным");
  return failure(503, fallbackCode, fallbackMessage);
}
function validIdentifier(value) {
  return value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}

async function createRestClient(request, env, userId, fetcher) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  let base;
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !anonKey || !token || !userId) throw new Error("configuration");
  } catch {
    throw Object.assign(new Error("Supabase REST is not configured"), { status: 0 });
  }

  async function call(table, query = {}, options = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") endpoint.searchParams.set(key, String(value));
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
    if (!Array.isArray(payload)) throw Object.assign(new Error("Invalid Supabase REST collection"), { status: 502 });
    return payload;
  }
  async function insert(table, row) {
    const payload = await call(table, {}, { method: "POST", body: row, prefer: "return=representation" });
    if (!Array.isArray(payload)) throw Object.assign(new Error("Invalid insert response"), { status: 502 });
    return payload[0] || null;
  }
  async function patch(table, query, values) {
    const payload = await call(table, query, { method: "PATCH", body: values, prefer: "return=representation" });
    if (!Array.isArray(payload)) throw Object.assign(new Error("Invalid update response"), { status: 502 });
    return payload[0] || null;
  }
  async function remove(table, query) {
    await call(table, query, { method: "DELETE", prefer: "return=minimal" });
  }

  return { rows, insert, patch, remove, userId };
}

async function requireQuestionAccess(client, request, env, targetId, identity, fetcher) {
  let matches;
  try {
    matches = await client.rows("exam_questions", {
      select: "id,subject_slug,is_published",
      id: "eq." + targetId,
      is_published: "eq.true",
      limit: "1",
    });
  } catch (error) {
    return restFailure(error, "QUESTION_UNAVAILABLE", "Вопрос временно недоступен");
  }
  const question = matches[0];
  if (!question || question.is_published !== true) {
    return failure(404, "NOT_FOUND", "Опубликованный вопрос не найден");
  }

  if (String(question.subject_slug || "").trim() === "histology") {
    let memberships;
    try {
      memberships = await client.rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к вопросу не удалось проверить");
    }
    const allowed = memberships.some((membership) => {
      const group = Array.isArray(membership?.groups) ? membership.groups[0] : membership?.groups;
      return Boolean(group) && group.is_active === true &&
        String(group.specialty_slug || "").trim() === "mbh";
    });
    if (!allowed) return failure(403, "FORBIDDEN", "Вопрос доступен только специальности МБХ");
  }
  return { ok: true };
}

function validateTarget(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(422, "VALIDATION_ERROR", "Тело запроса должно быть JSON-объектом");
  }
  const type = String(payload.target_type || "question").trim();
  const id = String(payload.target_id || "").trim();
  if (!SUPPORTED_TARGET_TYPES.has(type)) {
    return failure(422, "VALIDATION_ERROR", "Этот тип избранного или заметки пока не поддерживается");
  }
  if (!validIdentifier(id)) {
    return failure(422, "VALIDATION_ERROR", "target_id обязателен и должен быть корректным идентификатором");
  }
  return { ok: true, target_type: type, target_id: id };
}

export async function listSupabaseNotes(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  let client;
  try { client = await createRestClient(request, env, identity.user.id, fetcher); }
  catch { return failure(503, "DB_UNAVAILABLE", "Заметки временно недоступны"); }

  try {
    const items = await client.rows("notes", {
      select: "id,user_id,target_type,target_id,text,created_at,updated_at",
      user_id: "eq." + identity.user.id,
      order: "updated_at.desc",
      limit: "1000",
    });
    return { ok: true, data: { items } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Заметки временно недоступны");
  }
}

export async function upsertSupabaseNote(request, env, payload, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const target = validateTarget(payload);
  if (!target.ok) return target;
  const text = String(payload.body ?? payload.text ?? "").trim();
  if (!text || text.length > NOTE_LIMIT) {
    return failure(422, "VALIDATION_ERROR", text ? "Заметка слишком длинная" : "body обязателен");
  }

  let client;
  try { client = await createRestClient(request, env, identity.user.id, fetcher); }
  catch { return failure(503, "DB_UNAVAILABLE", "Заметки временно недоступны"); }
  const access = await requireQuestionAccess(client, request, env, target.target_id, identity, fetcher);
  if (!access.ok) return access;

  try {
    const existing = await client.rows("notes", {
      select: "id,user_id,target_type,target_id,text,created_at,updated_at",
      user_id: "eq." + identity.user.id,
      target_type: "eq." + target.target_type,
      target_id: "eq." + target.target_id,
      limit: "1",
    });
    const now = new Date().toISOString();
    let note;
    if (existing[0]) {
      note = await client.patch("notes", {
        id: "eq." + String(existing[0].id),
        user_id: "eq." + identity.user.id,
      }, { text, updated_at: now });
    } else {
      note = await client.insert("notes", {
        user_id: identity.user.id,
        target_type: target.target_type,
        target_id: target.target_id,
        text,
      });
    }
    if (!note) return failure(503, "DB_UNAVAILABLE", "Не удалось сохранить заметку");
    return { ok: true, status: 201, data: { note } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Не удалось сохранить заметку");
  }
}

export async function listSupabaseFavorites(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  let client;
  try { client = await createRestClient(request, env, identity.user.id, fetcher); }
  catch { return failure(503, "DB_UNAVAILABLE", "Избранное временно недоступно"); }

  try {
    const items = await client.rows("favorites", {
      select: "user_id,target_type,target_id,created_at",
      user_id: "eq." + identity.user.id,
      order: "created_at.desc",
      limit: "1000",
    });
    return { ok: true, data: { items } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Избранное временно недоступно");
  }
}

export async function toggleSupabaseFavorite(request, env, payload, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const target = validateTarget(payload);
  if (!target.ok) return target;

  let client;
  try { client = await createRestClient(request, env, identity.user.id, fetcher); }
  catch { return failure(503, "DB_UNAVAILABLE", "Избранное временно недоступно"); }
  const access = await requireQuestionAccess(client, request, env, target.target_id, identity, fetcher);
  if (!access.ok) return access;

  const key = {
    user_id: "eq." + identity.user.id,
    target_type: "eq." + target.target_type,
    target_id: "eq." + target.target_id,
  };
  try {
    const existing = await client.rows("favorites", {
      select: "user_id,target_type,target_id",
      ...key,
      limit: "1",
    });
    if (existing.length) {
      await client.remove("favorites", key);
      return { ok: true, data: { favorited: false } };
    }
    const saved = await client.insert("favorites", {
      user_id: identity.user.id,
      target_type: target.target_type,
      target_id: target.target_id,
    });
    if (!saved) return failure(503, "DB_UNAVAILABLE", "Не удалось обновить избранное");
    return { ok: true, data: { favorited: true } };
  } catch (error) {
    return restFailure(error, "DB_UNAVAILABLE", "Не удалось обновить избранное");
  }
}
