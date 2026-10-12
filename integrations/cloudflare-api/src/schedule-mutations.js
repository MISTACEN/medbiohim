import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5000;
const SCHEDULE_TYPES = new Set(["lecture", "practice", "laboratory", "seminar", "exam", "credit", "consultation", "other", "retake"]);
const ENTRY_FIELDS = new Set([
  "subject_id", "date", "start_time", "end_time", "type", "room", "building", "notes",
  "is_cancelled", "subject_name", "sort_order", "session_id", "event_kind", "is_makeup",
  "source", "teacher", "academic_hours", "week_parity", "recurrence_group", "parent_entry_id",
  "source_detail", "breaks",
]);

function fail(status, code, message) { return { ok: false, status, code, message }; }
function uuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }

function validateEntry(input, creating) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(422, "VALIDATION_ERROR", "Ожидается JSON-объект занятия");
  const body = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "schedule_id") continue;
    if (!ENTRY_FIELDS.has(key)) return fail(422, "VALIDATION_ERROR", "Неизвестное поле занятия: " + key);
    body[key] = value;
  }
  if (creating) {
    if (!uuid(input.schedule_id)) return fail(422, "VALIDATION_ERROR", "schedule_id должен быть UUID");
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
        typeof body.start_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.start_time) ||
        typeof body.end_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.end_time) ||
        body.start_time >= body.end_time) {
      return fail(422, "VALIDATION_ERROR", "Укажите корректные дату, время начала и время окончания");
    }
    if (typeof body.type !== "string" || !SCHEDULE_TYPES.has(body.type)) return fail(422, "VALIDATION_ERROR", "Некорректный тип занятия");
    body.schedule_id = input.schedule_id;
    body.event_kind ??= "class";
    body.source ??= "schedule";
    body.is_cancelled ??= false;
    body.is_makeup ??= false;
    body.sort_order ??= 0;
    body.breaks ??= [];
  } else if (Object.keys(body).length === 0) {
    return fail(422, "VALIDATION_ERROR", "Нет полей для изменения");
  }
  if (body.date !== undefined && (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) return fail(422, "VALIDATION_ERROR", "Некорректная дата");
  if (body.start_time !== undefined && (typeof body.start_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.start_time))) return fail(422, "VALIDATION_ERROR", "Некорректное время начала");
  if (body.end_time !== undefined && (typeof body.end_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.end_time))) return fail(422, "VALIDATION_ERROR", "Некорректное время окончания");
  if (body.type !== undefined && !SCHEDULE_TYPES.has(body.type)) return fail(422, "VALIDATION_ERROR", "Некорректный тип занятия");
  for (const key of ["room", "building", "notes", "subject_name", "teacher", "source_detail", "recurrence_group"]) {
    if (body[key] !== undefined && body[key] !== null && (typeof body[key] !== "string" || body[key].length > 2000)) return fail(422, "VALIDATION_ERROR", "Поле " + key + " слишком длинное или имеет неверный тип");
  }
  if (body.breaks !== undefined && !Array.isArray(body.breaks)) return fail(422, "VALIDATION_ERROR", "breaks должен быть массивом");
  if (body.is_cancelled !== undefined && typeof body.is_cancelled !== "boolean") return fail(422, "VALIDATION_ERROR", "is_cancelled должен быть boolean");
  if (body.is_makeup !== undefined && typeof body.is_makeup !== "boolean") return fail(422, "VALIDATION_ERROR", "is_makeup должен быть boolean");
  if (body.sort_order !== undefined && (!Number.isInteger(body.sort_order) || body.sort_order < 0 || body.sort_order > 100000)) return fail(422, "VALIDATION_ERROR", "sort_order вне диапазона");
  return { ok: true, data: body };
}

