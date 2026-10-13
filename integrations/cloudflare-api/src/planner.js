import { authenticateSupabaseRequest } from "./supabase-auth.js";

const fail = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });
const uuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
const rel = (v) => Array.isArray(v) ? v[0] : v;

async function client(request, env, fetcher) {
  const auth = await authenticateSupabaseRequest(request, env, fetcher);
  if (!auth.ok) return auth;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const key = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(String(env.SUPABASE_URL || "").trim()); if (base.protocol !== "https:" || !key) throw new Error("config"); }
  catch { return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function rows(table, params = {}, init = {}) {
    const u = new URL("/rest/v1/" + table, base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const r = await fetcher(u.toString(), {
      ...init, method: init.method || "GET",
      headers: { apikey: key, authorization: "Bearer " + token, accept: "application/json",
        ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}),
        ...(init.headers || {}) },
      redirect: "error", signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) { const e = new Error("REST failure"); e.status = r.status; throw e; }
    const data = await r.json(); return Array.isArray(data) ? data : [];
  }
  return { ok: true, identity: auth.user, rows };
}

async function groupFor(rows, userId, requested) {
  const memberships = await rows("group_memberships", {
    select: "group_id,groups(id,name,code,course_number,specialty_slug,is_active)",
    user_id: "eq." + userId, is_active: "eq.true", limit: "100",
  });
  const groups = [...new Map(memberships.map((m) => {
    const g = rel(m.groups);
    return !g || g.is_active === false || !m.group_id ? null : [String(m.group_id), { ...g, group_id: String(m.group_id) }];
  }).filter(Boolean)).values()];
  if (!groups.length) return fail(422, "NO_GROUP", "Назначьте активную учебную группу");
  if (requested) {
    if (!uuid(requested)) return fail(422, "VALIDATION_ERROR", "group_id должен быть UUID");
    const found = groups.find((g) => g.group_id === requested);
    return found ? { ok: true, group: found } : fail(403, "FORBIDDEN", "Нет доступа к указанной группе");
  }
  if (groups.length !== 1) return fail(409, "GROUP_REQUIRED", "Выберите учебную группу", { details: { groups: groups.map((g) => ({ id: g.group_id, name: g.name, code: g.code })) } });
  return { ok: true, group: groups[0] };
}

