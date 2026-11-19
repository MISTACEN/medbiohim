import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { isAdmin } from "./shared";

import type { AdminScheduleRouter } from "./types";

export function registerSaveRoutes(adminSchedule: AdminScheduleRouter) {
adminSchedule.post("/schedule/save", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  
  // Check permissions
  const allowed = await isAdmin(c);
  if (!allowed) {
    return c.json(fail("FORBIDDEN", "Только преподаватели и админы могут сохранять расписание", 403, rid), 403);
  }
  
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  
  const scheduleId = payload?.schedule_id;
  const entries = payload?.entries;
  const notes = payload?.notes || null;
  
  // Validate inputs
  if (!scheduleId || !Array.isArray(entries)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректные параметры", 422, rid), 422);
  }
  
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scheduleId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID расписания", 422, rid), 422);
  }
  
  try {
    // Call RPC function
    const { data, error } = await db.rpc("medbiohim_version_and_save_schedule", {
      p_user_id: user.id,
      p_schedule_id: scheduleId,
      p_entries: entries,
      p_notes: notes
    });
    
    if (error) {
      console.error("[admin:schedule:save]", error);
      return c.json(fail("SAVE_FAILED", "Не удалось сохранить расписание", 503, rid), 503);
    }
    
    const result = data?.[0];
    if (!result || result.success === false) {
      return c.json(fail("SAVE_FAILED", result.message || "Ошибка сохранения", 500, rid), 500);
    }
    
    return c.json(ok({
      success: true,
      message: result.message,
      new_version: result.new_version,
      version_id: result.new_id
    }, rid));
  } catch (error) {
    console.error("[admin:schedule:save]", error);
    return c.json(fail("SAVE_FAILED", "Не удалось сохранить расписание", 503, rid), 503);
  }
});
}
