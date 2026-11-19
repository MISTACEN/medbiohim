import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, isAdmin } from "./shared";

import type { AdminScheduleRouter } from "./types";

export function registerEntryUpdateRoutes(adminSchedule: AdminScheduleRouter) {
adminSchedule.patch("/schedule/entries/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const entryId = String(c.req.param("id") || "");

  // Правка записей расписания — только администратор (план §10):
  // преподаватель без назначенной области не должен менять чужие занятия.
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Записи расписания правит только администратор", 403, rid), 403);
  }

  if (!UUID.test(entryId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID записи", 422, rid), 422);
  }
  
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  
  // Validate updatable fields
  const room = payload?.room || null;
  const start_time = payload?.start_time || null;
  const end_time = payload?.end_time || null;
  const lesson_type = payload?.lesson_type || null;
  const topic = payload?.topic || null;
  const is_canceled = payload?.is_canceled;
  
  try {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    
    if (room !== null) updateData.room = room;
    if (start_time !== null) updateData.start_time = start_time;
    if (end_time !== null) updateData.end_time = end_time;
    if (lesson_type !== null) updateData.lesson_type = lesson_type;
    if (topic !== null) updateData.topic = topic;
    if (is_canceled !== undefined) {
      updateData.status = is_canceled ? 'canceled' : 'scheduled';
    }
    
    const { data, error } = await db
      .from("schedule_entries")
      .update(updateData)
      .eq("id", entryId)
      .select("*")
      .maybeSingle();
    
    if (error) throw error;
    if (!data) {
      return c.json(fail("NOT_FOUND", "Запись не найдена", 404, rid), 404);
    }
    
    return c.json(ok({ item: data }, rid));
  } catch (error) {
    console.error("[admin:schedule:update]", error);
    return c.json(fail("UPDATE_FAILED", "Не удалось обновить запись", 503, rid), 503);
  }
});
}
