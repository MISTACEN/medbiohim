import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const academic = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEARNING = new Set(["not_started", "in_progress", "completed"]);
const ACADEMIC = new Set(["not_required", "pending", "passed", "failed", "retake_required"]);
const EXECUTION = new Set(["not_done", "done", "overdue"]);

academic.post("/sync", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  for (const name of ["sync_my_academic_state", "sync_student_academic_state", "medbiohim_sync_student_academic_state"]) {
    try {
      const args = name === "sync_my_academic_state" ? {} : { p_user_id: user.id };
      const { error } = await db.rpc(name, args);
      if (!error) return c.json(ok({ synced: true, rpc: name }, rid));
    } catch { /* try compatibility alias */ }
  }
  return c.json(ok({ synced: false, rpc: null, note: "Состояние загружено из актуальных таблиц; RPC синхронизации не опубликована." }, rid));
});

academic.get("/state", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  try {
    const [statesResult, progressResult, profileResult] = await Promise.all([
      db.from("student_academic_states").select("id,target_type,target_id,subject_id,learning_status,academic_status,execution_status,manual_override,note,last_result,last_result_max,updated_at,subjects(name)").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(2000),
      db.from("user_topic_progress").select("topic_id,percent,status,last_activity_at,topics(title,module_id,modules(subject_id,subjects(name)))").eq("user_id", user.id).order("last_activity_at", { ascending: false }).limit(500),
      db.from("users").select("id,full_name,course_number,semester").eq("id", user.id).maybeSingle(),
    ]);
    if (statesResult.error) console.error("[academic:state:states]", statesResult.error.message);
    if (progressResult.error) throw progressResult.error;
    if (profileResult.error) throw profileResult.error;
    const statesOk = !statesResult.error;
    const progressOk = !progressResult.error;

    const rawStates = statesOk ? (statesResult.data || []) : [];
    const topicIds = [...new Set(rawStates
      .filter((state: any) => state.target_type === "topic" && typeof state.target_id === "string")
      .map((state: any) => state.target_id))];
    const topicNames = new Map<string, string>();
    if (topicIds.length) {
      const { data: topics, error: topicsError } = await db.from("topics").select("id,title").in("id", topicIds);
      if (topicsError) console.error("[academic:state:topics]", topicsError.message);
      for (const topic of topics || []) topicNames.set(topic.id, topic.title || "");
    }

    const states = rawStates.map((s: any) => {
      const subject = Array.isArray(s.subjects) ? s.subjects[0] : s.subjects;
      return {
        ...s,
        subject_name: subject?.name || "",
        topic_name: s.target_type === "topic" ? topicNames.get(s.target_id) || "" : "",
        subjects: undefined,
      };
    });
    const topicProgress = (progressOk ? (progressResult.data || []) : []).map((p: any) => {
      const topic = Array.isArray(p.topics) ? p.topics[0] : p.topics;
      const topicModule = Array.isArray(topic?.modules) ? topic.modules[0] : topic?.modules;
      const subject = Array.isArray(topicModule?.subjects) ? topicModule.subjects[0] : topicModule?.subjects;
      return { topic_id: p.topic_id, percent: p.percent, status: p.status, last_activity_at: p.last_activity_at,
        topic_name: topic?.title || "", subject_id: topicModule?.subject_id ?? null, subject_name: subject?.name || "" };
    });
    const debts = states.filter((s: any) => ["failed", "retake_required"].includes(String(s.academic_status)));
    const pending = states.filter((s: any) => s.academic_status === "pending");
    const inProgress = states.filter((s: any) => s.learning_status === "in_progress").length;
    const notStarted = states.filter((s: any) => s.learning_status === "not_started").length;
    const closed = states.filter((s: any) => s.learning_status === "completed" || s.academic_status === "passed").length;
    const weak = topicProgress.filter((p: any) => Number(p.percent ?? 0) < 70).slice(0, 20);
    const { data: upcomingRows, error: upcomingError } = await db.from("schedule_entries")
      .select("id,date,start_time,event_kind,subject_id,subject_name,schedule_id,schedules!inner(group_id,is_active)")
      .gte("date", new Date().toISOString().slice(0, 10)).order("date", { ascending: true }).limit(100);
    const upcoming = upcomingError ? [] : (upcomingRows || []).filter((e: any) => {
      const sch = Array.isArray(e.schedules) ? e.schedules[0] : e.schedules;
      return sch?.is_active !== false;
    }).slice(0, 30);
    const recommendations: any[] = [];
    for (const debt of debts) recommendations.push({ priority: "high", action_type: "close_debt",
      title: (debt.subject_name || "Предмет") + " — закрыть академический долг",
      reason: "Академическое требование не закрыто.", subject_id: debt.subject_id ?? null,
      topic_id: debt.target_type === "topic" ? debt.target_id : null });
    for (const event of upcoming) recommendations.push({ priority: ["exam", "credit"].includes(String(event.event_kind)) ? "urgent" : "normal",
      action_type: event.event_kind === "exam" ? "prepare_exam" : event.event_kind === "credit" ? "close_debt" : "review",
      title: (event.subject_name || "Предмет") + " — " + (event.event_kind || "занятие"),
      reason: "Ближайшее событие из расписания.", due_at: event.date + (event.start_time ? "T" + event.start_time : ""),
      subject_id: event.subject_id ?? null, schedule_entry_id: event.id, event });
    for (const p of weak) recommendations.push({ priority: Number(p.percent) < 40 ? "high" : "normal",
      action_type: "study", title: "Повторить: " + (p.subject_name || "Предмет") + " — " + (p.topic_name || "тема"),
      reason: "Учебный прогресс ниже 70%.", subject_id: p.subject_id ?? null, topic_id: p.topic_id });
    const profile: any = profileResult.data || { id: user.id };
    let plan = { available: false, items: 0, concrete_items: 0 };
    try {
      const hasCourse = Number.isFinite(Number(profile.course_number)) && Number(profile.course_number) > 0;
      const hasSemester = Number.isFinite(Number(profile.semester)) && Number(profile.semester) > 0;
      let query = db.from("curriculum_items").select("id", { count: "exact", head: true }).eq("is_active", true);
      if (hasCourse) query = query.eq("course_number", Number(profile.course_number));
      if (hasSemester) query = query.eq("semester", Number(profile.semester));
      let curriculum = await query;
      let scoped = true;
      if (!curriculum.error && Number(curriculum.count || 0) === 0 && (hasCourse || hasSemester)) {
        curriculum = await db.from("curriculum_items").select("id", { count: "exact", head: true }).eq("is_active", true);
        scoped = false;
      }
      if (!curriculum.error && Number(curriculum.count || 0) > 0) {
        let requiredQuery = db.from("curriculum_items").select("id", { count: "exact", head: true }).eq("is_active", true).eq("is_required", true);
        if (scoped && hasCourse) requiredQuery = requiredQuery.eq("course_number", Number(profile.course_number));
        if (scoped && hasSemester) requiredQuery = requiredQuery.eq("semester", Number(profile.semester));
        const required = await requiredQuery;
        plan = { available: true, items: Number(curriculum.count), concrete_items: required.error ? 0 : Number(required.count || 0) };
      }
    } catch (error) {
      console.warn("[academic:state:curriculum]", error instanceof Error ? error.message : "unavailable");
    }
    return c.json(ok({ profile, session: null, plan, metrics: { closed, in_progress: inProgress,
      not_started: notStarted, debts: debts.length, tracked: states.length }, states, topic_progress: topicProgress,
      debts, upcoming, weak_topics: weak, recommendations: recommendations.slice(0, 40), generated_at: new Date().toISOString() }, rid));
  } catch (error) {
    console.error("[academic:state]", error);
    return c.json(ok({
      profile: { id: user.id },
      session: null,
      plan: { available: false, items: 0, concrete_items: 0 },
      metrics: { closed: 0, in_progress: 0, not_started: 0, debts: 0, tracked: 0 },
      states: [], topic_progress: [], debts: [], upcoming: [], weak_topics: [],
      recommendations: [], generated_at: new Date().toISOString(),
      degraded: true,
      service_notice: "Академическое состояние временно недоступно",
    }, rid));
  }
});

