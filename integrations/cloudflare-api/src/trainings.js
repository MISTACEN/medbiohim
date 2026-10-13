import { authenticateSupabaseRequest } from "./supabase-auth.js";

const fail = (status, code, message) => ({ ok: false, status, code, message });
const TIMEOUT_MS = 8000;
const ALLOWED_STATUSES = new Set(["in_progress", "completed", "cancelled"]);

async function listRows(request, env, table, params, fetcher) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    endpoint = new URL("/rest/v1/" + table, baseUrl);
    if (endpoint.protocol !== "https:" || !anonKey || !token) return fail(503, "TRAINING_NOT_CONFIGURED", "Supabase REST is not configured");
  } catch {
    return fail(503, "TRAINING_NOT_CONFIGURED", "Supabase REST URL is invalid");
  }
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fail(503, "TRAINING_UPSTREAM_ERROR", "Тренировки временно недоступны");
  }
  if (response.status === 401 || response.status === 403) {
    return fail(401, "UNAUTHORIZED", "Недействительная сессия");
  }
  if (!response.ok) return fail(503, "TRAINING_UPSTREAM_ERROR", "Тренировки временно недоступны");
  try {
    const payload = await response.json();
    if (!Array.isArray(payload)) return fail(503, "TRAINING_UPSTREAM_ERROR", "Некорректный ответ хранилища тренировок");
    return { ok: true, data: payload };
  } catch {
    return fail(503, "TRAINING_UPSTREAM_ERROR", "Некорректный ответ хранилища тренировок");
  }
}

/**
 * GET /api/v1/trainings — preserves the legacy list response shape while
 * querying only the authenticated user's rows. Ownership is enforced both
 * by explicit user_id filtering and Supabase RLS.
 */
export async function listSupabaseTrainings(request, env, options = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const requestedStatus = String(options.status || "").trim();
  const status = ALLOWED_STATUSES.has(requestedStatus) ? requestedStatus : "";
  const trainingParams = {
    select: "id,subject_slug,specialty_slug,topics,content_type,question_count,label_mode,layout_mode,status,current_index,score,total_questions,completed_at,created_at,updated_at",
    user_id: "eq." + identity.user.id,
    order: "updated_at.desc",
    limit: "50",
  };
  if (status) trainingParams.status = "eq." + status;

  const trainingResult = await listRows(request, env, "trainings", trainingParams, fetcher);
  if (!trainingResult.ok) return trainingResult;
  const trainings = trainingResult.data;
  const answeredByTraining = new Map();
  const ids = trainings
    .map((row) => String(row?.id || ""))
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));

  if (ids.length) {
    const answersResult = await listRows(request, env, "training_answers", {
      select: "training_id,user_answer,is_skipped",
      training_id: "in.(" + ids.join(",") + ")",
      limit: "5000",
    }, fetcher);
    if (!answersResult.ok) return answersResult;
    for (const answer of answersResult.data) {
      const trainingId = String(answer?.training_id || "");
      if (answer?.user_answer !== null && answer?.user_answer !== undefined || answer?.is_skipped === true) {
        answeredByTraining.set(trainingId, (answeredByTraining.get(trainingId) || 0) + 1);
      }
    }
  }

  return {
    ok: true,
    data: {
      items: trainings.map((training) => ({
        ...training,
        answered_count: answeredByTraining.get(String(training.id)) || 0,
      })),
    },
  };
}
