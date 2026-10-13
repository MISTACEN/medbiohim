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


export async function createSupabaseHomework(request, env, input, fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  const uid = c.identity.id;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const title = String(body.title || "").trim();
  const description = body.description == null ? null : String(body.description).trim();
  const groupId = String(body.group_id || "").trim();
  const subjectId = String(body.subject_id || "").trim();
  const dueDate = String(body.due_date || "").trim();
  const scheduleEntryId = String(body.schedule_entry_id || "").trim();
  const attachments = Array.isArray(body.attachment_file_ids) ? body.attachment_file_ids : [];
  if (!title) return fail(422, "VALIDATION_ERROR", "title is required");
  if (title.length > 240 || (description && description.length > 20000)) return fail(422, "VALIDATION_ERROR", "Заголовок или описание слишком длинные");
  if (!groupId || !uuid(groupId)) return fail(422, "VALIDATION_ERROR", "Для задания требуется корректный group_id");
  if (subjectId && !uuid(subjectId)) return fail(422, "VALIDATION_ERROR", "subject_id должен быть UUID");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail(422, "VALIDATION_ERROR", "due_date должен иметь формат YYYY-MM-DD");
  if (scheduleEntryId && !uuid(scheduleEntryId)) return fail(422, "VALIDATION_ERROR", "schedule_entry_id должен быть UUID");
  if (attachments.length > 12) return fail(422, "VALIDATION_ERROR", "Можно прикрепить не более 12 файлов");
  if (attachments.length) return fail(503, "HOMEWORK_ATTACHMENTS_NOT_CONFIGURED", "Загрузка вложений пока не подключена к приватному хранилищу");

  try {
    const memberships = await c.rows("group_memberships", {
      select: "group_id,role_in_group,is_active",
      user_id: "eq." + uid,
      group_id: "eq." + groupId,
      is_active: "eq.true",
      limit: "1",
    });
    const membership = memberships[0];
    if (!membership) return fail(403, "FORBIDDEN", "Нет доступа к указанной учебной группе");
    // Live homeworks RLS permits shared homework creation by the group starosta.
    // Do not bypass this policy or write with a service-role key.
    if (String(membership.role_in_group || "").toLowerCase() !== "starosta") {
      return fail(403, "HOMEWORK_CREATION_REQUIRES_STAROSTA", "Создавать общие задания для группы может староста");
    }

    let dueAt = String(body.due_at || "").trim();
    if (!dueAt && dueDate) dueAt = dueDate + "T23:59:00";
    if (dueAt && !Number.isFinite(Date.parse(dueAt))) return fail(422, "VALIDATION_ERROR", "due_at имеет неверный формат");

    if (scheduleEntryId) {
      const entries = await c.rows("schedule_entries", {
        select: "id,date,subject_id,schedule_id,schedules!inner(id,group_id,is_active)",
        id: "eq." + scheduleEntryId,
        limit: "1",
      });
      const entry = entries[0];
      const schedule = rel(entry?.schedules);
      if (!entry || !schedule || schedule.is_active === false || String(schedule.group_id) !== groupId) {
        return fail(422, "INVALID_LESSON_CONTEXT", "Занятие не найдено в активном расписании выбранной группы");
      }
      if (subjectId && entry.subject_id && String(entry.subject_id) !== subjectId) {
        return fail(422, "INVALID_LESSON_CONTEXT", "Предмет не совпадает с выбранным занятием");
      }
    }

    const row = {
      title,
      description,
      subject_id: subjectId || null,
      group_id: groupId,
      schedule_entry_id: scheduleEntryId || null,
      due_date: dueDate || null,
      due_at: dueAt || null,
      created_by: uid,
      created_by_role: "starosta",
    };
    const saved = await c.rows("homeworks", { select: "*" }, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!saved[0]) return fail(503, "DB_UNAVAILABLE", "Задание не было сохранено");
    return { ok: true, status: 201, data: { homework: saved[0] } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для создания задания");
    if (error?.status === 400 || error?.status === 422) return fail(422, "VALIDATION_ERROR", "База данных отклонила параметры задания");
    return fail(503, "DB_UNAVAILABLE", "Не удалось сохранить задание");
  }
}

export async function submitSupabaseHomework(request, env, homeworkId, input, fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  const uid = c.identity.id;
  if (!uuid(homeworkId)) return fail(422, "VALIDATION_ERROR", "Некорректный id задания");
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const textAnswer = body.text_answer == null ? null : String(body.text_answer);
  const fileId = body.file_id == null || String(body.file_id).trim() === "" ? null : String(body.file_id).trim();
  if (textAnswer && textAnswer.length > 30000) return fail(422, "VALIDATION_ERROR", "Текст ответа слишком длинный");
  if (!textAnswer?.trim() && !fileId) return fail(422, "VALIDATION_ERROR", "Добавьте текст ответа или файл");

  try {
    const homeworkRows = await c.rows("homeworks", {
      select: "id,group_id,subject_id,title,status,due_date",
      id: "eq." + homeworkId,
      limit: "1",
    });
    const homework = homeworkRows[0];
    if (!homework) return fail(403, "HOMEWORK_NOT_ACCESSIBLE", "Задание недоступно в вашем учебном контексте");

    if (homework.group_id) {
      const memberships = await c.rows("group_memberships", {
        select: "group_id",
        user_id: "eq." + uid,
        group_id: "eq." + String(homework.group_id),
        is_active: "eq.true",
        limit: "1",
      });
      if (!memberships.length) return fail(403, "FORBIDDEN", "Вы не состоите в группе, для которой выдано задание");
    } else {
      const memberRows = await c.rows("group_memberships", {
        select: "group_id",
        user_id: "eq." + uid,
        is_active: "eq.true",
        limit: "100",
      });
      if (!memberRows.length) return fail(422, "NO_GROUP", "Для сдачи задания требуется активная учебная группа");
    }

    if (fileId) {
      if (!uuid(fileId)) return fail(422, "VALIDATION_ERROR", "file_id должен быть UUID");
      const files = await c.rows("files", {
        select: "id,uploaded_by,group_id,visibility,status",
        id: "eq." + fileId,
        limit: "1",
      });
      const file = files[0];
      if (!file || String(file.status || "").toLowerCase() !== "active") {
        return fail(403, "FORBIDDEN", "Файл недоступен для отправки этого задания");
      }
      const isOwner = String(file.uploaded_by || "") === uid;
      const sameGroup = homework.group_id && String(file.group_id || "") === String(homework.group_id);
      const isPublic = String(file.visibility || "").toLowerCase() === "public";
      if (!isOwner && !sameGroup && !isPublic) return fail(403, "FORBIDDEN", "Файл принадлежит другому учебному контексту");
    }

    const existingRows = await c.rows("homework_submissions", {
      select: "id,status,grade,teacher_comment,submitted_at",
      homework_id: "eq." + homeworkId,
      user_id: "eq." + uid,
      limit: "1",
    });
    const existing = existingRows[0];
    if (existing && ["submitted", "graded"].includes(String(existing.status || "").toLowerCase())) {
      return fail(409, "SUBMISSION_LOCKED", "Работа уже сдана и ожидает проверки");
    }
    const now = new Date().toISOString();
    const patch = {
      homework_id: homeworkId,
      user_id: uid,
      text_answer: textAnswer,
      file_id: fileId,
      status: "submitted",
      submitted_at: now,
      updated_at: now,
    };
    let saved;
    if (existing?.id) {
      saved = await c.rows("homework_submissions", { id: "eq." + String(existing.id), user_id: "eq." + uid, select: "*" }, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } else {
      saved = await c.rows("homework_submissions", { select: "*" }, {
        method: "POST",
        body: JSON.stringify(patch),
      });
    }
    if (!saved[0]) return fail(503, "DB_UNAVAILABLE", "Не удалось сохранить ответ на задание");

    // Progress is a separate optional projection; the authoritative submission is
    // already saved. RLS still restricts the progress row to this user.
    try {
      await c.rows("homework_progress", {
        on_conflict: "homework_id,user_id",
        select: "*",
      }, {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          homework_id: homeworkId, user_id: uid, completed: true, answer_text: textAnswer,
          file_id: fileId, submitted_at: now,
        }),
      });
    } catch {}
    return { ok: true, status: 201, data: { submission: saved[0] } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для отправки задания");
    if (error?.status === 400 || error?.status === 422) return fail(422, "VALIDATION_ERROR", "База данных отклонила ответ на задание");
    return fail(503, "DB_UNAVAILABLE", "Не удалось отправить задание. Попробуйте позже");
  }
}
