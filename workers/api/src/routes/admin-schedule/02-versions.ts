import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { isAdmin } from "./shared";

import type { AdminScheduleRouter } from "./types";

export function registerVersionRoutes(adminSchedule: AdminScheduleRouter) {
adminSchedule.get("/schedule/versions/:scheduleId", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const scheduleId = String(c.req.param("scheduleId") || "");

  // Проверка прав: версии расписания — служебная информация редактора.
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Только преподаватели и админы могут смотреть версии расписания", 403, rid), 403);
  }

  // Verify UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scheduleId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID расписания", 422, rid), 422);
  }
  
  try {
    const { data, error } = await db
      .from("schedule_versions")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("version", { ascending: false })
      .limit(50);
    
    if (error) {
      console.error("[admin:schedule:versions]", error);
      return c.json(fail("DB_UNAVAILABLE", "История версий недоступна", 503, rid), 503);
    }
    
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[admin:schedule:versions]", error);
    return c.json(fail("VERSIONS_UNAVAILABLE", "История версий недоступна", 503, rid), 503);
  }
});
}
