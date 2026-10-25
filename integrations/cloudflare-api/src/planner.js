import { authenticateSupabaseRequest } from "./supabase-auth.js";
import { createB2DownloadUrls } from "./b2-download.js";

const fail = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });
const uuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
const rel = (v) => Array.isArray(v) ? v[0] : v;

function logPresenceRestRedirect(response, endpoint, table, method) {
  const location = response.headers.get("location");
  let target = null;
  try { if (location) target = new URL(location, endpoint); } catch {}
  console.error("MEDBIOHIM_PRESENCE_REST_REDIRECT", JSON.stringify({
    table,
    method,
    status: response.status,
    hasLocation: Boolean(location),
    sourceHostMatchesExpectedProject: endpoint.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
    targetIsHttps: target ? target.protocol === "https:" : false,
    targetSameOrigin: target ? target.origin === endpoint.origin : false,
    targetIsSupabaseDomain: target ? target.hostname.endsWith(".supabase.co") : false,
    targetMatchesExpectedProject: target ? target.hostname === "gnobvyjywtqbdfeejxmf.supabase.co" : false,
    targetPathCategory: !target ? "unknown" :
      target.pathname.startsWith("/auth/v1/") ? "auth" :
      target.pathname.startsWith("/rest/v1/") ? "rest" :
      target.pathname === "/" ? "root" : "other",
  }));
}

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
      // Do not follow a REST redirect with the caller's bearer token.
      redirect: "manual", signal: AbortSignal.timeout(7000),
    });
    if (r.status >= 300 && r.status < 400) {
      const method = init.method || "GET";
      logPresenceRestRedirect(r, u, table, method);
      const error = new Error("Supabase REST redirect blocked");
      error.status = r.status;
      error.code = "UPSTREAM_REDIRECT";
      error.table = table;
      error.method = method;
      throw error;
    }
    if (!r.ok) {
      let payload = null;
      try { payload = await r.json(); } catch {}
      const e = new Error("REST failure");
      e.status = r.status;
      e.code = typeof payload?.code === "string" ? payload.code : "REST_ERROR";
      e.table = table;
      e.method = init.method || "GET";
      throw e;
    }
    // DELETE/PATCH без Prefer:return=representation приходят с 204 и пустым телом —
    // json() на нём бросает исключение уже после успешного удаления.
    if (r.status === 204) return [];
    const text = await r.text();
    if (!text) return [];
    let data = null;
    try { data = JSON.parse(text); } catch { return []; }
    return Array.isArray(data) ? data : [];
  }
  async function rpc(functionName, payload) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(String(functionName || ""))) throw new Error("Invalid RPC name");
    const endpoint = new URL("/rest/v1/rpc/" + functionName, base);
    const response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: key,
        authorization: "Bearer " + token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(7000),
    });
    if (response.status >= 300 && response.status < 400) {
      logPresenceRestRedirect(response, endpoint, "rpc/" + functionName, "POST");
      const error = new Error("Supabase RPC redirect blocked");
      error.status = response.status;
      error.code = "UPSTREAM_REDIRECT";
      throw error;
    }
    if (!response.ok) {
      let payloadError = null;
      try { payloadError = await response.json(); } catch {}
      const error = new Error("Supabase RPC failed");
      error.status = response.status;
      error.code = typeof payloadError?.code === "string" ? payloadError.code : "RPC_ERROR";
      throw error;
    }
    return await response.json();
  }
  return { ok: true, identity: auth.user, rows, rpc };
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
    let prog = new Map(), subs = new Map(), attachmentsByHomework = new Map();
    if (ids.length) {
      const byIds = "in.(" + ids.join(",") + ")";
      const results = await Promise.all([
        c.rows("homework_progress", { select: "homework_id,completed,submitted_at", user_id: "eq." + uid, homework_id: byIds, limit: "500" }),
        c.rows("homework_submissions", { select: "id,homework_id,status,grade,submitted_at", user_id: "eq." + uid, homework_id: byIds, order: "submitted_at.desc", limit: "500" }),
        c.rows("homework_attachments", {
          select: "homework_id,file_id,attachment_type,caption,sort_order,inline_view,files(id,original_name,mime_type,size_bytes,object_key,status)",
          homework_id: byIds,
          order: "homework_id.asc,sort_order.asc,created_at.asc",
          limit: "1500",
        }),
      ]);
      for (const p of results[0]) prog.set(String(p.homework_id), p);
      for (const sub of results[1]) if (!subs.has(String(sub.homework_id))) subs.set(String(sub.homework_id), sub);

      const attachmentCandidates = results[2].map((attachment) => ({
        attachment,
        file: rel(attachment.files),
      })).filter(({ file }) => file && String(file.status || "").toLowerCase() === "active");
      const signableKeys = [];
      const uniqueKeys = new Set();
      if (env.B2_KEY_ID && env.B2_APPLICATION_KEY && env.B2_BUCKET) {
        for (const { file } of attachmentCandidates) {
          const objectKey = String(file.object_key || "").trim();
          if (!objectKey || uniqueKeys.has(objectKey)) continue;
          uniqueKeys.add(objectKey);
          // Stay below Cloudflare's free-tier subrequest budget even on large
          // homework lists; metadata remains visible when a link is not signed.
          if (signableKeys.length < 24) signableKeys.push(objectKey);
        }
      }
      let signedUrls = Object.create(null);
      if (signableKeys.length) {
        const signed = await createB2DownloadUrls(env, signableKeys, 3600, fetcher);
        if (signed.ok) signedUrls = signed.urls;
      }

      for (const { attachment, file } of attachmentCandidates) {
        const objectKey = String(file.object_key || "").trim();
        const value = {
          file_id: String(attachment.file_id),
          name: file.original_name ?? null,
          mime_type: file.mime_type ?? null,
          size_bytes: file.size_bytes == null ? null : Number(file.size_bytes),
          attachment_type: attachment.attachment_type ?? "file",
          caption: attachment.caption ?? null,
          inline_view: attachment.inline_view === true,
          download_url: objectKey && Object.prototype.hasOwnProperty.call(signedUrls, objectKey) ? signedUrls[objectKey] : null,
        };
        const key = String(attachment.homework_id);
        if (!attachmentsByHomework.has(key)) attachmentsByHomework.set(key, []);
        attachmentsByHomework.get(key).push(value);
      }
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
        completed_at: p?.submitted_at ?? null, submission_status: s?.status ?? null, ...mine, attachments: attachmentsByHomework.get(String(h.id)) || [] };
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
    const method = init.method || "GET";
    let r;
    try {
      r = await fetcher(u.toString(), {
        ...init, method,
        headers: { apikey: key, authorization: "Bearer " + token, accept: "application/json",
          ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}), ...(init.headers || {}) },
        // Inspect redirect responses but never follow them with the caller's bearer token.
        redirect: "manual", signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      const message = [error?.name, error?.message, error?.cause?.code].filter(Boolean).join(" ").toLowerCase();
      const category = /redirect/.test(message) ? "redirect"
        : /timeout|timed out|aborted/.test(message) ? "timeout"
        : /enotfound|eai_again|dns|getaddrinfo/.test(message) ? "dns"
        : /certificate|tls|ssl/.test(message) ? "tls"
        : /fetch failed|network|socket|connect/.test(message) ? "connection" : "upstream";
      console.error("MEDBIOHIM_PRESENCE_REST_FETCH_ERROR", JSON.stringify({
        table, method, category,
        sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      throw error;
    }
    if (r.status >= 300 && r.status < 400) {
      logPresenceRestRedirect(r, u, table, method);
      const error = new Error("Supabase REST redirect blocked");
      error.status = r.status;
      error.code = "UPSTREAM_REDIRECT";
      error.table = table;
      error.method = method;
      throw error;
    }
    if (!r.ok) {
      let errorPayload = null;
      try { errorPayload = await r.json(); } catch {}
      const error = new Error("REST failure");
      error.status = r.status;
      error.code = typeof errorPayload?.code === "string"
        ? errorPayload.code
        : typeof errorPayload?.error === "string" ? errorPayload.error : "REST_ERROR";
      error.table = table;
      error.method = init.method || "GET";
      console.error("MEDBIOHIM_PRESENCE_DB_ERROR", JSON.stringify({
        table: error.table, method: error.method, status: error.status, code: error.code,
      }));
      throw error;
    }
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
    const cause = e && typeof e === "object" ? e.cause : undefined;
    const failureText = [e?.name, e?.message, cause?.name, cause?.code].filter(Boolean).join(" ").toLowerCase();
    const category = /redirect/.test(failureText) ? "redirect"
      : /timeout|timed out|aborted/.test(failureText) ? "timeout"
      : /enotfound|eai_again|dns|getaddrinfo/.test(failureText) ? "dns"
      : /certificate|tls|ssl/.test(failureText) ? "tls"
      : /fetch failed|network|socket|connect/.test(failureText) ? "connection"
      : "upstream";
    console.error("MEDBIOHIM_PRESENCE_FAILURE", JSON.stringify({
      status: Number(e?.status) || 0,
      code: String(e?.code || "UNEXPECTED_ERROR").slice(0, 40),
      category,
    }));
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
  const scope = String(body.scope || (groupId ? "group" : "personal")).trim().toLowerCase();
  const isPersonal = scope === "personal";
  const subjectId = String(body.subject_id || "").trim();
  const dueDate = String(body.due_date || "").trim();
  const scheduleEntryId = String(body.schedule_entry_id || "").trim();
  if (body.attachment_file_ids != null && !Array.isArray(body.attachment_file_ids)) {
    return fail(422, "VALIDATION_ERROR", "attachment_file_ids должен быть массивом");
  }
  const attachments = [...new Set((Array.isArray(body.attachment_file_ids) ? body.attachment_file_ids : [])
    .map((value) => String(value || "").trim()).filter(Boolean))];

  if (!title) return fail(422, "VALIDATION_ERROR", "title is required");
  if (title.length > 240 || (description && description.length > 20000)) return fail(422, "VALIDATION_ERROR", "Заголовок или описание слишком длинные");
  if (!["group", "personal"].includes(scope)) return fail(422, "VALIDATION_ERROR", "scope должен быть group или personal");
  if (isPersonal && scheduleEntryId) return fail(422, "INVALID_LESSON_CONTEXT", "Личную задачу нельзя привязать к общему занятию расписания");
  if (!isPersonal && (!groupId || !uuid(groupId))) return fail(422, "VALIDATION_ERROR", "Для общего задания требуется корректный group_id");
  if (subjectId && !uuid(subjectId)) return fail(422, "VALIDATION_ERROR", "subject_id должен быть UUID");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail(422, "VALIDATION_ERROR", "due_date должен иметь формат YYYY-MM-DD");
  if (scheduleEntryId && !uuid(scheduleEntryId)) return fail(422, "VALIDATION_ERROR", "schedule_entry_id должен быть UUID");
  if (attachments.length > 12) return fail(422, "VALIDATION_ERROR", "Можно прикрепить не более 12 файлов");
  if (attachments.some((id) => !uuid(id))) return fail(422, "VALIDATION_ERROR", "Каждый attachment_file_id должен быть UUID");

  let membership = null;
  if (!isPersonal) {
    try {
      const memberships = await c.rows("group_memberships", {
        select: "group_id,role_in_group,is_active",
        user_id: "eq." + uid,
        group_id: "eq." + groupId,
        is_active: "eq.true",
        limit: "1",
      });
      membership = memberships[0] || null;
    } catch (error) {
      if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
      if (error?.status === 403) return fail(403, "FORBIDDEN", "Нет доступа к указанной учебной группе");
      return fail(503, "DB_UNAVAILABLE", "Не удалось проверить учебную группу");
    }
    if (!membership) return fail(403, "FORBIDDEN", "Нет доступа к указанной учебной группе");
  }

  try {
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
      group_id: isPersonal ? null : groupId,
      schedule_entry_id: scheduleEntryId || null,
      due_date: dueDate || null,
      due_at: dueAt || null,
      created_by: uid,
      created_by_role: isPersonal
        ? "student"
        : String(membership?.role_in_group || "").toLowerCase() === "starosta" ? "starosta" : "student",
    };

    if (attachments.length) {
      const files = await c.rows("files", {
        select: "id,original_name,mime_type,size_bytes,group_id,uploaded_by,status",
        id: "in.(" + attachments.join(",") + ")",
        status: "eq.active",
        uploaded_by: "eq." + uid,
        limit: String(attachments.length),
      });
      if (files.length !== attachments.length) {
        return fail(403, "ATTACHMENT_NOT_ACCESSIBLE", "Один или несколько файлов недоступны или загружены другим пользователем");
      }
      if (files.some((file) => file.group_id && (isPersonal || String(file.group_id) !== groupId))) {
        return fail(403, "ATTACHMENT_GROUP_MISMATCH", "Вложение относится к другой учебной группе");
      }

      const created = await c.rpc("create_homework_with_attachments", {
        p_homework: row,
        p_attachment_file_ids: attachments,
      });
      if (!created?.homework?.id) return fail(503, "DB_UNAVAILABLE", "Задание с вложениями не было сохранено");
      return {
        ok: true,
        status: 201,
        data: {
          homework: created.homework,
          attachments: Array.isArray(created.attachments) ? created.attachments : [],
        },
      };
    }

    const saved = await c.rows("homeworks", { select: "*" }, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!saved[0]) return fail(503, "DB_UNAVAILABLE", "Задание не было сохранено");
    return { ok: true, status: 201, data: { homework: saved[0], attachments: [] } };
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
      select: "id,group_id,created_by,subject_id,title,status,due_date",
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
    } else if (String(homework.created_by || "") !== uid) {
      return fail(403, "FORBIDDEN", "Личное задание доступно только создавшему его пользователю");
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


function parsePreparationIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(uuid);
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw || raw === "{}") return [];
  if (raw.startsWith("[")) { try { const data = JSON.parse(raw); return Array.isArray(data) ? data.map(String).filter(uuid) : []; } catch {} }
  const inner = raw.startsWith("{") && raw.endsWith("}") ? raw.slice(1, -1) : raw;
  return inner ? inner.split(",").map((v) => v.trim().replace(/^"|"$/g, "")).filter(uuid) : [];
}
function parsePreparationJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") { try { return JSON.parse(value); } catch {} }
  return fallback;
}
function normalizedAnswer(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ru")
    .replace(/ё/g, "е").replace(/[.,;:!?{}"'()]/g, "").replace(/\s+/g, " ");
}
function gradePreparationAnswer(snapshot, given) {
  const answer = String(snapshot?.answer ?? "").trim();
  const options = parsePreparationJson(snapshot?.options, []);
  const correctOptions = Array.isArray(options)
    ? options.filter((option) => option && typeof option === "object" && option.correct === true).map((option) => normalizedAnswer(option.label))
    : [];
  const normalizedGiven = normalizedAnswer(given);
  if (!answer && correctOptions.length === 0) {
    return { is_correct: null, score: null, grading_status: "pending", grading_source: "rule_engine", confidence: null, feedback: "Для этого ответа нужна ручная или AI-проверка.", model: null, graded_at: null };
  }
  let correct = false;
  if (correctOptions.length) {
    const parsed = parsePreparationJson(given, null);
    let supplied = Array.isArray(parsed) ? parsed.map(normalizedAnswer).filter(Boolean) : normalizedGiven ? normalizedGiven.split(/\s*(?:,|;|\|)\s*/).filter(Boolean) : [];
    supplied = [...new Set(supplied)].sort();
    const expected = [...new Set(correctOptions)].sort();
    correct = supplied.length === expected.length && supplied.every((v, i) => v === expected[i]);
  } else correct = normalizedGiven === normalizedAnswer(answer);
  const now = new Date().toISOString();
  return {
    is_correct: correct, score: correct ? 100 : 0, grading_status: "deterministic",
    grading_source: "rule_engine", confidence: 0.99,
    feedback: correct ? "Ответ совпадает с эталоном." : "Ответ отличается от эталона; сравните его с правильным ответом после завершения теста.",
    model: null, graded_at: now,
  };
}
function publicPreparationQuestion(snapshot, completed) {
  const opts = parsePreparationJson(snapshot?.options, []);
  let correctCount = 0;
  const options = Array.isArray(opts) ? opts.map((option) => {
    if (option && typeof option === "object") {
      if (option.correct === true) correctCount++;
      const out = { label: String(option.label ?? "") };
      if (completed) out.correct = option.correct === true;
      return out;
    }
    return { label: String(option) };
  }) : [];
  const out = {
    id: String(snapshot?.id || ""), body: String(snapshot?.text ?? snapshot?.body ?? ""),
    text: String(snapshot?.text ?? snapshot?.body ?? ""), options, type: String(snapshot?.type || "open"),
    subject_id: snapshot?.subject_id ?? null, module_id: snapshot?.module_id ?? null,
    topic_id: snapshot?.topic_id ?? null, module_name: snapshot?.module_name ?? null,
    topic_name: snapshot?.topic_name ?? null, allow_multiple: correctCount > 1,
  };
  if (completed) out.answer = snapshot?.answer ?? null;
  return out;
}
async function getPreparationSession(c, sessionId) {
  if (!uuid(sessionId)) return null;
  const rows = await c.rows("test_preparation_sessions", {
    select: "*", id: "eq." + sessionId, user_id: "eq." + c.identity.id, limit: "1",
  });
  return rows[0] || null;
}

export async function startSupabasePreparation(request, env, testId, input = {}, fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  if (!uuid(testId)) return fail(422, "VALIDATION_ERROR", "Некорректный id теста");
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const requestedMode = String(body.mode || "full");
  const mode = requestedMode === "sequential" ? "sequential" : requestedMode === "count" ? "count" : "full";
  const questionLimit = mode === "count" ? Math.max(1, Math.min(200, Number.parseInt(String(body.question_limit ?? 10), 10) || 10)) : null;
  try {
    const tests = await c.rows("tests", { select: "id,title,subject_id,module_id,topic_id,is_published", id: "eq." + testId, is_published: "eq.true", limit: "1" });
    if (!tests[0]) return fail(404, "NOT_FOUND", "Тест не найден или не опубликован");
    const groupResult = await groupFor(c.rows, c.identity.id, String(body.group_id || ""));
    if (!groupResult.ok) return groupResult;
    const groupId = groupResult.group.group_id;
    const links = await c.rows("test_questions", { select: "question_id,order_index", test_id: "eq." + testId, order: "order_index.asc,question_id.asc", limit: "1000" });
    let ids = links.map((row) => String(row.question_id || "")).filter(uuid);
    // Банки из методичек часто созданы без строк в test_questions. Тогда берём
    // опубликованные вопросы темы теста, затем — его раздела, чтобы набор по
    // каждой теме реально запускался, а не отвечал «в тесте нет вопросов».
    if (!ids.length) {
      const test = tests[0];
      const scope = [
        { column: "topic_id", value: test?.topic_id },
        { column: "module_id", value: test?.module_id },
      ];
      for (const { column, value } of scope) {
        if (!uuid(value)) continue;
        const params = { select: "id", [column]: "eq." + String(value), is_published: "eq.true", archived_at: "is.null", order: "created_at.asc", limit: "1000" };
        const rows = await c.rows("questions", params);
        ids = rows.map((row) => String(row.id || "")).filter(uuid);
        if (ids.length) break;
      }
    }
    if (mode !== "sequential") {
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    }
    if (questionLimit != null) ids = ids.slice(0, questionLimit);
    if (!ids.length) return fail(422, "NO_QUESTIONS", "В тесте нет опубликованных вопросов");
    const questions = await c.rows("questions", { select: "id,subject_id,module_id,topic_id,type,text,answer,options", id: "in.(" + ids.join(",") + ")", is_published: "eq.true", archived_at: "is.null", limit: "1000" });
    const questionById = new Map(questions.map((q) => [String(q.id), q]));
    ids = ids.filter((id) => questionById.has(id));
    if (!ids.length) return fail(422, "NO_QUESTIONS", "В тесте нет доступных опубликованных вопросов");
    const records = ids.map((id) => questionById.get(id));
    const moduleIds = [...new Set(records.map((q) => String(q.module_id || "")).filter(uuid))];
    const topicIds = [...new Set(records.map((q) => String(q.topic_id || "")).filter(uuid))];
    const [modules, topics] = await Promise.all([
      moduleIds.length ? c.rows("modules", { select: "id,title", id: "in.(" + moduleIds.join(",") + ")", limit: "500" }) : [],
      topicIds.length ? c.rows("topics", { select: "id,title", id: "in.(" + topicIds.join(",") + ")", limit: "500" }) : [],
    ]);
    const moduleNames = new Map(modules.map((row) => [String(row.id), row.title]));
    const topicNames = new Map(topics.map((row) => [String(row.id), row.title]));
    const snapshot = ids.map((id) => {
      const q = questionById.get(id);
      return { id, subject_id: q.subject_id ?? null, module_id: q.module_id ?? null, topic_id: q.topic_id ?? null,
        type: q.type ?? "open", text: q.text ?? "", answer: q.answer ?? null, options: parsePreparationJson(q.options, []),
        module_name: moduleNames.get(String(q.module_id || "")) ?? null, topic_name: topicNames.get(String(q.topic_id || "")) ?? null };
    });
    const existingRows = await c.rows("test_preparation_sessions", { select: "*", user_id: "eq." + c.identity.id,
      test_id: "eq." + testId, status: "eq.in_progress", order: "started_at.desc.nullslast", limit: "1" });
    const existing = existingRows[0];
    if (existing && existing.group_id && String(existing.group_id) !== groupId) return fail(409, "CONTEXT_CHANGED", "Сессия подготовки относится к другой учебной группе");
    if (existing && String(existing.mode || "") === mode) {
      const safe = { ...existing, question_ids: parsePreparationIds(existing.question_ids) };
      delete safe.question_snapshot;
      return { ok: true, data: { session: safe, resumed: true } };
    }
    // Уникальный ключ (user_id, test_id, status) допускает лишь одну запись с каждым
    // статусом — старые in_progress/abandoned сессии этого теста удаляем вместе с их
    // результатами, иначе PATCH в abandoned и INSERT новой сессии падают с 23505.
    // Фильтр по id добавляем только когда есть что исключать: PostgREST не
    // принимает пустое значение и отвечает 400 вместо пустого списка.
    const staleParams = { select: "id", user_id: "eq." + c.identity.id,
      test_id: "eq." + testId, status: "in.(in_progress,abandoned)", limit: "100" };
    if (existing?.id) staleParams.id = "neq." + String(existing.id);
    const stale = await c.rows("test_preparation_sessions", staleParams);
    for (const row of stale) {
      try { await c.rows("test_preparation_results", { session_id: "eq." + String(row.id) }, { method: "DELETE" }); } catch {}
      try { await c.rows("test_preparation_sessions", { id: "eq." + String(row.id), user_id: "eq." + c.identity.id }, { method: "DELETE" }); } catch {}
    }
    if (existing?.id) await c.rows("test_preparation_sessions", { id: "eq." + String(existing.id), user_id: "eq." + c.identity.id }, {
      method: "PATCH", body: JSON.stringify({ status: "abandoned", last_saved_at: new Date().toISOString() }),
    });
    const now = new Date().toISOString();
    const created = await c.rows("test_preparation_sessions", { select: "*" }, { method: "POST", body: JSON.stringify({
      user_id: c.identity.id, test_id: testId, mode, question_limit: questionLimit, question_ids: ids,
      current_index: 0, status: "in_progress", started_at: now, last_saved_at: now, group_id: groupId, question_snapshot: snapshot,
    }) });
    if (!created[0]) return fail(503, "PREPARATION_ERROR", "Не удалось создать сессию подготовки");
    const safe = { ...created[0], question_ids: parsePreparationIds(created[0].question_ids) };
    delete safe.question_snapshot;
    return { ok: true, status: 201, data: { session: safe, question_ids: ids } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав на этот тест");
    console.error("MEDBIOHIM_PREPARATION_START", JSON.stringify({
      code: error?.code || null, status: error?.status || null, table: error?.table || null, method: error?.method || null,
      message: String(error?.message || error).slice(0, 300),
    }));
    return fail(503, "PREPARATION_ERROR", "Подготовка к тесту временно недоступна");
  }
}

export async function getSupabasePreparation(request, env, sessionId, fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  try {
    const session = await getPreparationSession(c, sessionId);
    if (!session) return fail(404, "NOT_FOUND", "Сессия подготовки не найдена");
    const testRows = await c.rows("tests", { select: "title", id: "eq." + String(session.test_id), limit: "1" });
    const ids = parsePreparationIds(session.question_ids);
    const snapshot = parsePreparationJson(session.question_snapshot, []);
    const byId = new Map((Array.isArray(snapshot) ? snapshot : []).filter((q) => q && q.id).map((q) => [String(q.id), q]));
    const answers = await c.rows("test_preparation_results", { select: "question_id,answer_text,grading_status,grading_source,grading_confidence,grading_feedback,grading_model,graded_at,is_correct,score,answered_at",
      session_id: "eq." + String(session.id), user_id: "eq." + c.identity.id, limit: "1000" });
    const completed = String(session.status) === "completed";
    const questions = ids.map((id) => byId.get(id)).filter(Boolean).map((q) => publicPreparationQuestion(q, completed));
    const safe = { ...session, question_ids: ids, test_title: testRows[0]?.title ?? null };
    delete safe.question_snapshot;
    return { ok: true, data: { session: safe, questions, answers } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    return fail(503, "PREPARATION_ERROR", "Подготовка к тесту временно недоступна");
  }
}

export async function saveSupabasePreparation(request, env, sessionId, input, fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  try {
    const session = await getPreparationSession(c, sessionId);
    if (!session || String(session.status) !== "in_progress") return fail(404, "NOT_FOUND", "Активная сессия не найдена");
    const ids = parsePreparationIds(session.question_ids);
    const current = Math.max(0, Math.min(ids.length ? ids.length - 1 : 0, Number.parseInt(String(body.current_index ?? session.current_index ?? 0), 10) || 0));
    let grading = null;
    if (body.question_id != null) {
      const questionId = String(body.question_id);
      if (!uuid(questionId) || !ids.includes(questionId)) return fail(422, "QUESTION_NOT_IN_SESSION", "Вопрос не входит в эту сессию");
      const snapshot = parsePreparationJson(session.question_snapshot, []);
      const q = Array.isArray(snapshot) ? snapshot.find((item) => String(item?.id) === questionId) : null;
      if (!q) return fail(422, "QUESTION_NOT_IN_SESSION", "Вопрос не входит в эту сессию");
      const answerText = body.answer_text == null ? null : String(body.answer_text);
      const grade = gradePreparationAnswer(q, answerText);
      const now = new Date().toISOString();
      const saved = await c.rows("test_preparation_results", { on_conflict: "session_id,question_id", select: "*" }, {
        method: "POST", headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ session_id: String(session.id), user_id: c.identity.id, test_id: String(session.test_id),
          question_id: questionId, answer_text: answerText, is_correct: grade.is_correct, score: grade.score,
          answer_snapshot: { type: q.type || "open", answer: q.answer ?? null, options: q.options ?? [] },
          grading_status: grade.grading_status, grading_source: grade.grading_source, grading_confidence: grade.confidence,
          grading_feedback: grade.feedback, grading_model: grade.model, graded_at: grade.graded_at, answered_at: now }),
      });
      if (!saved[0]) return fail(503, "SAVE_ERROR", "Не удалось сохранить ответ");
      grading = { ...grade, question_id: questionId };
    }
    const updated = await c.rows("test_preparation_sessions", { id: "eq." + String(session.id), user_id: "eq." + c.identity.id, select: "*" }, {
      method: "PATCH", body: JSON.stringify({ current_index: current, last_saved_at: new Date().toISOString() }),
    });
    const safe = updated[0] || { ...session, current_index: current };
    delete safe.question_snapshot;
    safe.question_ids = ids;
    return { ok: true, data: { session: safe, grading } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для сохранения ответа");
    return fail(503, "SAVE_ERROR", "Не удалось сохранить ответ");
  }
}

export async function finishSupabasePreparation(request, env, sessionId, fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  try {
    const session = await getPreparationSession(c, sessionId);
    if (!session || String(session.status) !== "in_progress") return fail(404, "INVALID_TRANSITION", "Сессию можно завершить только из состояния in_progress");
    const ids = parsePreparationIds(session.question_ids);
    const snapshot = parsePreparationJson(session.question_snapshot, []);
    const byId = new Map((Array.isArray(snapshot) ? snapshot : []).filter((q) => q && q.id).map((q) => [String(q.id), q]));
    const results = await c.rows("test_preparation_results", { select: "question_id,answer_text,is_correct,score,grading_status,grading_source,grading_confidence,grading_feedback,grading_model,graded_at",
      session_id: "eq." + String(session.id), user_id: "eq." + c.identity.id, limit: "1000" });
    const byQuestion = new Map(results.map((r) => [String(r.question_id), r]));
    let correct = 0, unresolved = 0;
    const topics = new Map();
    for (const id of ids) {
      const q = byId.get(id) || {}, row = byQuestion.get(id);
      if (row && row.is_correct === true) correct++;
      if (row && ["pending", "error"].includes(String(row.grading_status || ""))) unresolved++;
      const topicId = String(q.topic_id || "unknown");
      if (!topics.has(topicId)) topics.set(topicId, { topic_id: q.topic_id ?? null, topic_name: String(q.topic_name || "Без темы"), total: 0, correct: 0 });
      const topic = topics.get(topicId); topic.total++; if (row && row.is_correct === true) topic.correct++;
    }
    for (const topic of topics.values()) topic.percent = topic.total ? Math.round(topic.correct / topic.total * 10000) / 100 : 0;
    const total = ids.length, answered = results.length, now = new Date().toISOString();
    // Уникальный ключ (user_id, test_id, status): старая completed-сессия этого теста
    // не даст перевести текущую в completed (23505). Удаляем её вместе с результатами.
    try {
      const oldCompleted = await c.rows("test_preparation_sessions", { select: "id", user_id: "eq." + c.identity.id,
        test_id: "eq." + String(session.test_id), status: "eq.completed", id: "neq." + String(session.id), limit: "100" });
      for (const row of oldCompleted) {
        try { await c.rows("test_preparation_results", { session_id: "eq." + String(row.id) }, { method: "DELETE" }); } catch {}
        try { await c.rows("test_preparation_sessions", { id: "eq." + String(row.id), user_id: "eq." + c.identity.id }, { method: "DELETE" }); } catch {}
      }
    } catch {}
    // Полный PATCH может быть отклонён схемой (например, нет колонки completed_at):
    // пробуем полный вариант, затем минимальный, и только потом отдаём реальную ошибку.
    let updated = null, patchError = null;
    const patchFull = { status: "completed", completed_at: now, last_saved_at: now, current_index: total };
    try {
      const rows = await c.rows("test_preparation_sessions", { id: "eq." + String(session.id), user_id: "eq." + c.identity.id, select: "*" }, {
        method: "PATCH", body: JSON.stringify(patchFull),
      });
      updated = rows[0] || null;
    } catch (error) { patchError = error; }
    if (!updated) {
      try {
        const rows = await c.rows("test_preparation_sessions", { id: "eq." + String(session.id), user_id: "eq." + c.identity.id, select: "*" }, {
          method: "PATCH", body: JSON.stringify({ status: "completed", last_saved_at: now }),
        });
        updated = rows[0] || null;
        if (updated) patchError = null;
      } catch (error) { patchError = patchError || error; }
    }
    if (patchError) {
      console.error("MEDBIOHIM_PREPARATION_FINISH_PATCH", JSON.stringify({
        session_id: String(session.id), code: patchError?.code || null, status: patchError?.status || null, message: String(patchError?.message || patchError).slice(0, 300),
      }));
    }
    const safe = updated || { ...session, status: "completed", completed_at: now, current_index: total };
    safe.question_ids = ids; delete safe.question_snapshot;
    if (patchError && !updated) {
      // Не прячем причину: отдаём её пользователю и в логи.
      const status = [400, 401, 403, 404, 409, 422].includes(Number(patchError?.status)) ? Number(patchError.status) : 503;
      return fail(status, "FINISH_PATCH_FAILED", "Не удалось пометить сессию завершённой: " + String(patchError?.message || patchError).slice(0, 200), { stats: { total, answered, correct, wrong: Math.max(0, answered - correct - unresolved), unresolved: Math.min(answered, unresolved), unanswered: Math.max(0, total - answered), percent: total ? Math.round(correct / total * 10000) / 100 : 0, topics: [...topics.values()] } });
    }
    return { ok: true, data: { session: safe,
      stats: { total, answered, correct, wrong: Math.max(0, answered - correct - unresolved), unresolved: Math.min(answered, unresolved),
        unanswered: Math.max(0, total - answered), percent: total ? Math.round(correct / total * 10000) / 100 : 0, topics: [...topics.values()] },
      errors: results } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    console.error("MEDBIOHIM_PREPARATION_FINISH", JSON.stringify({
      code: error?.code || null, status: error?.status || null, message: String(error?.message || error).slice(0, 300),
    }));
    return fail(503, "FINISH_ERROR", "Не удалось завершить подготовку: " + String(error?.message || error).slice(0, 160));
  }
}

export async function retrySupabasePreparationGrading(request, env, sessionId, questionId = "", fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  try {
    const session = await getPreparationSession(c, sessionId);
    if (!session) return fail(404, "NOT_FOUND", "Сессия подготовки не найдена");
    const ids = parsePreparationIds(session.question_ids);
    if (questionId && !ids.includes(questionId)) return fail(422, "QUESTION_NOT_IN_SESSION", "Вопрос не входит в эту сессию");
    const snapshot = parsePreparationJson(session.question_snapshot, []);
    const byId = new Map((Array.isArray(snapshot) ? snapshot : []).filter((q) => q && q.id).map((q) => [String(q.id), q]));
    const params = { select: "question_id,answer_text", session_id: "eq." + String(session.id), user_id: "eq." + c.identity.id, grading_status: "in.(pending,error)", limit: "1000" };
    if (questionId) params.question_id = "eq." + questionId;
    const pending = await c.rows("test_preparation_results", params);
    const items = [];
    for (const row of pending) {
      const q = byId.get(String(row.question_id));
      if (!q) continue;
      const grade = gradePreparationAnswer(q, row.answer_text);
      const updated = await c.rows("test_preparation_results", {
        session_id: "eq." + String(session.id), user_id: "eq." + c.identity.id,
        question_id: "eq." + String(row.question_id), select: "*",
      }, { method: "PATCH", body: JSON.stringify({ is_correct: grade.is_correct, score: grade.score,
        grading_status: grade.grading_status, grading_source: grade.grading_source, grading_confidence: grade.confidence,
        grading_feedback: grade.feedback, grading_model: grade.model, graded_at: grade.graded_at }) });
      if (updated[0]) items.push(updated[0]);
    }
    return { ok: true, data: { items, retried: items.length } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    return fail(503, "GRADING_RETRY_ERROR", "Не удалось повторно проверить ответы");
  }
}

export async function reviewSupabasePreparation(request, env, sessionId, fetcher = fetch) {
  const c = await client(request, env, fetcher);
  if (!c.ok) return c;
  try {
    const session = await getPreparationSession(c, sessionId);
    if (!session || String(session.status) !== "completed") return fail(404, "NOT_FOUND", "Завершённая сессия подготовки не найдена");
    const rows = await c.rows("test_preparation_results", { select: "question_id,answer_text,is_correct,score,grading_status,grading_feedback",
      session_id: "eq." + String(session.id), user_id: "eq." + c.identity.id, order: "answered_at.asc", limit: "1000" });
    const incorrect = rows.filter((row) => row.is_correct === false), unresolved = rows.filter((row) => ["pending", "error"].includes(String(row.grading_status || "")));
    const review = { summary: "Разбор сформирован автоматически по сохранённым результатам. Семантический AI-разбор в Worker пока не подключён.",
      generated_by: "rule_engine", answered: rows.length, incorrect: incorrect.length, unresolved: unresolved.length,
      items: [...incorrect, ...unresolved].map((row) => ({ question_id: row.question_id, is_correct: row.is_correct,
        grading_status: row.grading_status, feedback: row.grading_feedback || (row.is_correct === false ? "Сверьте ответ с эталоном." : "Требуется ручная проверка.") })) };
    return { ok: true, data: { review, model: null } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    return fail(503, "AI_REVIEW_ERROR", "Разбор подготовки временно недоступен");
  }
}
