import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { resolveGroupByCohort } from "../../lib/cohort-resolver";
import { canResolveCohort } from "./shared";

import type { AdminScheduleRouter } from "./types";

export function registerResolveRoutes(adminSchedule: AdminScheduleRouter) {
adminSchedule.get("/schedule/resolve-group", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!(await canResolveCohort(c))) {
    return c.json(fail("FORBIDDEN", "Резолвер доступен staff и старостам", 403, rid), 403);
  }
  const label = String(c.req.query("label") || "").trim();
  if (!label || label.length > 120) {
    return c.json(fail("VALIDATION_ERROR", "Нужен label — название файла или группы (до 120 символов)", 422, rid), 422);
  }
  try {
    const { data: groups, error } = await db
      .from("groups")
      .select("id,code,name,admission_year,stream,course_number,is_active")
      .limit(500);
    if (error) {
      console.error("[admin:schedule:resolve-group]", error);
      return c.json(fail("DB_UNAVAILABLE", "Список групп недоступен", 503, rid), 503);
    }
    const resolution = resolveGroupByCohort(label, groups || []);
    // Ничего не выдумываем: пустой результат — это reason, UI покажет честно.
    return c.json(ok({
      computed: resolution.computed,
      match: resolution.match,
      candidates: resolution.candidates,
      reason: resolution.reason,
    }, rid));
  } catch (err) {
    console.error("[admin:schedule:resolve-group]", err);
    return c.json(fail("RESOLVE_FAILED", "Не удалось распознать группу", 503, rid), 503);
  }
});
}
