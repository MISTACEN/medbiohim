import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 8000;
const ALLOWED_STATUSES = new Set(["in_progress", "completed", "cancelled"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });

function validId(value) {
  const id = String(value || "").trim();
  return UUID.test(id) ? id : "";
}

async function callTrainingRpc(request, env, rpcName, args, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    endpoint = new URL("/rest/v1/rpc/" + rpcName, String(env.SUPABASE_URL || "").trim());
    if (endpoint.protocol !== "https:" || !anonKey || !token) throw new Error("configuration");
  } catch {
    return fail(503, "TRAINING_NOT_CONFIGURED", "Тренировки временно недоступны");
  }

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
      body: JSON.stringify(args),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fail(503, "TRAINING_UPSTREAM_ERROR", "Тренировки временно недоступны");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    if (response.status === 401) return fail(401, "UNAUTHORIZED", "Недействительная сессия");
    // The partial unique index is the final concurrency guard if two start
    // requests race. Keep the public API contract consistent with the RPC's
    // normal TRAINING_IN_PROGRESS response without exposing SQL diagnostics.
    if (rpcName === "histology_training_create" && response.status === 409 && payload?.code === "23505") {
      return fail(409, "TRAINING_IN_PROGRESS", "У вас уже есть незавершённая тренировка");
    }
    // Never pass Postgres/PostgREST diagnostics to the browser.
    return fail(503, "TRAINING_UPSTREAM_ERROR", "Тренировки временно недоступны");
  }

  if (payload.ok !== true) {
    const status = [400, 401, 403, 404, 409, 413, 422].includes(Number(payload.status)) ? Number(payload.status) : 503;
    const code = /^[A-Z0-9_]{1,60}$/.test(String(payload.code || "")) ? String(payload.code) : "TRAINING_UPSTREAM_ERROR";
    const message = String(payload.message || "Тренировки временно недоступны").slice(0, 240);
    const extra = payload.existing_training_id && UUID.test(String(payload.existing_training_id))
      ? { existing_training_id: payload.existing_training_id }
      : {};
    return fail(status, code, message, extra);
  }

  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    return fail(503, "TRAINING_UPSTREAM_ERROR", "Некорректный ответ хранилища тренировок");
  }
  return { ok: true, data: payload.data };
}

/** List the caller's own sessions through a SECURITY DEFINER RPC; never read
 * trainings/training_answers directly because client table grants are revoked. */
export async function listSupabaseTrainings(request, env, options = {}, fetcher = fetch) {
  const status = String(options.status || "").trim();
  if (status && !ALLOWED_STATUSES.has(status)) return fail(422, "VALIDATION_ERROR", "Недопустимый статус тренировки");
  return callTrainingRpc(request, env, "histology_training_list", { p_status: status || null }, fetcher);
}

export async function createSupabaseTraining(request, env, input, fetcher = fetch) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fail(422, "VALIDATION_ERROR", "Передайте настройки тренировки");
  }
  return callTrainingRpc(request, env, "histology_training_create", { p_input: input }, fetcher);
}

export async function getSupabaseTraining(request, env, trainingId, fetcher = fetch) {
  const id = validId(trainingId);
  if (!id) return fail(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  return callTrainingRpc(request, env, "histology_training_get", { p_training_id: id }, fetcher);
}

export async function answerSupabaseTrainingQuestion(request, env, trainingId, input, fetcher = fetch) {
  const id = validId(trainingId);
  if (!id) return fail(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(422, "VALIDATION_ERROR", "Некорректный ответ");
  const order = Number(input.order);
  if (!Number.isInteger(order) || order < 0 || order > 499) return fail(422, "VALIDATION_ERROR", "Некорректный номер вопроса");
  const skipped = input.is_skipped === true;
  if (input.is_skipped !== undefined && typeof input.is_skipped !== "boolean") return fail(422, "VALIDATION_ERROR", "Некорректный признак пропуска");
  const answer = input.user_answer;
  if (answer !== null && answer !== undefined && typeof answer !== "string") return fail(422, "VALIDATION_ERROR", "Ответ должен быть текстом");
  if (!skipped && !String(answer || "").trim()) return fail(422, "VALIDATION_ERROR", "Введите ответ или пропустите вопрос");
  if (String(answer || "").length > 5000) return fail(422, "VALIDATION_ERROR", "Ответ слишком длинный");
  return callTrainingRpc(request, env, "histology_training_answer", {
    p_training_id: id,
    p_order: order,
    p_user_answer: skipped ? null : (answer == null ? null : answer),
    p_is_skipped: skipped,
  }, fetcher);
}

export async function completeSupabaseTraining(request, env, trainingId, fetcher = fetch) {
  const id = validId(trainingId);
  if (!id) return fail(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  return callTrainingRpc(request, env, "histology_training_complete", { p_training_id: id }, fetcher);
}

export async function cancelSupabaseTraining(request, env, trainingId, fetcher = fetch) {
  const id = validId(trainingId);
  if (!id) return fail(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  return callTrainingRpc(request, env, "histology_training_cancel", { p_training_id: id }, fetcher);
}
