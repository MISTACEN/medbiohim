import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5000;
const TYPES = new Set(["lecture", "practice", "laboratory", "seminar", "exam", "credit", "consultation", "other", "retake"]);
const fail = (status, code, message) => ({ ok: false, status, code, message });
const uuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));

function normalizeEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 1000) return fail(422, "VALIDATION_ERROR", "entries должен быть массивом не более 1000 занятий");
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || typeof e !== "object" || Array.isArray(e)) return fail(422, "VALIDATION_ERROR", `Занятие ${i + 1} имеет неверный формат`);
    const date = String(e.date || "").trim();
    const start = String(e.start_time ?? e.startTime ?? "").trim();
    const end = String(e.end_time ?? e.endTime ?? "").trim();
    const type = String(e.type || "other");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(start) ||
        !/^\d{2}:\d{2}(:\d{2})?$/.test(end) || start >= end || !TYPES.has(type)) {
      return fail(422, "VALIDATION_ERROR", `Некорректная дата, время или тип занятия №${i + 1}`);
    }
    const row = {
      date, start_time: start, end_time: end, type,
      subject_id: e.subject_id || null,
      room: e.room == null ? null : String(e.room).slice(0, 200),
      building: e.building == null ? null : String(e.building).slice(0, 200),
      notes: e.notes == null ? null : String(e.notes).slice(0, 2000),
      teacher: e.teacher == null ? null : String(e.teacher).slice(0, 200),
      subject_name: e.subject_name == null ? (e.subject == null ? null : String(e.subject).slice(0, 200)) : String(e.subject_name).slice(0, 200),
      is_cancelled: e.is_cancelled === true,
      academic_hours: Number.isInteger(e.academic_hours) && e.academic_hours > 0 ? e.academic_hours : null,
      week_parity: ["numerator", "denominator", "all"].includes(e.week_parity) ? e.week_parity : null,
      recurrence_group: e.recurrence_group == null ? null : String(e.recurrence_group).slice(0, 200),
      parent_entry_id: e.parent_entry_id || null,
      source_detail: e.source_detail == null ? null : String(e.source_detail).slice(0, 2000),
      event_kind: typeof e.event_kind === "string" && e.event_kind.length <= 80 ? e.event_kind : "class",
      is_makeup: e.is_makeup === true,
      session_id: e.session_id || null,
      source: typeof e.source === "string" && e.source.length <= 80 ? e.source : "official",
      sort_order: Number.isInteger(e.sort_order) && e.sort_order >= 0 ? e.sort_order : i,
      breaks: Array.isArray(e.breaks) ? e.breaks : [],
    };
    for (const key of ["subject_id", "parent_entry_id", "session_id"]) if (row[key] && !uuid(row[key])) return fail(422, "VALIDATION_ERROR", `Некорректный UUID в занятии №${i + 1}`);
    out.push(row);
  }
  return { ok: true, data: out };
}

