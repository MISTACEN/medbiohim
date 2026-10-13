import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;
const MAX_MESSAGE = 2_000;
const CATEGORIES = new Set(["wrong_answer", "wording", "multiple_correct", "no_correct", "typo", "other"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}
function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

export async function submitSupabaseQuestionReport(request, env, questionId, payload, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  if (!UUID.test(String(questionId || ""))) {
    return failure(422, "VALIDATION_ERROR", "Invalid question id");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(422, "VALIDATION_ERROR", "Request body must be a JSON object");
  }
  const category = typeof payload.category === "string" ? payload.category.trim() : "other";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!CATEGORIES.has(category)) return failure(422, "VALIDATION_ERROR", "Invalid report category");
  if (message.length > MAX_MESSAGE) return failure(422, "VALIDATION_ERROR", "Report message is too long");

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !anonKey || !token) throw new Error("configuration");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }

  async function rows(table, query) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") endpoint.searchParams.set(key, String(value));
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
    if (response.status >= 300 && response.status < 400 || !response.ok) {
      throw new Error("Supabase REST read failed");
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Supabase REST returned an invalid collection");
    return payload;
  }

  async function insert(table, body) {
    const endpoint = new URL("/rest/v1/" + table, base);
    const response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        accept: "application/json",
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400 || !response.ok) {
      throw new Error("Supabase REST insert failed");
    }
    const payload = await response.json();
    return Array.isArray(payload) ? (payload[0] || null) : null;
  }

  let questionRows;
  try {
    questionRows = await rows("questions", {
      select: "id,subject_id,is_published,archived_at,subjects(slug,specialty_slug,is_active)",
      id: "eq." + questionId,
      is_published: "eq.true",
      archived_at: "is.null",
      limit: "1",
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Не удалось проверить вопрос для жалобы");
  }
  const question = questionRows[0];
  if (!question || question.is_published !== true || question.archived_at) {
    return failure(404, "NOT_FOUND", "Опубликованный вопрос не найден");
  }

  const subject = related(question.subjects);
  const subjectSlug = String(subject?.slug || "").trim().toLowerCase();
  const specialty = subjectSlug === "histology"
    ? "mbh"
    : String(subject?.specialty_slug || "").trim().toLowerCase();
  if (specialty) {
    let memberships;
    try {
      memberships = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к вопросу не удалось проверить");
    }
    const allowed = memberships.some((membership) => {
      const group = related(membership?.groups);
      return Boolean(group) && group.is_active === true &&
        String(group.specialty_slug || "").trim().toLowerCase() === specialty;
    });
    if (!allowed) return failure(403, "FORBIDDEN", "Нет доступа к отправке жалобы на этот вопрос");
  }

  const query = {
    select: "id,question_id,reporter_user_id,category,message,status,work_id,created_at",
    question_id: "eq." + questionId,
    reporter_user_id: "eq." + identity.user.id,
    status: "in.(new,reviewing)",
    category: "eq." + category,
    limit: "1",
  };
  try {
    const duplicateRows = await rows("question_reports", query);
    if (duplicateRows[0]) {
      return { ok: true, data: { item: duplicateRows[0], duplicate: true } };
    }
    const item = await insert("question_reports", {
      question_id: questionId,
      reporter_user_id: identity.user.id,
      category,
      message: message || null,
    });
    if (!item) return failure(503, "DB_UNAVAILABLE", "Не удалось сохранить жалобу");
    return { ok: true, status: 201, data: { item, duplicate: false } };
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Не удалось сохранить сообщение об ошибке вопроса");
  }
}
