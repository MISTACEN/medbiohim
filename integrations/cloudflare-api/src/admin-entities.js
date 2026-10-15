import { authenticateSupabaseRequest } from "./supabase-auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (status, code, message) => ({ ok: false, status, code, message });

function validatePayload(entity, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure(422, "VALIDATION_ERROR", "Ожидается JSON-объект");
  }
  const fields = entity === "groups"
    ? ["code", "name", "course_number", "admission_year", "academic_program_name", "is_active", "specialty_slug"]
    : ["code", "name", "short_name", "description", "course_number", "semester", "control_type", "lecture_hours", "practice_hours", "self_study_hours", "total_hours", "credits", "is_active", "slug", "specialty_slug", "color_hex"];
  const unknown = Object.keys(payload).filter((key) => !fields.includes(key));
  if (unknown.length) return failure(422, "VALIDATION_ERROR", "Переданы неподдерживаемые поля");
  if ("name" in payload && (typeof payload.name !== "string" || !payload.name.trim() || payload.name.trim().length > 180)) {
    return failure(422, "VALIDATION_ERROR", "Название обязательно и должно быть не длиннее 180 символов");
  }
  if ("code" in payload && payload.code != null && (typeof payload.code !== "string" || payload.code.trim().length > 64)) {
    return failure(422, "VALIDATION_ERROR", "Некорректный код");
  }
  if ("course_number" in payload && payload.course_number != null && (!Number.isInteger(Number(payload.course_number)) || Number(payload.course_number) < 1 || Number(payload.course_number) > 6)) {
    return failure(422, "VALIDATION_ERROR", "Курс должен быть от 1 до 6");
  }
  if (entity === "subjects" && "semester" in payload && payload.semester != null && (!Number.isInteger(Number(payload.semester)) || Number(payload.semester) < 1 || Number(payload.semester) > 12)) {
    return failure(422, "VALIDATION_ERROR", "Семестр должен быть от 1 до 12");
  }
  for (const field of ["lecture_hours", "practice_hours", "self_study_hours", "total_hours"]) {
    if (field in payload && payload[field] != null && (!Number.isInteger(Number(payload[field])) || Number(payload[field]) < 0 || Number(payload[field]) > 10000)) {
      return failure(422, "VALIDATION_ERROR", "Количество часов указано некорректно");
    }
  }
  if ("is_active" in payload && typeof payload.is_active !== "boolean") return failure(422, "VALIDATION_ERROR", "is_active должен быть boolean");
  if ("specialty_slug" in payload && payload.specialty_slug != null && (typeof payload.specialty_slug !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(payload.specialty_slug))) {
    return failure(422, "VALIDATION_ERROR", "Некорректный код специальности");
  }
  if ("color_hex" in payload && payload.color_hex != null && !/^#[0-9a-f]{6}$/i.test(String(payload.color_hex))) {
    return failure(422, "VALIDATION_ERROR", "Цвет должен быть в формате #RRGGBB");
  }
  return null;
}

export async function mutateSupabaseAdminEntity(request, env, entity, action, id, payload = {}, fetcher = fetch) {
  if (!["groups", "subjects"].includes(entity) || !["create", "update", "delete"].includes(action)) {
    return failure(404, "NOT_FOUND", "Операция не поддерживается");
  }
  if (action !== "create" && (!UUID.test(String(id || "")))) return failure(422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const invalid = validatePayload(entity, payload);
  if (invalid) return invalid;
  if (action === "create" && (!payload.name || !payload.name.trim())) return failure(422, "VALIDATION_ERROR", "Название обязательно");
  if (entity === "groups" && action === "create" && (typeof payload.code !== "string" || !payload.code.trim() || payload.code.trim().length > 64)) return failure(422, "VALIDATION_ERROR", "Код группы обязателен и должен быть не длиннее 64 символов");
  if (entity === "subjects" && "credits" in payload && payload.credits != null && (!Number.isFinite(Number(payload.credits)) || Number(payload.credits) < 0 || Number(payload.credits) > 1000)) return failure(422, "VALIDATION_ERROR", "Количество зачётных единиц указано некорректно");

  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) return failure(503, "DB_NOT_CONFIGURED", "Supabase REST is not configured");
  } catch {
    return failure(503, "DB_NOT_CONFIGURED", "Supabase URL is invalid");
  }
  const functionName = entity === "groups" ? "medbiohim_admin_mutate_group" : "medbiohim_admin_mutate_subject";
  const endpoint = new URL("/rest/v1/rpc/" + functionName, base);
  const authorization = request.headers.get("authorization") || "";
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: { apikey: anonKey, authorization, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ p_action: action, p_id: id || null, p_payload: payload }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Не удалось сохранить изменения");
  }
  if (response.status >= 300 && response.status < 400) return failure(503, "DB_UNAVAILABLE", "Не удалось сохранить изменения");
  let result = null;
  try { result = await response.json(); } catch {}
  if (response.status === 401 || response.status === 403) return failure(403, "FORBIDDEN", "Недостаточно прав администратора");
  if (response.status === 404) return failure(404, "NOT_FOUND", "Запись не найдена или миграция не применена");
  if (!response.ok) {
    if (response.status === 400 || response.status === 409 || response.status === 422) {
      return failure(422, "VALIDATION_ERROR", "Изменения отклонены проверками базы данных");
    }
    return failure(503, "DB_UNAVAILABLE", "Не удалось сохранить изменения");
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) return failure(503, "DB_UNAVAILABLE", "База данных вернула некорректный ответ");
  return { ok: true, data: result };
}