export async function getSupabaseAdminSchedule(request, env, groupId, semester, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  if (!uuid(groupId)) return fail(422, "VALIDATION_ERROR", "group_id должен быть UUID");
  const sem = semester == null || semester === "" ? null : Number(semester);
  if (sem !== null && (!Number.isInteger(sem) || sem < 1 || sem > 12)) return fail(422, "VALIDATION_ERROR", "semester должен быть от 1 до 12");
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim(), anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(baseUrl); if (base.protocol !== "https:" || !anonKey) throw new Error("config"); }
  catch { return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function rows(table, params) {
    const url = new URL("/rest/v1/" + table, base);
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetcher(url.toString(), { headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("denied"), { denied: true });
    if (!res.ok) throw new Error("read failed");
    const data = await res.json(); if (!Array.isArray(data)) throw new Error("invalid response"); return data;
  }
  try {
    const filters = { group_id: "eq." + groupId, select: "id,group_id,semester,academic_year,academic_year_id,version,is_active,created_at", order: "version.desc,created_at.desc", limit: "100" };
    filters.semester = sem === null ? "is.null" : "eq." + sem;
    const schedules = await rows("schedules", filters);
    const schedule = schedules[0] || null;
    if (!schedule) return { ok: true, data: { schedule: null, items: [] } };
    const items = await rows("schedule_entries", {
      schedule_id: "eq." + schedule.id,
      select: "id,schedule_id,subject_id,date,start_time,end_time,type,room,building,notes,is_cancelled,subject_name,sort_order,session_id,event_kind,is_makeup,source,teacher,academic_hours,week_parity,recurrence_group,parent_entry_id,source_detail,breaks",
      order: "date.asc,start_time.asc,sort_order.asc", limit: "1000",
    });
    return { ok: true, data: { schedule, items } };
  } catch (e) {
    return e && e.denied ? fail(403, "SCHEDULE_ACCESS_DENIED", "Просмотр редактора расписания разрешён ответственным редакторам") : fail(503, "SCHEDULE_UNAVAILABLE", "Не удалось загрузить редактор расписания");
  }
}

export async function replaceSupabaseAdminSchedule(request, env, input, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(422, "VALIDATION_ERROR", "Ожидается JSON-объект расписания");
  const groupId = String(input.group_id || "").trim();
  if (!uuid(groupId)) return fail(422, "VALIDATION_ERROR", "group_id должен быть UUID");
  const semester = input.semester == null || input.semester === "" ? null : Number(input.semester);
  if (semester !== null && (!Number.isInteger(semester) || semester < 1 || semester > 12)) return fail(422, "VALIDATION_ERROR", "semester должен быть от 1 до 12");
  const normalized = normalizeEntries(input.entries);
  if (!normalized.ok) return normalized;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim(), anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(baseUrl); if (base.protocol !== "https:" || !anonKey) throw new Error("config"); }
  catch { return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function call(table, params, init = {}) {
    const url = new URL("/rest/v1/" + table, base);
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k, String(v));
    return fetcher(url.toString(), { ...init, headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json", ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}), ...(init.headers || {}) }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
  const semesterFilter = semester === null ? "is.null" : "eq." + semester;
  let newScheduleId = "";
  try {
    const oldResponse = await call("schedules", { group_id: "eq." + groupId, semester: semesterFilter, select: "id,version,is_active", order: "version.desc", limit: "100" });
    if (oldResponse.status === 401 || oldResponse.status === 403) return fail(403, "SCHEDULE_ACCESS_DENIED", "Изменение расписания разрешено только ответственным редакторам");
    if (!oldResponse.ok) throw new Error("schedule list failed");
    const oldRows = await oldResponse.json();
    if (!Array.isArray(oldRows)) throw new Error("invalid schedules");
    const version = Math.max(0, ...oldRows.map((r) => Number(r.version) || 0)) + 1;
    const yearId = input.academic_year_id == null || input.academic_year_id === "" ? null : String(input.academic_year_id);
    if (yearId && !uuid(yearId)) return fail(422, "VALIDATION_ERROR", "academic_year_id должен быть UUID");
    const create = await call("schedules", { select: "id,group_id,semester,version,is_active" }, { method: "POST", body: JSON.stringify({ group_id: groupId, semester, academic_year_id: yearId, version, is_active: false }) });
    if (create.status === 401 || create.status === 403) return fail(403, "SCHEDULE_ACCESS_DENIED", "Создание расписания разрешено только ответственным редакторам");
    if (!create.ok) throw new Error("schedule create failed");
    const createdRows = await create.json();
    if (!Array.isArray(createdRows) || !createdRows[0]?.id) throw new Error("missing new schedule id");
    newScheduleId = String(createdRows[0].id);
    for (const entry of normalized.data) {
      const response = await call("schedule_entries", { select: "id" }, { method: "POST", body: JSON.stringify({ ...entry, schedule_id: newScheduleId }) });
      if (response.status === 401 || response.status === 403) throw Object.assign(new Error("denied"), { denied: true });
      if (!response.ok) throw new Error("entry insert failed");
    }
    const activate = await call("schedules", { id: "eq." + newScheduleId, select: "id,is_active" }, { method: "PATCH", body: JSON.stringify({ is_active: true }) });
    if (activate.status === 401 || activate.status === 403) throw Object.assign(new Error("denied"), { denied: true });
    if (!activate.ok) throw new Error("activate failed");
    const deactivate = await call("schedules", { group_id: "eq." + groupId, semester: semesterFilter, is_active: "eq.true", id: "neq." + newScheduleId }, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
    if (!deactivate.ok) throw new Error("old version deactivate failed");
    return { ok: true, data: { schedule_id: newScheduleId, group_id: groupId, semester, version, entries_saved: normalized.data.length } };
  } catch (e) {
    if (newScheduleId) {
      try { await call("schedules", { id: "eq." + newScheduleId }, { method: "PATCH", body: JSON.stringify({ is_active: false }) }); } catch {}
    }
    return e && e.denied ? fail(403, "SCHEDULE_ACCESS_DENIED", "Изменение расписания разрешено только ответственным редакторам") : fail(503, "SCHEDULE_WRITE_UNAVAILABLE", "Не удалось сохранить новую версию расписания; предыдущая версия сохранена");
  }
}
