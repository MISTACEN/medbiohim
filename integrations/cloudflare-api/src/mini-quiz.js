import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;
const MAX_IDS = 12;
const MAX_SELECTED = 100;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}
function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}
function parseOptions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}
function sortNumbers(values) {
  return [...values].sort((a, b) => a - b);
}
function getCorrectIndexes(row, options) {
  let correct = [];
  options.forEach((option, index) => {
    if (option && typeof option === "object" && !Array.isArray(option) && Boolean(option.correct)) {
      correct.push(index);
    }
  });
  const answer = String(row.answer ?? "");
  if (!correct.length && /^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(answer)) {
    correct = answer.trim().split(/\s*,\s*/).map(Number);
  }
  if (!correct.length && answer !== "") {
    const normalized = answer.toLocaleLowerCase().trim();
    options.forEach((option, index) => {
      const label = String(option && typeof option === "object" && !Array.isArray(option)
        ? (option.label ?? "") : (option ?? "")).toLocaleLowerCase().trim();
      if (label && label === normalized) correct.push(index);
    });
  }
  return sortNumbers([...new Set(correct)]);
}

async function createReader(request, env, fetcher) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
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
      throw new Error("Supabase REST request failed");
    }
    if (response.status >= 300 && response.status < 400 || !response.ok) {
      throw new Error("Supabase REST request failed");
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Supabase REST returned an invalid collection");
    return payload;
  }
  return { ok: true, identity, rows };
}

async function checkSubjectAccess(reader, subjectId) {
  let subjects;
  try {
    subjects = await reader.rows("subjects", {
      select: "id,slug,specialty_slug,is_active",
      id: "eq." + subjectId,
      is_active: "eq.true",
      limit: "1",
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Доступ к предмету не удалось проверить");
  }
  const subject = subjects[0];
  if (!subject || subject.is_active !== true) return failure(404, "NOT_FOUND", "Активный предмет не найден");
  const slug = String(subject.slug || "").trim().toLowerCase();
  const specialty = String(subject.specialty_slug || "").trim().toLowerCase();
  if (!specialty) return { ok: true };

  let memberships;
  try {
    memberships = await reader.rows("group_memberships", {
      select: "group_id,groups(specialty_slug,is_active)",
      user_id: "eq." + reader.identity.user.id,
      is_active: "eq.true",
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Доступ к предмету не удалось проверить");
  }
  const allowed = memberships.some((membership) => {
    const group = related(membership?.groups);
    const groupSpecialty = String(group?.specialty_slug || "").trim().toLowerCase();
    if (!group || group.is_active !== true || !groupSpecialty) return false;
    return groupSpecialty === specialty ||
      (specialty === "mbh" && (groupSpecialty === "mbh" || slug === "histology" && groupSpecialty === "mbh"));
  });
  if (!allowed) return failure(403, "FORBIDDEN", "Нет доступа к мини-тесту этого предмета");
  return { ok: true };
}

function publicOptions(value) {
  return parseOptions(value).map((option, index) => ({
    index,
    label: String(option && typeof option === "object" && !Array.isArray(option)
      ? (option.label ?? "") : (option ?? "")),
  }));
}

export async function listSupabaseLectureMiniQuiz(request, env, filters = {}, fetcher = fetch) {
  const created = await createReader(request, env, fetcher);
  if (!created.ok) return created;
  const subjectId = String(filters.subject_id || "").trim();
  const rawIds = String(filters.ids || "").trim();
  if (!validId(subjectId) || !rawIds) {
    return failure(422, "VALIDATION_ERROR", "subject_id and ids are required");
  }
  const parsedIds = rawIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (!parsedIds.length || parsedIds.length > MAX_IDS || parsedIds.some((id) => !validId(id))) {
    return failure(422, "VALIDATION_ERROR", "ids must contain at most 12 valid question ids");
  }
  const ids = [...new Set(parsedIds)];
  if (!ids.length) return failure(422, "VALIDATION_ERROR", "ids are required");

  const access = await checkSubjectAccess(created, subjectId);
  if (!access.ok) return access;
  let rows;
  try {
    rows = await created.rows("questions", {
      select: "id,subject_id,module_id,topic_id,type,text,options",
      id: "in.(" + ids.join(",") + ")",
      subject_id: "eq." + subjectId,
      is_published: "eq.true",
      archived_at: "is.null",
      limit: String(MAX_IDS),
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Мини-тест временно недоступен");
  }
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const items = ids.filter((id) => byId.has(id)).map((id) => {
    const row = byId.get(id);
    return {
      id: row.id,
      subject_id: row.subject_id,
      module_id: row.module_id ?? null,
      topic_id: row.topic_id ?? null,
      type: row.type ?? null,
      text: row.text ?? "",
      options: publicOptions(row.options),
    };
  });
  return { ok: true, data: { items, source: "db" } };
}

export async function checkSupabaseLectureMiniQuizAnswer(request, env, payload, fetcher = fetch) {
  const created = await createReader(request, env, fetcher);
  if (!created.ok) return created;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(422, "VALIDATION_ERROR", "Request body must be a JSON object");
  }
  const questionId = typeof payload.question_id === "string" ? payload.question_id.trim() : "";
  const subjectId = typeof payload.subject_id === "string" ? payload.subject_id.trim() : "";
  const selectedRaw = payload.selected_indexes === undefined ? [] : payload.selected_indexes;
  if (!validId(questionId) || !validId(subjectId) || !Array.isArray(selectedRaw) || selectedRaw.length > MAX_SELECTED) {
    return failure(422, "VALIDATION_ERROR", "question_id, subject_id and selected_indexes are required");
  }
  if (selectedRaw.some((value) => !Number.isInteger(value) || value < 0 || value > 1000)) {
    return failure(422, "VALIDATION_ERROR", "selected_indexes must contain non-negative integer indexes");
  }
  const selected = sortNumbers([...new Set(selectedRaw)]);
  const access = await checkSubjectAccess(created, subjectId);
  if (!access.ok) return access;

  let matches;
  try {
    matches = await created.rows("questions", {
      select: "id,subject_id,type,answer,options",
      id: "eq." + questionId,
      subject_id: "eq." + subjectId,
      is_published: "eq.true",
      archived_at: "is.null",
      limit: "1",
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Не удалось проверить ответ мини-теста");
  }
  const row = matches[0];
  if (!row) return failure(404, "NOT_FOUND", "Вопрос мини-теста не найден");
  const correct = getCorrectIndexes(row, parseOptions(row.options));
  return {
    ok: true,
    data: {
      correct: correct.length > 0 && JSON.stringify(selected) === JSON.stringify(correct),
      selected_count: selected.length,
      required_count: correct.length,
      question_type: String(row.type || "mcq"),
    },
  };
}
