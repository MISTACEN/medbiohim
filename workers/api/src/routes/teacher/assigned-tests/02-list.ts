import { ok, requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";
import { canAdminister, callerRoles, requireTeachingCapability } from "../../../lib/permissions";
import { createServiceClient } from "../../../lib/supabase";
import { error, uniqueIds, visibleResultTestIds } from "../_shared";

import type { TeacherEnv } from "./types";

export function registerListRoutes(teacher: TeacherEnv) {
teacher.get("/test-assignments", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  const userId = c.get("user").id;
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    let query = service
      .from("test_assignments")
      .select("id,test_id,teacher_id,group_id,due_at,time_limit_sec,max_attempts,question_count,instructions,created_at,tests(title),groups(name,code),test_assignment_students(student_id)")
      .order("created_at", { ascending: false }).limit(200);
    if (!isAdmin) query = query.eq("teacher_id", userId);
    const { data, error: readError } = await query;
    if (readError) throw readError;
    const rows = (data || []) as any[];
    const testIds = uniqueIds(rows.map((row) => row.test_id));
    const groupIds = uniqueIds(rows.map((row) => row.group_id));
    const [attempts, members] = await Promise.all([
      testIds.length
        ? service.from("test_attempts")
            .select("test_id,group_id,user_id,percent,status,finished_at")
            .in("test_id", testIds as string[]).order("finished_at", { ascending: false }).limit(5000)
        : Promise.resolve({ data: [], error: null }),
      groupIds.length
        ? service.from("group_memberships")
            .select("group_id,user_id").in("group_id", groupIds as string[])
            .eq("is_active", true).limit(5000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (attempts.error) throw attempts.error;
    if (members.error) throw members.error;
    const attemptRows = (attempts.data || []) as any[];
    // Видимость результатов по тестам (директива владельца 2026-11-08): только свои.
    const visibleTests = await visibleResultTestIds(service, roles, userId, testIds);
    const membersByGroup = new Map<string, Set<string>>();
    for (const row of (members.data || []) as any[]) {
      const key = String(row.group_id);
      if (!membersByGroup.has(key)) membersByGroup.set(key, new Set());
      membersByGroup.get(key)!.add(String(row.user_id));
    }
    const items = rows.map((row) => {
      const targets = new Set<string>(
        (row.test_assignment_students || []).map((s: any) => String(s.student_id)),
      );
      if (row.group_id) {
        const group = membersByGroup.get(String(row.group_id));
        if (group) for (const member of group) targets.add(member);
      }
      const relevant = attemptRows.filter((a) =>
        String(a.test_id) === String(row.test_id) && targets.has(String(a.user_id)),
      );
      const finished = relevant.filter((a) => a.finished_at);
      const percents = finished
        .map((a) => Number(a.percent))
        .filter((value) => Number.isFinite(value));
      return {
        id: row.id,
        test_id: row.test_id,
        test_title: (Array.isArray(row.tests) ? row.tests[0] : row.tests)?.title || null,
        group_id: row.group_id,
        group_name: (Array.isArray(row.groups) ? row.groups[0] : row.groups)?.name || null,
        individual: !row.group_id,
        analytics_allowed: visibleTests.has(String(row.test_id)),
        students_targeted: targets.size,
        due_at: row.due_at,
        time_limit_sec: row.time_limit_sec,
        max_attempts: row.max_attempts,
        question_count: row.question_count,
        instructions: row.instructions,
        created_at: row.created_at,
        completed: finished.length,
        pending: Math.max(0, targets.size - finished.length),
        avg_percent: percents.length
          ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
          : null,
      };
    });
    return c.json(ok({ items, total: items.length, is_admin: isAdmin }, rid));
  } catch (readError) {
    console.error("[teacher:test-assignments]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Назначения тестов недоступны");
  }
});
}
