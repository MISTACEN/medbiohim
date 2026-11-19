import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { smartPasteParse } from "../../lib/smart-paste";

import { UUID, relation, notifyGroupNewHomework } from "./shared";

import type { HomeworkRouter } from "./types";

export function registerCreateRoutes(homework: HomeworkRouter) {
homework.post("/smart-parse", requireAuth, async (c) => {
  const rid = requestId();
  let payload: { text?: string } = {};
  try { payload = await c.req.json(); } catch {}
  const text = String(payload.text || "");
  if (!text.trim()) {
    const { body, status } = fail("VALIDATION_ERROR", "Вставьте текст задания", 422, rid);
    return c.json(body, status as 422);
  }
  if (text.length > 10000) {
    const { body, status } = fail("VALIDATION_ERROR", "Текст длиннее 10000 знаков", 422, rid);
    return c.json(body, status as 422);
  }
  const parsed = smartPasteParse(text, new Date());
  return c.json(ok(parsed, rid));
});

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
    if (data && data.group_id) {
      // FA1: уведомление группы — вне основного ответа.
      try { notifyGroupNewHomework(c.env, c.executionCtx, data as any, db); } catch { /* не влияет на ответ */ }
    }
    return c.json(ok({ item: data }, rid), 201);
  } catch (error) {
    console.error("[homework:create]", error);
    const { body, status } = fail("HOMEWORK_CREATE_FAILED", "Не удалось создать задание", 503, rid);
    return c.json(body, status as 503);
  }
});
}
