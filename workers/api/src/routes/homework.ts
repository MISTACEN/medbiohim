import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const homework = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const relation = (value: any) => Array.isArray(value) ? value[0] : value;

homework.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase.from("homeworks")
      .select("*,subjects(name,slug,color_hex),schedule_entries(id,date,start_time,end_time,subject_name)")
      .order("due_at", { ascending: true }).limit(500);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Задания недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [], user_id: user.id }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Задания недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Student-created personal/group homework is supported. A linked lesson must
 * belong to an active schedule of a group the caller is actually a member of.
 */
homework.post("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  let payload: any;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const title = String(payload?.title || "").trim();
  const description = payload?.description == null ? null : String(payload.description).slice(0, 10000);
  const scheduleEntryId = payload?.schedule_entry_id ? String(payload.schedule_entry_id) : null;
  let groupId = payload?.group_id ? String(payload.group_id) : null;
  let subjectId = payload?.subject_id ? String(payload.subject_id) : null;
  if (!title || title.length > 240) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите название задания (до 240 символов)", 422, rid);
    return c.json(body, status as 422);
  }
  if ((groupId && !UUID.test(groupId)) || (subjectId && !UUID.test(subjectId)) || (scheduleEntryId && !UUID.test(scheduleEntryId))) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный идентификатор группы, предмета или занятия", 422, rid);
    return c.json(body, status as 422);
  }
  const dueAt = payload?.due_at ? String(payload.due_at) : null;
  const dueDate = payload?.due_date ? String(payload.due_date) : (dueAt && /^\d{4}-\d{2}-\d{2}/.test(dueAt) ? dueAt.slice(0, 10) : null);
  if ((dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) || (dueAt && Number.isNaN(Date.parse(dueAt)))) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный срок выполнения", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    const { data: memberships, error: membershipError } = await db.from("group_memberships")
      .select("group_id,groups(id,is_active)").eq("user_id", user.id).eq("is_active", true).limit(100);
    if (membershipError) throw membershipError;
    const membershipsValid = (memberships || []).filter((m: any) => relation(m.groups)?.is_active !== false);
    const memberGroupIds = membershipsValid.map((m: any) => String(m.group_id));

    if (scheduleEntryId) {
      const { data: entry, error: entryError } = await db.from("schedule_entries")
        .select("id,subject_id,schedule_id,schedules!inner(id,group_id,is_active)")
        .eq("id", scheduleEntryId).maybeSingle();
      if (entryError) throw entryError;
      const schedule = relation((entry as any)?.schedules);
      if (!entry || !schedule || schedule.is_active === false || !memberGroupIds.includes(String(schedule.group_id))) {
        const { body, status } = fail("INVALID_LESSON_CONTEXT", "Выбранное занятие не относится к вашей активной группе", 422, rid);
        return c.json(body, status as 422);
      }
      if (groupId && groupId !== String(schedule.group_id)) {
        const { body, status } = fail("VALIDATION_ERROR", "Группа задания не совпадает с группой занятия", 422, rid);
        return c.json(body, status as 422);
      }
      groupId = String(schedule.group_id);
      subjectId = subjectId || (entry as any).subject_id || null;
    } else if (groupId && !memberGroupIds.includes(groupId)) {
      const { body, status } = fail("FORBIDDEN", "Вы не состоите в выбранной учебной группе", 403, rid);
      return c.json(body, status as 403);
    }

    const insert: Record<string, unknown> = {
      title, description, due_at: dueAt, due_date: dueDate,
      subject_id: subjectId, group_id: groupId, schedule_entry_id: scheduleEntryId,
      created_by: user.id, created_by_role: "student",
    };
    const { data, error } = await db.from("homeworks").insert(insert).select("*,subjects(name,slug,color_hex),schedule_entries(id,date,start_time,end_time,subject_name)").maybeSingle();
    if (error) {
      console.error("[homework:create]", error);
      const { body, status } = fail("HOMEWORK_CREATE_FAILED", "Не удалось создать задание", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ item: data }, rid), 201);
  } catch (error) {
    console.error("[homework:create]", error);
    const { body, status } = fail("HOMEWORK_CREATE_FAILED", "Не удалось создать задание", 503, rid);
    return c.json(body, status as 503);
  }
});

homework.post("/:id/submit", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID задания", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: Record<string, unknown> = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data: homeworkRow, error: homeworkError } = await supabase.from("homeworks").select("id,group_id").eq("id", id).maybeSingle();
    if (homeworkError) throw homeworkError;
    if (!homeworkRow) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    const { data, error } = await supabase.from("homework_submissions").insert({
      homework_id: id, user_id: user.id, content: payload.content ?? payload.body ?? null, status: "submitted",
    }).select("*").maybeSingle();
    if (error) {
      const { body, status } = fail("SUBMISSION_FAILED", "Не удалось отправить работу", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid), 201);
  } catch {
    const { body, status } = fail("SUBMISSION_FAILED", "Не удалось отправить работу", 503, rid);
    return c.json(body, status as 503);
  }
});

homework.post("/:id/progress", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  let payload: { progress?: number; status?: string; completed?: boolean } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const progress = payload.progress ?? (payload.completed ? 100 : 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    const { body, status } = fail("VALIDATION_ERROR", "progress должен быть числом от 0 до 100", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase.from("homework_progress").upsert({
      homework_id: id, user_id: user.id, progress, completed: payload.completed ?? progress >= 100,
      status: payload.status ?? (progress >= 100 ? "completed" : "in_progress"), updated_at: new Date().toISOString(),
    }, { onConflict: "homework_id,user_id" }).select("*").maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить прогресс", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить прогресс", 503, rid);
    return c.json(body, status as 503);
  }
});

export default homework;
