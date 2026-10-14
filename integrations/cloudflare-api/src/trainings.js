const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPES = new Set(["all", "preparation", "electronogram"]);
const LABEL_MODES = new Set(["with", "without", "manual"]);
const LAYOUT_MODES = new Set(["sidebar", "list", "top"]);
const STATUSES = new Set(["in_progress", "completed", "cancelled"]);
const TIMEOUT_MS = 8000;

function failure(status, code, message, extra = {}) {
  return { ok: false, status, code, message, ...extra };
}

async function callTrainingRpc(request, env, name, args, fetcher = fetch) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  if (!token) return failure(401, "UNAUTHORIZED", "Требуется войти в систему");
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co") || !anonKey) throw new Error("config");
    endpoint = new URL("/rest/v1/rpc/" + name, base);
  } catch {
    return failure(503, "TRAINING_NOT_CONFIGURED", "Защищённый API тренировок не настроен");
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
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return failure(503, "TRAINING_UPSTREAM_ERROR", "Тренировки временно недоступны");
  }
  if (response.status >= 300 && response.status < 400) {
    return failure(503, "TRAINING_UPSTREAM_ERROR", "Тренировки временно недоступны");
  }
  let payload;
  try { payload = await response.json(); }
  catch { return failure(503, "TRAINING_UPSTREAM_ERROR", "Некорректный ответ сервиса тренировок"); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return failure(401, "UNAUTHORIZED", "Сессия недействительна или истекла");
    }
    return failure(503, "TRAINING_UPSTREAM_ERROR", "Тренировки временно недоступны");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(503, "TRAINING_UPSTREAM_ERROR", "Некорректный ответ сервиса тренировок");
  }
  if (payload.ok === false) {
    const status = Number(payload.status);
    return failure(
      Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503,
      typeof payload.code === "string" ? payload.code : "TRAINING_UPSTREAM_ERROR",
      typeof payload.message === "string" ? payload.message : "Тренировка временно недоступна",
      payload.existing_training_id ? { existing_training_id: payload.existing_training_id } : {},
    );
  }
  if (payload.ok !== true || !payload.data || typeof payload.data !== "object") {
    return failure(503, "TRAINING_UPSTREAM_ERROR", "Некорректный ответ сервиса тренировок");
  }
  return { ok: true, data: payload.data };
}

export async function listSupabaseTrainings(request, env, options = {}, fetcher = fetch) {
  const status = String(options.status || "").trim();
  if (status && !STATUSES.has(status)) {
    return failure(422, "VALIDATION_ERROR", "Недопустимый статус тренировки");
  }
  return callTrainingRpc(request, env, "list_histology_trainings", {
    p_status: status || null,
  }, fetcher);
}

export async function createSupabaseTraining(request, env, payload = {}, fetcher = fetch) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(422, "VALIDATION_ERROR", "Некорректные параметры тренировки");
  }
  const topics = Array.isArray(payload.topics) ? payload.topics : [];
  const contentType = String(payload.content_type || "all");
  const labelMode = String(payload.label_mode || "without");
  const layoutMode = String(payload.layout_mode || "top");
  const rawCount = Number(payload.question_count ?? 20);
  if (topics.length > 100 || topics.some((x) => typeof x !== "string" || x.length > 200)
    || !CONTENT_TYPES.has(contentType) || !LABEL_MODES.has(labelMode) || !LAYOUT_MODES.has(layoutMode)
    || !Number.isFinite(rawCount)) {
    return failure(422, "VALIDATION_ERROR", "Некорректные параметры тренировки");
  }
  const cardIds = payload.card_ids === undefined || payload.card_ids === null
    ? null : payload.card_ids;
  if (cardIds !== null && (!Array.isArray(cardIds) || cardIds.length > 500
    || cardIds.some((id) => typeof id !== "string" || id.length > 200))) {
    return failure(422, "VALIDATION_ERROR", "Некорректный список карточек");
  }
  return callTrainingRpc(request, env, "create_histology_training", {
    p_topics: topics,
    p_content_type: contentType,
    p_question_count: Math.max(1, Math.min(500, Math.trunc(rawCount))),
    p_all_questions: payload.all_questions === true,
    p_label_mode: labelMode,
    p_layout_mode: layoutMode,
    p_card_ids: cardIds,
    p_force: payload.force === true,
  }, fetcher);
}

export async function getSupabaseTraining(request, env, trainingId, fetcher = fetch) {
  const id = String(trainingId || "");
  if (!UUID_RE.test(id)) return failure(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  return callTrainingRpc(request, env, "get_histology_training", { p_training_id: id }, fetcher);
}

export async function answerSupabaseTrainingQuestion(request, env, trainingId, payload = {}, fetcher = fetch) {
  const id = String(trainingId || "");
  if (!UUID_RE.test(id)) return failure(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(422, "VALIDATION_ERROR", "Некорректный ответ");
  }
  const order = Number(payload.order);
  const skipped = payload.is_skipped === true;
  const answer = payload.user_answer;
  if (!Number.isInteger(order) || order < 0 || order > 499
    || (!skipped && (typeof answer !== "string" || !answer.trim() || answer.length > 6000))
    || (skipped && answer !== null && answer !== undefined && typeof answer !== "string")) {
    return failure(422, "VALIDATION_ERROR", "Некорректный ответ");
  }
  return callTrainingRpc(request, env, "save_histology_training_answer", {
    p_training_id: id,
    p_order: order,
    p_user_answer: typeof answer === "string" ? answer.trim() : null,
    p_is_skipped: skipped,
  }, fetcher);
}

export async function completeSupabaseTraining(request, env, trainingId, fetcher = fetch) {
  const id = String(trainingId || "");
  if (!UUID_RE.test(id)) return failure(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  return callTrainingRpc(request, env, "complete_histology_training", { p_training_id: id }, fetcher);
}

export async function cancelSupabaseTraining(request, env, trainingId, fetcher = fetch) {
  const id = String(trainingId || "");
  if (!UUID_RE.test(id)) return failure(422, "VALIDATION_ERROR", "Некорректный идентификатор тренировки");
  return callTrainingRpc(request, env, "cancel_histology_training", { p_training_id: id }, fetcher);
}
