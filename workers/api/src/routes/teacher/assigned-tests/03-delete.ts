import { ok, requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";
import { canAdminister, callerRoles, requireTeachingCapability } from "../../../lib/permissions";
import { createServiceClient } from "../../../lib/supabase";
import { UUID, error } from "../_shared";

import type { TeacherEnv } from "./types";

export function registerDeleteRoutes(teacher: TeacherEnv) {
teacher.delete("/test-assignments/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, c.get("user").id);
    let query = service.from("test_assignments").delete().eq("id", id);
    if (!canAdminister(roles)) query = query.eq("teacher_id", c.get("user").id);
    const { data, error: deleteError } = await query.select("id").maybeSingle();
    if (deleteError) throw deleteError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Назначение не найдено");
    return c.json(ok({ removed: true, id }, rid));
  } catch (deleteFailure) {
    console.error("[teacher:unassign-test]", deleteFailure);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отменить назначение");
  }
});
}
