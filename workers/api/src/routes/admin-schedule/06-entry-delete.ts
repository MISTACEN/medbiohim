import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, isAdmin } from "./shared";

import type { AdminScheduleRouter } from "./types";

export function registerEntryDeleteRoutes(adminSchedule: AdminScheduleRouter) {
adminSchedule.delete("/schedule/entries/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const entryId = String(c.req.param("id") || "");

  // Отмена записи расписания — только администратор (план §10).
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Записи расписания отменяет только администратор", 403, rid), 403);
  }

  if (!UUID.test(entryId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID записи", 422, rid), 422);
  }

  try {
    const { data, error } = await db
      .from("schedule_entries")
      .update({
        archived_at: new Date().toISOString(),
        status: 'canceled'
      })
      .eq("id", entryId)
      .select("*")
      .maybeSingle();
    
    if (error) throw error;
    if (!data) {
      return c.json(fail("NOT_FOUND", "Запись не найдена", 404, rid), 404);
    }
    
    return c.json(ok({ 
      message: "Запись отменена",
      item: data 
    }, rid));
  } catch (error) {
    console.error("[admin:schedule:delete]", error);
    return c.json(fail("DELETE_FAILED", "Не удалось отменить запись", 503, rid), 503);
  }
});
}
