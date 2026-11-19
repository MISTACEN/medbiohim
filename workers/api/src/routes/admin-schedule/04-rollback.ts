import { fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, isAdmin } from "./shared";

import type { AdminScheduleRouter } from "./types";

export function registerRollbackRoutes(adminSchedule: AdminScheduleRouter) {
adminSchedule.post("/schedule/rollback/:scheduleId/:targetVersion", requireAuth, async (c) => {
  const rid = requestId();
  const scheduleId = String(c.req.param("scheduleId") || "");
  const targetVersion = parseInt(String(c.req.param("targetVersion") || ""), 10);
  
  if (!UUID.test(scheduleId) || isNaN(targetVersion) || targetVersion < 1) {
    return c.json(fail("VALIDATION_ERROR", "Некорректные параметры", 422, rid), 422);
  }
  
  try {
    // Verify user has permission
    const allowed = await isAdmin(c);
    if (!allowed) {
      return c.json(fail("FORBIDDEN", "Нет прав доступа", 403, rid), 403);
    }
    
    // Откат пока не реализован: раньше эндпоинт отвечал «Расписание откатно
    // к версии N», ничего не меняя, — это ложный успех. Честно сообщаем, что
    // операция недоступна, вместо того чтобы делать вид, что она выполнена.
    return c.json(fail(
      "ROLLBACK_NOT_IMPLEMENTED",
      "Откат расписания к прежней версии ещё не реализован. Сохраните расписание заново — прежняя версия останется в истории версий.",
      501,
      rid,
    ), 501);
  } catch (error) {
    console.error("[admin:schedule:rollback]", error);
    return c.json(fail("ROLLBACK_FAILED", "Не удалось откатить расписание", 503, rid), 503);
  }
});
}
