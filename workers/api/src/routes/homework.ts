import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const homework = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const relation = (value: any) => Array.isArray(value) ? value[0] : value;

async function callerRoles(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db.from("user_roles").select("roles(code)").eq("user_id", userId).limit(25);
  if (error) throw error;
  const codes: string[] = [];
  for (const row of data || []) {
    const roleRows = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
    for (const role of roleRows) {
      const code = String(role?.code || "").toLowerCase().trim();
      if (code) codes.push(code);
    }
  }
  return [...new Set(codes)];
}
const STAFF_ROLES = new Set(["teacher", "moderator", "admin"]);

homework.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  try {
    const { data: memberships, error: membershipError } = await db.from("group_memberships")
      .select("group_id,groups(is_active)").eq("user_id", user.id).eq("is_active", true).limit(100);
    if (membershipError) throw membershipError;
    const groupIds = [...new Set((memberships || [])
      .filter((m: any) => relation(m.groups)?.is_active !== false)
      .map((m: any) => String(m.group_id)).filter((id: string) => UUID.test(id)))];
    const queries: any[] = [];
    if (groupIds.length) queries.push(db.from("homeworks")
      .select("*,subjects(name,slug,color_hex),schedule_entries(id,date,start_time,end_time,subject_name)")
      .in("group_id", groupIds).order("due_at", { ascending: true }).limit(500));
    queries.push(db.from("homeworks")
      .select("*,subjects(name,slug,color_hex),schedule_entries(id,date,start_time,end_time,subject_name)")
      .is("group_id", null).eq("created_by", user.id).order("due_at", { ascending: true }).limit(500));
    const results = await Promise.all(queries);
    const failed = results.find((result: any) => result.error);
    if (failed) throw failed.error;
    const unique = new Map<string, any>();
    for (const result of results) for (const row of result.data || []) unique.set(String(row.id), row);
    const items = [...unique.values()].sort((a: any, b: any) =>
      String(a.due_at || a.due_date || "9999-12-31").localeCompare(String(b.due_at || b.due_date || "9999-12-31")));
    return c.json(ok({ items, user_id: user.id }, rid));
  } catch (error) {
    console.error("[homeworks:list]", error);
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
  let dueDate = payload?.due_date ? String(payload.due_date) : (dueAt && /^\d{4}-\d{2}-\d{2}/.test(dueAt) ? dueAt.slice(0, 10) : null);
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
        .select("id,date,subject_id,schedule_id,schedules!inner(id,group_id,is_active)")
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
      if (!dueDate && (entry as any).date) dueDate = String((entry as any).date).slice(0, 10);
    } else if (groupId && !memberGroupIds.includes(groupId)) {
      const { body, status } = fail("FORBIDDEN", "Вы не состоите в выбранной учебной группе", 403, rid);
      return c.json(body, status as 403);
    }

    const insert: Record<string, unknown> = {
      title, description, due_at: dueAt || (dueDate ? dueDate + " 23:59:00" : null), due_date: dueDate,
      subject_id: subjectId, group_id: groupId, schedule_entry_id: scheduleEntryId,
      created_by: user.id, created_by_role: "student", status: "open",
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
  const db = c.get("supabase");
  const id = c.req.param("id");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID задания", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: Record<string, unknown>;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const textAnswer = payload.text_answer == null ? (payload.content ?? payload.body ?? null) : payload.text_answer;
  if (textAnswer !== null && String(textAnswer).length > 50000) {
    const { body, status } = fail("PAYLOAD_TOO_LARGE", "Ответ слишком длинный", 413, rid);
    return c.json(body, status as 413);
  }
  const fileId = payload.file_id == null || payload.file_id === "" ? null : String(payload.file_id);
  if (fileId && !UUID.test(fileId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный file_id", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: task, error: taskError } = await db.from("homeworks")
      .select("id,group_id,status,created_by").eq("id", id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    if (!task.group_id && String(task.created_by || "") !== user.id) {
      const { body, status } = fail("FORBIDDEN", "Личное задание недоступно для сдачи другим пользователям", 403, rid);
      return c.json(body, status as 403);
    }
    if (task.group_id) {
      const { data: membership, error: membershipError } = await db.from("group_memberships")
        .select("group_id").eq("user_id", user.id).eq("group_id", task.group_id).eq("is_active", true).limit(1);
      if (membershipError) throw membershipError;
      if (!membership?.length) {
        const { body, status } = fail("FORBIDDEN", "Задание недоступно в вашей учебной группе", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data: existing, error: existingError } = await db.from("homework_submissions")
      .select("id,status").eq("homework_id", id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
    if (existingError) throw existingError;
    const locked = (existing || []).some((row: any) => ["submitted", "pending", "awaiting_review", "on_review"].includes(String(row.status || "").toLowerCase()));
    if (locked) {
      const { body, status } = fail("SUBMISSION_LOCKED", "Работа уже сдана и ожидает проверки", 409, rid);
      return c.json(body, status as 409);
    }
    if (fileId) {
      const { data: file, error: fileError } = await db.from("files").select("id,uploaded_by,owner_id").eq("id", fileId).maybeSingle();
      if (fileError) throw fileError;
      const owner = String(file?.uploaded_by || file?.owner_id || "");
      if (!file || (owner && owner !== user.id)) {
        const { body, status } = fail("FORBIDDEN", "Файл недоступен в контексте этого задания", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data, error } = await db.from("homework_submissions").insert({
      homework_id: id, user_id: user.id, text_answer: textAnswer == null ? null : String(textAnswer),
      file_id: fileId, status: "submitted", submitted_at: new Date().toISOString(),
    }).select("*").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("submission not returned");
    return c.json(ok({ submission: data }, rid), 201);
  } catch (error) {
    console.error("[homework:submit]", error);
    const { body, status } = fail("SUBMISSION_FAILED", "Не удалось отправить работу", 503, rid);
    return c.json(body, status as 503);
  }
});


/** Students can see only their own submissions; staff can review the task's submissions. */
homework.get("/:id/submissions", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const id = c.req.param("id");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID задания", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: task, error: taskError } = await db.from("homeworks")
      .select("id,group_id,created_by").eq("id", id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    const roles = await callerRoles(db, user.id);
    const isStaff = roles.some((role) => STAFF_ROLES.has(role));
    if (!isStaff) {
      if (task.group_id) {
        const { data: membership, error: membershipError } = await db.from("group_memberships")
          .select("group_id").eq("user_id", user.id).eq("group_id", task.group_id).eq("is_active", true).limit(1);
        if (membershipError) throw membershipError;
        if (!membership?.length) {
          const { body, status } = fail("FORBIDDEN", "Задание недоступно в вашей учебной группе", 403, rid);
          return c.json(body, status as 403);
        }
      } else if (String(task.created_by || "") !== user.id) {
        const { body, status } = fail("FORBIDDEN", "Можно просматривать только собственные задания", 403, rid);
        return c.json(body, status as 403);
      }
    }
    let query = db.from("homework_submissions")
      .select("id,homework_id,user_id,text_answer,file_id,status,grade,teacher_comment,submitted_at,graded_at,graded_by,created_at")
      .eq("homework_id", id).order("submitted_at", { ascending: false }).limit(500);
    if (!isStaff) query = query.eq("user_id", user.id);
    const { data, error } = await query;
    if (error) throw error;
    return c.json(ok({ items: data || [], can_grade: isStaff }, rid));
  } catch (error) {
    console.error("[homework:submissions]", error);
    const { body, status } = fail("SUBMISSIONS_UNAVAILABLE", "Не удалось загрузить сданные работы", 503, rid);
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