export async function mutateSupabaseScheduleEntry(request, env, operation, entryId = "", input = null, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  if (!["create", "update", "delete"].includes(operation)) return fail(400, "INVALID_OPERATION", "Unknown schedule operation");
  if (operation !== "create" && !uuid(entryId)) return fail(422, "VALIDATION_ERROR", "Некорректный ID занятия");

  let body;
  if (operation === "create" || operation === "update") {
    const checked = validateEntry(input, operation === "create");
    if (!checked.ok) return checked;
    body = checked.data;
  }

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(baseUrl); if (base.protocol !== "https:" || !anonKey) throw new Error("config"); }
  catch { return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }

  async function call(table, params, init = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    return fetcher(endpoint.toString(), {
      ...init,
      headers: {
        apikey: anonKey, authorization: "Bearer " + token, accept: "application/json",
        ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}),
        ...(init.headers || {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  try {
    if (operation === "create") {
      const sr = await call("schedules", { select: "id,is_active", id: "eq." + body.schedule_id, limit: "1" });
      if (sr.status === 401 || sr.status === 403) return fail(403, "SCHEDULE_ACCESS_DENIED", "Недостаточно прав для изменения расписания");
      if (!sr.ok) throw new Error("schedule lookup failed");
      const schedules = await sr.json();
      if (!Array.isArray(schedules) || !schedules[0] || schedules[0].is_active === false) return fail(404, "SCHEDULE_NOT_FOUND", "Активная версия расписания не найдена");
      const wr = await call("schedule_entries", { select: "*" }, { method: "POST", body: JSON.stringify(body) });
      if (wr.status === 401 || wr.status === 403) return fail(403, "SCHEDULE_ACCESS_DENIED", "Создание занятий разрешено только ответственным редакторам расписания");
      if (wr.status === 400 || wr.status === 422) return fail(422, "VALIDATION_ERROR", "База данных отклонила параметры занятия");
      if (!wr.ok) throw new Error("schedule insert failed");
      const rows = await wr.json();
      if (!Array.isArray(rows) || !rows[0]) throw new Error("empty insert response");
      return { ok: true, data: { item: rows[0] } };
    }

    const currentResponse = await call("schedule_entries", { select: "id,schedule_id", id: "eq." + entryId, limit: "1" });
    if (currentResponse.status === 401 || currentResponse.status === 403) return fail(403, "SCHEDULE_ACCESS_DENIED", "Недостаточно прав для изменения расписания");
    if (!currentResponse.ok) throw new Error("entry lookup failed");
    const currentRows = await currentResponse.json();
    if (!Array.isArray(currentRows) || !currentRows[0]) return fail(404, "NOT_FOUND", "Занятие не найдено");
    const scheduleResponse = await call("schedules", { select: "id,is_active", id: "eq." + currentRows[0].schedule_id, limit: "1" });
    if (!scheduleResponse.ok) throw new Error("schedule lookup failed");
    const schedules = await scheduleResponse.json();
    if (!Array.isArray(schedules) || !schedules[0] || schedules[0].is_active === false) return fail(409, "SCHEDULE_VERSION_INACTIVE", "Нельзя изменять занятие в неактивной версии расписания");

    // Deletion is a soft cancel so historical schedule references and homework links remain valid.
    const changes = operation === "delete" ? { is_cancelled: true } : body;
    if (operation === "update" && changes.schedule_id) return fail(422, "VALIDATION_ERROR", "Перенос занятия между версиями расписания не поддерживается");
    const wr = await call("schedule_entries", { id: "eq." + entryId, select: "*" }, { method: "PATCH", body: JSON.stringify(changes) });
    if (wr.status === 401 || wr.status === 403) return fail(403, "SCHEDULE_ACCESS_DENIED", "Изменение расписания разрешено только ответственным редакторам");
    if (wr.status === 400 || wr.status === 422) return fail(422, "VALIDATION_ERROR", "База данных отклонила изменения занятия");
    if (!wr.ok) throw new Error("schedule update failed");
    const rows = await wr.json();
    if (!Array.isArray(rows) || !rows[0]) return fail(404, "NOT_FOUND", "Занятие не найдено или недоступно");
    return { ok: true, data: { item: rows[0], deleted: operation === "delete" } };
  } catch {
    return fail(503, "SCHEDULE_WRITE_UNAVAILABLE", "Не удалось сохранить изменения расписания");
  }
}