export async function getSupabasePlanner(request, env, filters = {}, fetcher = fetch) {
  const c = await client(request, env, fetcher); if (!c.ok) return c;
  const uid = c.identity.id;
  const from = String(filters.from || "").trim(), to = String(filters.to || "").trim();
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return fail(422, "VALIDATION_ERROR", "from и to должны иметь формат YYYY-MM-DD");
  try {
    const gr = await groupFor(c.rows, uid, String(filters.group_id || "")); if (!gr.ok) return gr;
    const gid = gr.group.group_id;
    const hwParams = {
      select: "id,title,description,due_at,due_date,subject_id,group_id,schedule_entry_id,created_by,created_at,subjects(name,slug,color_hex)",
      or: "(group_id.is.null,group_id.eq." + gid + ")",
      order: "due_date.asc.nullslast,due_at.asc.nullslast,created_at.desc", limit: "500",
    };
    if (from) hwParams.due_date = "gte." + from;
    let hw = await c.rows("homeworks", hwParams);
    hw = hw.filter((h) => !(to && h.due_date && String(h.due_date) > to));
    const ids = hw.map((h) => String(h.id)).filter(uuid);
    let prog = new Map(), subs = new Map();
    if (ids.length) {
      const byIds = "in.(" + ids.join(",") + ")";
      const results = await Promise.all([
        c.rows("homework_progress", { select: "homework_id,completed,submitted_at", user_id: "eq." + uid, homework_id: byIds, limit: "500" }),
        c.rows("homework_submissions", { select: "id,homework_id,status,grade,submitted_at", user_id: "eq." + uid, homework_id: byIds, order: "submitted_at.desc", limit: "500" }),
      ]);
      for (const p of results[0]) prog.set(String(p.homework_id), p);
      for (const s of results[1]) if (!subs.has(String(s.homework_id))) subs.set(String(s.homework_id), s);
    }
    const homeworks = hw.map((h) => {
      const p = prog.get(String(h.id)), s = subs.get(String(h.id)), sub = rel(h.subjects);
      const status = String(s?.status || "").toLowerCase();
      const mine = ["graded", "returned", "submitted"].includes(status)
        ? { my_status: status, my_status_source: "submission", submission_id: s.id || null, grade: s.grade ?? null }
        : p?.completed === true
          ? { my_status: "done", my_status_source: "progress", submission_id: null, grade: null }
          : { my_status: "pending", my_status_source: "none", submission_id: null, grade: null };
      return { id: h.id, title: h.title, description: h.description, due_at: h.due_at, due_date: h.due_date,
        subject_id: h.subject_id, group_id: h.group_id, schedule_entry_id: h.schedule_entry_id,
        created_by: h.created_by, created_at: h.created_at, subject_name: sub?.name ?? null,
        subject_slug: sub?.slug ?? null, color_hex: sub?.color_hex ?? null, my_completed: p?.completed === true,
        completed_at: p?.submitted_at ?? null, submission_status: s?.status ?? null, ...mine, attachments: [] };
    });
    const schedules = await c.rows("schedules", { select: "id,semester,version", group_id: "eq." + gid, is_active: "eq.true", limit: "20" });
    const scheduleIds = schedules.map((s) => String(s.id)).filter(uuid);
    let attendance = [];
    if (scheduleIds.length) {
      const ep = { select: "id,date,start_time,end_time,subject_id,subject_name,type,is_makeup,session_id,schedule_id,subjects(name,slug,color_hex)",
        schedule_id: "in.(" + scheduleIds.join(",") + ")", order: "date.asc,start_time.asc", limit: "1000" };
      if (from) ep.date = "gte." + from;
      let entries = await c.rows("schedule_entries", ep);
      entries = entries.filter((e) => !(to && e.date && String(e.date) > to));
      const eids = entries.map((e) => String(e.id)).filter(uuid);
      const ar = eids.length ? await c.rows("attendance_records", { select: "id,schedule_entry_id,status,note,marked_at",
        user_id: "eq." + uid, schedule_entry_id: "in.(" + eids.join(",") + ")", limit: "1000" }) : [];
      const byEntry = new Map(ar.map((a) => [String(a.schedule_entry_id), a]));
      const bySchedule = new Map(schedules.map((s) => [String(s.id), s]));
      attendance = entries.filter((e) => byEntry.has(String(e.id))).map((e) => {
        const a = byEntry.get(String(e.id)), subject = rel(e.subjects), schedule = bySchedule.get(String(e.schedule_id)) || {};
        return { id: a.id, schedule_entry_id: e.id, status: a.status, note: a.note, marked_at: a.marked_at,
          date: e.date, start_time: e.start_time, end_time: e.end_time, subject_id: e.subject_id,
          subject_name: e.subject_name || subject?.name || null, subject_slug: subject?.slug ?? null,
          color_hex: subject?.color_hex ?? null, type: e.type, is_makeup: e.is_makeup === true,
          session_id: e.session_id, schedule_id: e.schedule_id, semester: schedule.semester ?? null, schedule_version: schedule.version ?? null };
      });
    }
    const recovery = new Map();
    for (const a of attendance) {
      if (a.status === "present") continue;
      const key = String(a.subject_id || a.subject_name || "Без предмета");
      if (!recovery.has(key)) recovery.set(key, { subject_id: a.subject_id ?? null, subject_name: a.subject_name || "Без предмета",
        subject_slug: a.subject_slug ?? null, color_hex: a.color_hex ?? null, missed: 0, unexcused: 0, excused: 0, sick: 0, entries: [] });
      const v = recovery.get(key); v.missed++; if (a.status === "unexcused") v.unexcused++; else if (a.status === "sick") v.sick++; else v.excused++;
      v.entries.push({ date: a.date, start_time: a.start_time, status: a.status, is_makeup: a.is_makeup });
    }
    for (const h of homeworks) {
      if (["submitted", "graded", "returned", "done"].includes(String(h.my_status))) continue;
      const key = String(h.subject_id || h.subject_name || "Без предмета");
      if (!recovery.has(key)) recovery.set(key, { subject_id: h.subject_id ?? null, subject_name: h.subject_name || "Без предмета",
        subject_slug: h.subject_slug ?? null, color_hex: h.color_hex ?? null, missed: 0, unexcused: 0, excused: 0, sick: 0, entries: [] });
      const v = recovery.get(key); v.homeworks_pending = (v.homeworks_pending || 0) + 1;
    }
    return { ok: true, data: { group: gr.group, homeworks, attendance, recovery: [...recovery.values()] } };
  } catch (e) {
    if (e?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (e?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав");
    return fail(503, "PLANNER_ERROR", "Учебный планер временно недоступен");
  }
}

export async function setSupabaseAttendance(request, env, entryId, input, fetcher = fetch) {
  const c = await client(request, env, fetcher); if (!c.ok) return c;
  const uid = c.identity.id, status = String(input?.status || "").trim();
  if (!["present", "excused", "sick", "unexcused"].includes(status)) return fail(422, "VALIDATION_ERROR", "Недопустимый статус посещения");
  if (!uuid(entryId)) return fail(422, "VALIDATION_ERROR", "Некорректный id занятия");
  try {
    const gr = await groupFor(c.rows, uid, String(input?.group_id || "")); if (!gr.ok) return gr;
    const entries = await c.rows("schedule_entries", { select: "id,schedule_id,schedules!inner(id,group_id,is_active,version)", id: "eq." + entryId, limit: "1" });
    const entry = entries[0], schedule = rel(entry?.schedules);
    if (!entry || !schedule || schedule.is_active === false || String(schedule.group_id) !== gr.group.group_id) return fail(422, "INVALID_LESSON_CONTEXT", "Занятие не найдено в расписании выбранной группы");
    const saved = await c.rows("attendance_records", { on_conflict: "schedule_entry_id,user_id", select: "*" }, {
      method: "POST", headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ schedule_entry_id: entryId, user_id: uid, status, note: input?.note == null ? null : String(input.note).slice(0, 1000) }),
    });
    if (!saved[0]) return fail(503, "DB_ERROR", "Не удалось сохранить посещаемость");
    return { ok: true, data: { attendance: saved[0], context: { group_id: gr.group.group_id, schedule_id: schedule.id, schedule_version: schedule.version ?? null, session_id: null } } };
  } catch (e) {
    if (e?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (e?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав");
    if (e?.status === 400 || e?.status === 422) return fail(422, "VALIDATION_ERROR", "База данных отклонила параметры посещаемости");
    return fail(503, "DB_ERROR", "Не удалось сохранить посещаемость");
  }
}


// Presence handlers are kept in this module to make the deploy bundle leaner.
const presenceFail = (status, code, message) => ({ ok: false, status, code, message });
async function presenceClient(request, env, fetcher) {
  const auth = await authenticateSupabaseRequest(request, env, fetcher);
  if (!auth.ok) return auth;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const key = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(String(env.SUPABASE_URL || "").trim()); if (base.protocol !== "https:" || !key) throw new Error("config"); }
  catch { return presenceFail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function rows(table, params = {}, init = {}) {
    const u = new URL("/rest/v1/" + table, base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const r = await fetcher(u.toString(), {
      ...init, method: init.method || "GET",
      headers: { apikey: key, authorization: "Bearer " + token, accept: "application/json",
        ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}), ...(init.headers || {}) },
      redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) { const e = new Error("REST failure"); e.status = r.status; throw e; }
    const data = await r.json(); return Array.isArray(data) ? data : [];
  }
  return { ok: true, identity: auth.user, rows };
}
async function rolesFor(rows, uid) {
  try {
    const data = await rows("user_roles", { select: "roles(code)", user_id: "eq." + uid, limit: "20" });
    return [...new Set(data.flatMap((row) => {
      const roles = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
      return roles.map((r) => String(r?.code || "").toLowerCase().trim()).filter(Boolean);
    }))];
  } catch { return []; }
}
export async function heartbeatSupabasePresence(request, env, fetcher = fetch) {
  const c = await presenceClient(request, env, fetcher); if (!c.ok) return c;
  const uid = c.identity.id, roles = await rolesFor(c.rows, uid);
  const cf = request.cf && typeof request.cf === "object" ? request.cf : {};
  const row = { user_id: uid, name: null, role: roles[0] || null, region: cf.region || null, country: cf.country || null,
    geo_source: cf.country ? "cf" : "unknown", last_seen: new Date().toISOString() };
  try {
    const old = await c.rows("presence_online", { select: "user_id", user_id: "eq." + uid, limit: "1" });
    const result = old[0]
      ? await c.rows("presence_online", { user_id: "eq." + uid, select: "*" }, { method: "PATCH", body: JSON.stringify(row) })
      : await c.rows("presence_online", { select: "*" }, { method: "POST", body: JSON.stringify(row) });
    return { ok: true, data: { presence: result[0] || row } };
  } catch (e) {
    if (e?.status === 401) return presenceFail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (e?.status === 403 || e?.status === 404) return presenceFail(503, "PRESENCE_ERROR", "Таблица presence_online недоступна под JWT/RLS");
    return presenceFail(500, "PRESENCE_ERROR", "Не удалось обновить статус присутствия");
  }
}
export async function listSupabaseAdminPresence(request, env, withinSec = 180, fetcher = fetch) {
  const c = await presenceClient(request, env, fetcher); if (!c.ok) return c;
  const roles = await rolesFor(c.rows, c.identity.id);
  if (!roles.some((r) => ["admin", "moderator", "teacher"].includes(r))) return presenceFail(403, "FORBIDDEN", "Недостаточно прав");
  const within = Math.max(60, Math.min(Number(withinSec) || 180, 900));
  const cutoff = new Date(Date.now() - within * 1000).toISOString();
  try {
    const rows = await c.rows("presence_online", { select: "user_id,name,role,region,country,geo_source,last_seen", last_seen: "gte." + cutoff, order: "last_seen.desc", limit: "500" });
    const now = Date.now();
    const items = rows.map((r) => { const seen = Date.parse(String(r.last_seen || "")) || 0; return { ...r, seconds_ago: seen ? Math.max(0, Math.floor((now - seen) / 1000)) : null, online: true }; });
    return { ok: true, data: { items, count: items.length, within_sec: within } };
  } catch (e) {
    if (e?.status === 401) return presenceFail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (e?.status === 403) return presenceFail(403, "FORBIDDEN", "Недостаточно прав");
    return presenceFail(500, "PRESENCE_ERROR", "Не удалось обновить статус присутствия");
  }
}
