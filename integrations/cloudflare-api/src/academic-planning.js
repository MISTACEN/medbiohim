import { authenticateSupabaseRequest } from "./supabase-auth.js";

const fail = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const relIdFilter = (values) => "in.(" + values.map((v) => String(v)).filter((v) => UUID.test(v)).join(",") + ")";
const uniq = (values) => [...new Set(values.map((v) => String(v || "")).filter((v) => UUID.test(v)))];

async function createClient(request, env, fetcher) {
  const auth = await authenticateSupabaseRequest(request, env, fetcher);
  if (!auth.ok) return auth;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }

  async function rest(path, params = {}, init = {}) {
    const url = new URL("/rest/v1/" + path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetcher(url.toString(), {
      ...init,
      method: init.method || "GET",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        accept: "application/json",
        ...(init.body != null ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    const text = await response.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    if (!response.ok) {
      const error = new Error("Supabase REST request failed");
      error.status = response.status;
      error.code = payload?.code || payload?.error || "REST_ERROR";
      error.resource = String(path).split("?")[0].replace(/[^a-zA-Z0-9_./-]/g, "").slice(0, 80);
      throw error;
    }
    return payload;
  }
  const rows = async (table, params = {}, init = {}) => {
    const payload = await rest(table, params, init);
    return Array.isArray(payload) ? payload : [];
  };
  const rpc = async (name, payload = {}) => rest("rpc/" + name, {}, { method: "POST", body: JSON.stringify(payload) });
  return { ok: true, user: auth.user, rows, rest, rpc };
}

function buildRecommendations(debts, upcoming, weak, pending) {
  const out = [];
  for (const debt of debts) {
    const subject = String(debt.subject_name || "Предмет");
    const match = upcoming.find((event) =>
      String(event.subject_id || "") === String(debt.subject_id || "") &&
      ["retake", "makeup"].includes(String(event.event_kind))
    );
    if (match) {
      const when = String(match.date || "") + " " + String(match.start_time || "").slice(0, 5);
      const where = [match.building, match.room].map((v) => String(v || "").trim()).filter(Boolean).join(", ");
      out.push({
        priority: "urgent", action_type: "prepare_retake", title: subject + " — пересдача/досдача",
        reason: "Академическое требование не закрыто; подтверждённое событие есть в расписании.",
        due_at: String(match.date) + "T" + String(match.start_time),
        subject_id: debt.subject_id ?? null, topic_id: debt.target_type === "topic" ? debt.target_id : null,
        schedule_entry_id: match.id, event: match, when: when.trim(), where,
      });
    } else {
      out.push({
        priority: "high", action_type: "close_debt", title: subject + " — закрыть академический долг",
        reason: "Требование не закрыто. Дата пересдачи/досдачи пока не указана в расписании.",
        subject_id: debt.subject_id ?? null, topic_id: debt.target_type === "topic" ? debt.target_id : null,
      });
    }
  }
  for (const event of upcoming) {
    if (["retake", "makeup"].includes(String(event.event_kind))) continue;
    const kind = String(event.event_kind || "");
    out.push({
      priority: ["exam", "credit"].includes(kind) ? "urgent" : "high",
      action_type: kind === "exam" ? "prepare_exam" : kind === "credit" ? "close_debt" : "review",
      title: String(event.subject_name || "Предмет") + " — " + String(event.event_kind || "событие"),
      reason: "Подтверждённое событие ближайших 60 дней в расписании.",
      due_at: String(event.date) + "T" + String(event.start_time),
      subject_id: event.subject_id ?? null, schedule_entry_id: event.id, event,
    });
  }
  for (const topic of weak.slice(0, 10)) {
    out.push({
      priority: Number(topic.percent) < 40 ? "high" : "normal", action_type: "study",
      title: "Повторить: " + String(topic.subject_name || "Предмет") + " — " + String(topic.topic_name || "тема"),
      reason: "Текущий учебный прогресс ниже 70%.",
      subject_id: topic.subject_id ?? null, topic_id: topic.topic_id ?? null,
    });
  }
  for (const item of pending.slice(0, 10)) {
    out.push({
      priority: "high", action_type: "close_debt",
      title: String(item.subject_name || "Предмет") + " — незакрытое требование",
      reason: "Требование отмечено как ожидающее закрытия.",
      subject_id: item.subject_id ?? null,
      curriculum_item_id: item.target_type === "curriculum_item" ? item.target_id : null,
    });
  }
  return out.slice(0, 40);
}

export async function getSupabaseAcademicState(request, env, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const uid = client.user.id;
  // A best-effort sync keeps derived state fresh, but the page can still render if
  // the public RPC is unavailable; all reads below remain scoped to the caller JWT.
  try { await client.rpc("sync_my_academic_state", {}); } catch {}

  try {
    const [profileRows, sessionRows, stateRows, progressRows, membershipRows] = await Promise.all([
      client.rows("users", { select: "id,full_name,course_number,semester", id: "eq." + uid, limit: "1" }),
      client.rows("academic_sessions", { select: "id,title,type,start_date,end_date,course_number,semester,notes", is_current: "eq.true", order: "start_date.desc.nullslast", limit: "1" }),
      client.rows("student_academic_states", { select: "id,target_type,target_id,subject_id,learning_status,academic_status,execution_status,manual_override,note,last_result,last_result_max,updated_at", user_id: "eq." + uid, order: "updated_at.desc", limit: "1000" }),
      client.rows("user_topic_progress", { select: "topic_id,percent,status,last_activity_at", user_id: "eq." + uid, order: "last_activity_at.desc.nullslast", limit: "1000" }),
      client.rows("group_memberships", { select: "group_id", user_id: "eq." + uid, is_active: "eq.true", limit: "100" }),
    ]);
    const profile = profileRows[0] || { id: uid, full_name: "Student", course_number: null, semester: null };
    const curriculumParams = { select: "id,item_type", is_active: "eq.true", limit: "5000" };
    if (profile.course_number != null) curriculumParams.course_number = "eq." + profile.course_number;
    if (profile.semester != null) curriculumParams.semester = "eq." + profile.semester;
    const curriculum = await client.rows("curriculum_items", curriculumParams);

    const topicIds = uniq([
      ...progressRows.map((row) => row.topic_id),
      ...stateRows.filter((row) => row.target_type === "topic").map((row) => row.target_id),
    ]);
    const subjectIds = uniq(stateRows.map((row) => row.subject_id));
    const topics = topicIds.length
      ? await client.rows("topics", { select: "id,title,module_id", id: relIdFilter(topicIds), limit: "2000" })
      : [];
    const moduleIds = uniq(topics.map((row) => row.module_id));
    const modules = moduleIds.length
      ? await client.rows("modules", { select: "id,subject_id,title", id: relIdFilter(moduleIds), limit: "2000" })
      : [];
    subjectIds.push(...uniq(modules.map((row) => row.subject_id)));
    const allSubjectIds = uniq(subjectIds);
    const subjects = allSubjectIds.length
      ? await client.rows("subjects", { select: "id,name,slug", id: relIdFilter(allSubjectIds), limit: "2000" })
      : [];
    const topicById = new Map(topics.map((row) => [String(row.id), row]));
    const moduleById = new Map(modules.map((row) => [String(row.id), row]));
    const subjectById = new Map(subjects.map((row) => [String(row.id), row]));
    const states = stateRows.map((row) => {
      const subject = subjectById.get(String(row.subject_id || ""));
      const topic = row.target_type === "topic" ? topicById.get(String(row.target_id)) : null;
      return { ...row, subject_name: subject?.name || "", topic_name: topic?.title || "" };
    });
    const topicProgress = progressRows.map((row) => {
      const topic = topicById.get(String(row.topic_id));
      const module = topic ? moduleById.get(String(topic.module_id)) : null;
      const subject = module ? subjectById.get(String(module.subject_id)) : null;
      return {
        ...row,
        topic_name: topic?.title || "",
        subject_id: module?.subject_id || null,
        subject_name: subject?.name || "",
        subject_slug: subject?.slug || null,
      };
    });
    const groups = uniq(membershipRows.map((row) => row.group_id));
    const schedules = groups.length
      ? await client.rows("schedules", { select: "id,group_id", group_id: relIdFilter(groups), is_active: "eq.true", limit: "200" })
      : [];
    const scheduleIds = uniq(schedules.map((row) => row.id));
    let schedule = [];
    if (scheduleIds.length) {
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      today.setUTCDate(today.getUTCDate() + 60);
      const to = today.toISOString().slice(0, 10);
      schedule = await client.rows("schedule_entries", {
        select: "id,subject_id,subject_name,date,start_time,end_time,type,event_kind,is_makeup,room,building,notes,session_id,schedule_id",
        schedule_id: relIdFilter(scheduleIds),
        date: "gte." + from,
        or: "(is_cancelled.is.null,is_cancelled.eq.false)",
        order: "date.asc,start_time.asc",
        limit: "120",
      });
      schedule = schedule.filter((row) => String(row.date || "") <= to);
      for (const item of schedule) {
        const subject = subjectById.get(String(item.subject_id || ""));
        if (!item.subject_name) item.subject_name = subject?.name || "";
      }
    }

    const debts = states.filter((row) => ["failed", "retake_required"].includes(String(row.academic_status)));
    const pending = states.filter((row) => String(row.academic_status) === "pending");
    const eventKinds = new Set(["credit", "exam", "retake", "makeup", "colloquium", "control_work", "assessment"]);
    const upcoming = schedule.filter((row) => eventKinds.has(String(row.event_kind)));
    const closed = states.filter((row) => String(row.academic_status) === "passed").length;
    const inProgress = states.filter((row) => String(row.learning_status) === "in_progress").length;
    const notStarted = states.filter((row) => String(row.learning_status) === "not_started").length;
    const weak = topicProgress.filter((row) => row.percent != null && Number.isFinite(Number(row.percent)) && Number(row.percent) < 70);
    const recommendations = buildRecommendations(debts, upcoming, weak, pending);
    return {
      ok: true,
      data: {
        profile,
        session: sessionRows[0] || null,
        plan: {
          available: curriculum.length > 0,
          items: curriculum.length,
          concrete_items: curriculum.filter((row) => !["module", "topic", "subtopic"].includes(String(row.item_type))).length,
          message: curriculum.length > 0 ? null : "Официальный учебный план для текущего курса/семестра ещё не загружен.",
        },
        metrics: { closed, in_progress: inProgress, not_started: notStarted, debts: debts.length, tracked: states.length },
        states, topic_progress: topicProgress, debts, upcoming, weak_topics: weak, recommendations,
        generated_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав");
    return fail(503, "ACADEMIC_STATE_ERROR", "Состояние учебного плана временно недоступно");
  }
}

export async function syncSupabaseAcademicState(request, env, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  try {
    await client.rpc("sync_my_academic_state", {});
    return { ok: true, data: { synced: true } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав");
    return fail(503, "ACADEMIC_SYNC_ERROR", "Синхронизация учебного плана временно недоступна");
  }
}

export async function saveSupabaseAcademicState(request, env, input, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const uid = client.user.id;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const targetType = String(body.target_type || "");
  const targetId = String(body.target_id || "");
  const allowedLearning = new Set(["not_started", "in_progress", "completed"]);
  const allowedAcademic = new Set(["not_required", "pending", "passed", "failed", "retake_required"]);
  const allowedExecution = new Set(["not_done", "done", "overdue"]);
  const learning = String(body.learning_status || "not_started");
  const academic = String(body.academic_status || "not_required");
  const execution = String(body.execution_status || "not_done");
  if (!["curriculum_item", "topic", "subject"].includes(targetType) || !UUID.test(targetId)) {
    return fail(422, "VALIDATION_ERROR", "target_type и корректный target_id обязательны");
  }
  if (!allowedLearning.has(learning) || !allowedAcademic.has(academic) || !allowedExecution.has(execution)) {
    return fail(422, "VALIDATION_ERROR", "Недопустимый статус академического состояния");
  }
  const numeric = (value) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : NaN;
  const lastResult = numeric(body.last_result), lastResultMax = numeric(body.last_result_max);
  if (Number.isNaN(lastResult) || Number.isNaN(lastResultMax)) return fail(422, "VALIDATION_ERROR", "last_result и last_result_max должны быть числами");
  const row = {
    user_id: uid,
    target_type: targetType,
    target_id: targetId,
    subject_id: UUID.test(String(body.subject_id || "")) ? String(body.subject_id) : null,
    learning_status: learning,
    academic_status: academic,
    execution_status: execution,
    manual_override: Object.prototype.hasOwnProperty.call(body, "manual_override") ? Boolean(body.manual_override) : true,
    note: body.note == null ? null : String(body.note).slice(0, 2000),
    last_result: lastResult,
    last_result_max: lastResultMax,
    updated_at: new Date().toISOString(),
  };
  try {
    const saved = await client.rows("student_academic_states", { on_conflict: "user_id,target_type,target_id", select: "*" }, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (!saved[0]) return fail(503, "ACADEMIC_STATE_ERROR", "Состояние учебного плана не сохранено");
    return { ok: true, data: { state: saved[0] } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав");
    if (error?.status === 400 || error?.status === 422) return fail(422, "VALIDATION_ERROR", "База данных отклонила академическое состояние");
    return fail(503, "ACADEMIC_STATE_ERROR", "Состояние учебного плана временно недоступно");
  }
}

export async function generateSupabaseAcademicPlan(request, env, fetcher = fetch) {
  const state = await getSupabaseAcademicState(request, env, fetcher);
  if (!state.ok) return state;
  const plan = {
    id: null,
    summary: "План сформирован по фактам учебного состояния и расписания. AI-провайдер для этого Worker ещё не подключён, поэтому использованы детерминированные рекомендации.",
    generated_by: "rule_engine",
    model: null,
    persisted: false,
  };
  return { ok: true, data: { plan, items: state.data.recommendations, source_state: state.data } };
}
