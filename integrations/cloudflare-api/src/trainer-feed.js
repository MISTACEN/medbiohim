import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;
const CARD_FIELDS = [
  "id", "subject_id", "subject_slug", "specialty_slug", "mode_set",
  "preparation", "hotspots", "question", "tags", "difficulty", "source_key",
  "source_file_id", "is_published", "created_at", "updated_at",
  "plan_module_id", "plan_topic_id", "plan_module_title", "plan_topic_title",
].join(",");

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

function parseJsonField(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function removeSensitiveQuestionKeys(value, parentKey = "") {
  if (Array.isArray(value)) return value.map((item) => removeSensitiveQuestionKeys(item, parentKey));
  if (!value || typeof value !== "object") return value;

  const blocked = new Set([
    "correct", "isCorrect", "is_correct", "explanation", "answer",
    "correctAnswer", "correct_answer", "correctOption", "correct_option",
    "correctOptionId", "correct_option_id",
  ]);
  const output = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    if (key === "preparation" && childValue && typeof childValue === "object" && !Array.isArray(childValue)) {
      const preparation = { ...childValue };
      delete preparation.name;
      delete preparation.organ;
      delete preparation.captions;
      output[key] = removeSensitiveQuestionKeys(preparation, key);
      continue;
    }
    output[key] = removeSensitiveQuestionKeys(childValue, key);
  }
  return output;
}

function normalizeCard(row) {
  const card = { ...row };
  for (const key of ["preparation", "hotspots", "question", "tags"]) {
    if (card[key] !== null && card[key] !== undefined) card[key] = parseJsonField(card[key]);
  }
  const question = card.question;
  card.question = question && typeof question === "object"
    ? removeSensitiveQuestionKeys(question)
    : {};
  return card;
}

function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function validFilter(value) {
  return !value || (value.length <= 100 && /^[A-Za-z0-9_-]+$/.test(value));
}

export async function listSupabaseTrainerFeed(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const subject = String(filters.subject || "").trim();
  const specialty = String(filters.specialty || "").trim();
  const limit = boundedInt(filters.limit, 30, 1, 500);
  const offset = boundedInt(filters.offset, 0, 0, 1_000_000);
  if (!validFilter(subject) || !validFilter(specialty)) {
    return failure(422, "VALIDATION_ERROR", "Invalid trainer feed filters");
  }

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, query) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== "" && value !== null && value !== undefined) endpoint.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new Error("Supabase REST read failed");
    }
    if (response.status >= 300 && response.status < 400) throw new Error("Supabase REST redirect refused");
    if (!response.ok) throw new Error("Supabase REST read failed");
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Supabase REST returned an invalid collection");
    return payload;
  }

  const requiresMbh = subject === "histology" || specialty === "mbh";
  if (requiresMbh) {
    let memberships;
    try {
      memberships = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к тренажёру не удалось проверить");
    }
    const hasMbhMembership = memberships.some((membership) => {
      const group = related(membership?.groups);
      return Boolean(group) && group.is_active === true &&
        String(group.specialty_slug || "").trim() === "mbh";
    });
    if (!hasMbhMembership) {
      return failure(403, "FORBIDDEN", "Тренажёр по гистологии доступен только специальности МБХ");
    }
  }

  const query = {
    select: CARD_FIELDS,
    is_published: "eq.true",
    order: "id.asc",
    limit: String(limit),
    offset: String(offset),
  };
  if (subject) query.subject_slug = "eq." + subject;
  if (specialty) query.specialty_slug = "eq." + specialty;

  // The safe view filters MBH rows server-side and strips answer-bearing fields.
  // Add an explicit exclusion for non-MBH callers to preserve the PHP contract.
  if (!requiresMbh) {
    try {
      const membershipResult = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
      const hasMbhMembership = membershipResult.some((membership) => {
        const group = related(membership?.groups);
        return Boolean(group) && group.is_active === true &&
          String(group.specialty_slug || "").trim() === "mbh";
      });
      if (!hasMbhMembership) {
        query.and = "(or(subject_slug.is.null,subject_slug.neq.histology),or(specialty_slug.is.null,specialty_slug.neq.mbh))";
      }
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к тренажёру не удалось проверить");
    }
  }

  let items;
  try {
    items = await rows("trainer_feed_cards_public", query);
  } catch {
    return failure(503, "TRAINER_ERROR", "Не удалось загрузить тренажёр");
  }

  return {
    ok: true,
    data: { items: items.map(normalizeCard), limit, offset, source: "supabase_rest" },
  };
}