academic.put("/state", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  let payload: any;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const targetType = String(payload?.target_type || "");
  const targetId = String(payload?.target_id || "");
  const learning = String(payload?.learning_status || "not_started");
  const academicStatus = String(payload?.academic_status || "not_required");
  const execution = String(payload?.execution_status || "not_done");
  const subjectId = payload?.subject_id ? String(payload.subject_id) : null;
  if (!["curriculum_item", "topic", "subject"].includes(targetType) || !UUID.test(targetId) ||
      !LEARNING.has(learning) || !ACADEMIC.has(academicStatus) || !EXECUTION.has(execution) ||
      (subjectId && !UUID.test(subjectId))) {
    const { body, status } = fail("VALIDATION_ERROR", "Недопустимые поля академического состояния", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: existing, error: existingError } = await db.from("student_academic_states").select("id")
      .eq("user_id", user.id).eq("target_type", targetType).eq("target_id", targetId).maybeSingle();
    if (existingError && !String(existingError.code || "").startsWith("PGRST116")) throw existingError;
    const body = { user_id: user.id, target_type: targetType, target_id: targetId, subject_id: subjectId,
      learning_status: learning, academic_status: academicStatus, execution_status: execution,
      manual_override: Object.prototype.hasOwnProperty.call(payload, "manual_override") ? payload.manual_override === true : true,
      note: payload.note == null ? null : String(payload.note).slice(0, 2000),
      last_result: payload.last_result ?? null, last_result_max: payload.last_result_max ?? null, updated_at: new Date().toISOString() };
    const result = existing?.id
      ? await db.from("student_academic_states").update(body).eq("id", existing.id).eq("user_id", user.id).select("*").maybeSingle()
      : await db.from("student_academic_states").insert(body).select("*").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("no state returned");
    try {
      await db.from("academic_progress_history").insert({ user_id: user.id, subject_id: subjectId,
        topic_id: targetType === "topic" ? targetId : null, curriculum_item_id: targetType === "curriculum_item" ? targetId : null,
        percent: payload.percent ?? null, learning_status: learning, academic_status: academicStatus,
        source: "manual", metadata: { execution_status: execution } });
    } catch { /* history is optional */ }
    return c.json(ok({ state: result.data }, rid));
  } catch (error) {
    console.error("[academic:save]", error);
    const { body, status } = fail("ACADEMIC_STATE_ERROR", "Не удалось сохранить академическое состояние", 503, rid);
    return c.json(body, status as 503);
  }
});

academic.post("/ai-plan", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  try {
    const { data: states, error } = await db.from("student_academic_states")
      .select("target_type,target_id,subject_id,learning_status,academic_status,subjects(name)")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;
    const items = (states || []).filter((s: any) => ["failed", "retake_required", "pending"].includes(s.academic_status) || s.learning_status !== "completed")
      .slice(0, 30).map((s: any, index: number) => ({ order_index: index + 1,
        title: ((Array.isArray(s.subjects) ? s.subjects[0] : s.subjects)?.name || "Предмет") + " — " +
          (["failed", "retake_required"].includes(s.academic_status) ? "закрыть академический долг" : "продолжить подготовку"),
        target_type: s.target_type, target_id: s.target_id, subject_id: s.subject_id,
        priority: ["failed", "retake_required"].includes(s.academic_status) ? "high" : "normal" }));
    return c.json(ok({ plan: { generated_by: "rule_engine", summary: "План построен по текущему академическому состоянию.", items }, items, persisted: false }, rid));
  } catch (error) {
    console.error("[academic:ai-plan]", error);
    const { body, status } = fail("ACADEMIC_PLAN_ERROR", "Не удалось построить учебный план", 503, rid);
    return c.json(body, status as 503);
  }
});

export default academic;
