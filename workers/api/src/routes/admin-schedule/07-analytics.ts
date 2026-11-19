import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, isAdmin } from "./shared";

import type { AdminScheduleRouter } from "./types";

export function registerAnalyticsRoutes(adminSchedule: AdminScheduleRouter) {
adminSchedule.get("/schedule/analytics/:scheduleId", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const scheduleId = String(c.req.param("scheduleId") || "");

  // Аналитика расписания — служебная информация администратора.
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Аналитику расписания видит только администратор", 403, rid), 403);
  }

  if (!UUID.test(scheduleId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID расписания", 422, rid), 422);
  }
  
  try {
    // PostgREST does not expose GROUP BY through supabase-js, so aggregate the
    // rows for this schedule in the Worker instead of calling a missing method.
    // У schedule_entries нет колонок status/teacher_id: статус выводим из
    // is_cancelled/event_kind, преподавателя берём из текстовой колонки teacher.
    const { data: entries, error } = await db
      .from("schedule_entries")
      .select("id,subject_id,teacher,is_cancelled,event_kind")
      .eq("schedule_id", scheduleId);

    if (error) throw error;

    const statusCounts: Record<string, number> = {};
    const subjects = new Set<string>();
    const teachers = new Map<string, number>();
    for (const entry of entries || []) {
      const raw = entry as any;
      const status = raw.is_cancelled === true ? "cancelled" : String(raw.event_kind || "scheduled");
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const subjectId = String(raw.subject_id || "");
      if (subjectId) subjects.add(subjectId);
      const teacher = String(raw.teacher || "").trim();
      if (teacher) teachers.set(teacher, (teachers.get(teacher) || 0) + 1);
    }

    return c.json(ok({
      status_counts: statusCounts,
      total_unique_subjects: subjects.size,
      teacher_distribution: [...teachers.entries()].map(([teacher_id, count]) => ({ teacher_id, count })),
      total_entries: (entries || []).length
    }, rid));
  } catch (error) {
    console.error("[admin:schedule:analytics]", error);
    return c.json(fail("ANALYTICS_UNAVAILABLE", "Аналитика недоступна", 503, rid), 503);
  }
});
}