export async function getSupabaseTrainerCard(request, env, cardId, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const id = String(cardId || "").trim();
  if (!id || id.length > 200 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return failure(422, "VALIDATION_ERROR", "Invalid trainer card id");
  }

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  let endpoint;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
    endpoint = new URL("/rest/v1/trainer_feed_cards_public", base);
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  const params = {
    select: CARD_FIELDS,
    id: "eq." + id,
    is_published: "eq.true",
    limit: "1",
  };
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);

  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return failure(503, "TRAINER_ERROR", "Тренажёр временно недоступен");
  }
  if (response.status >= 300 && response.status < 400 || !response.ok) {
    return failure(503, "TRAINER_ERROR", "Тренажёр временно недоступен");
  }
  let rows;
  try {
    rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("invalid result");
  } catch {
    return failure(503, "TRAINER_ERROR", "Тренажёр временно недоступен");
  }
  if (!rows[0]) return failure(404, "NOT_FOUND", "Trainer card not found");

  const row = rows[0];
  const requiresMbh = String(row.subject_slug || "").trim() === "histology" ||
    String(row.specialty_slug || "").trim() === "mbh";
  if (requiresMbh) {
    const membershipsEndpoint = new URL("/rest/v1/group_memberships", base);
    membershipsEndpoint.searchParams.set("select", "group_id,groups(specialty_slug,is_active)");
    membershipsEndpoint.searchParams.set("user_id", "eq." + identity.user.id);
    membershipsEndpoint.searchParams.set("is_active", "eq.true");
    let membershipsResponse;
    try {
      membershipsResponse = await fetcher(membershipsEndpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к карточке не удалось проверить");
    }
    if (membershipsResponse.status >= 300 && membershipsResponse.status < 400 || !membershipsResponse.ok) {
      return failure(503, "DB_UNAVAILABLE", "Доступ к карточке не удалось проверить");
    }
    let memberships;
    try {
      memberships = await membershipsResponse.json();
      if (!Array.isArray(memberships)) throw new Error("invalid result");
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к карточке не удалось проверить");
    }
    const hasMbhMembership = memberships.some((membership) => {
      const group = related(membership?.groups);
      return Boolean(group) && group.is_active === true &&
        String(group.specialty_slug || "").trim() === "mbh";
    });
    if (!hasMbhMembership) return failure(403, "FORBIDDEN", "Карточка доступна только специальности МБХ");
  }

  return { ok: true, data: { item: normalizeCard(row) } };
}


export async function submitSupabaseTrainerAnswer(request, env, payload, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(422, "VALIDATION_ERROR", "Answer payload must be a JSON object");
  }
  if (typeof payload.card_id !== "string") {
    return failure(422, "VALIDATION_ERROR", "card_id required");
  }
  if (payload.option_id !== undefined && payload.option_id !== null && typeof payload.option_id !== "string") {
    return failure(422, "VALIDATION_ERROR", "option_id must be a string");
  }
  if (payload.answer_text !== undefined && payload.answer_text !== null && typeof payload.answer_text !== "string") {
    return failure(422, "VALIDATION_ERROR", "answer_text must be a string");
  }
  const cardId = payload.card_id.trim();
  const optionId = String(payload.option_id || "").trim();
  const answerText = String(payload.answer_text || "").trim();
  const isSkipped = payload.is_skipped === undefined ? false : payload.is_skipped;
  if (!cardId || cardId.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cardId)) {
    return failure(422, "VALIDATION_ERROR", "card_id required");
  }
  if (optionId.length > 200 || answerText.length > 5_000) {
    return failure(422, "VALIDATION_ERROR", "Answer fields are too long");
  }
  if (typeof isSkipped !== "boolean") {
    return failure(422, "VALIDATION_ERROR", "is_skipped must be a boolean");
  }
  let timeMs = null;
  if (payload.time_ms !== undefined && payload.time_ms !== null && payload.time_ms !== "") {
    const numericTime = Number(payload.time_ms);
    if (!Number.isFinite(numericTime)) {
      return failure(422, "VALIDATION_ERROR", "time_ms must be a number");
    }
    timeMs = Math.max(0, Math.min(3_600_000, Math.trunc(numericTime)));
  }

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
    endpoint = new URL("/rest/v1/rpc/submit_trainer_feed_answer", base);
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  const rpcPayload = {
    p_card_id: cardId,
    p_option_id: optionId || null,
    p_answer_text: answerText || null,
    p_is_skipped: isSkipped,
    p_time_ms: timeMs,
  };
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(rpcPayload),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return failure(503, "TRAINER_ERROR", "Тренажёр временно недоступен");
  }
  if (response.status >= 300 && response.status < 400) {
    return failure(503, "TRAINER_ERROR", "Тренажёр временно недоступен");
  }

  let result = null;
  try { result = await response.json(); } catch { /* mapped below */ }
  if (!response.ok) {
    const databaseCode = String(result?.code || "");
    if (response.status === 401) return failure(401, "UNAUTHORIZED", "Недействительная или истёкшая сессия");
    if (response.status === 403 || databaseCode === "42501") {
      return failure(403, "FORBIDDEN", "Нет доступа к этой карточке тренажёра");
    }
    if (databaseCode === "PGRST202" || databaseCode.startsWith("PGRST")) {
      return failure(503, "TRAINER_ERROR", "Сервис проверки ответа временно недоступен");
    }
    if (databaseCode === "P0002" || (response.status === 404 && !databaseCode)) {
      return failure(404, "NOT_FOUND", "Trainer card not found");
    }
    if (databaseCode === "22023" || databaseCode === "22P02") {
      return failure(422, "VALIDATION_ERROR", "Ответ не соответствует формату карточки");
    }
    return failure(503, "TRAINER_ERROR", "Не удалось сохранить ответ");
  }
  if (!result || typeof result !== "object" || Array.isArray(result) || !("answer" in result)) {
    return failure(502, "TRAINER_ERROR", "Сервис проверки ответа вернул некорректный результат");
  }

  // Correctness/explanation are returned only after the answer has been submitted
  // and graded by the existing authenticated Supabase RPC.
  return {
    ok: true,
    status: 201,
    data: {
      answer: result.answer,
      correct: result.correct ?? null,
      explanation: isSkipped ? null : (result.explanation ?? null),
    },
  };
}
