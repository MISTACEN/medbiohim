import { ok, requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";
import { canAdminister, callerRoles, requireTeachingCapability } from "../../../lib/permissions";
import { loadTeacherScope } from "../../../lib/teacher-scope";
import { createServiceClient } from "../../../lib/supabase";
import { UUID, error, uniqueIds } from "../_shared";

import type { TeacherEnv } from "./types";

export function registerCreateRoutes(teacher: TeacherEnv) {
teacher.post("/test-assignments", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const userId = c.get("user").id;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const testId = String(input?.test_id || "");
  const groupIds = uniqueIds(Array.isArray(input?.group_ids) ? input.group_ids : []);
  const studentIds = uniqueIds(Array.isArray(input?.student_ids) ? input.student_ids : []);
  const instructions = input?.instructions ? String(input.instructions).slice(0, 1000) : null;
  const dueAt = input?.due_at ? String(input.due_at) : null;
  const timeLimitSec = input?.time_limit_sec != null ? Number(input.time_limit_sec) : null;
  const maxAttempts = input?.max_attempts != null ? Number(input.max_attempts) : null;
  const questionCount = input?.question_count != null ? Number(input.question_count) : null;
  const topicIds = Array.isArray(input?.topic_ids)
    ? uniqueIds(input.topic_ids).slice(0, 20)
    : null;
  if (!UUID.test(testId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный test_id");
  if (!groupIds.length && !studentIds.length) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Нужна хотя бы одна группа или студент");
  }
  if (dueAt && !Number.isFinite(Date.parse(dueAt))) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный дедлайн");
  }
  for (const [value, label] of [[maxAttempts, "max_attempts"], [questionCount, "question_count"]] as const) {
    if (value != null && (!Number.isInteger(value) || value < 1 || value > 500)) {
      return error(c, rid, 422, "VALIDATION_ERROR", `${label}: целое 1..500`);
    }
  }
  if (timeLimitSec != null && (!Number.isInteger(timeLimitSec) || timeLimitSec < 30 || timeLimitSec > 24 * 3600)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "time_limit_sec: от 30 секунд до суток");
  }
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data: test, error: testError } = await service
      .from("tests").select("id,title,is_published,archived_at,created_by")
      .eq("id", testId).is("archived_at", null).maybeSingle();
    if (testError) throw testError;
    if (!test || test.is_published !== true) {
      return error(c, rid, 404, "NOT_FOUND", "Тест не найден или не опубликован");
    }
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    const scope = await loadTeacherScope(service, userId);
    if (!isAdmin) {
      // Директива владельца 2026-11-08: назначать можно только свои тесты.
      if (String((test as any).created_by || "") !== userId) {
        return error(c, rid, 403, "FORBIDDEN", "Назначать можно только свои тесты");
      }
      const outsideGroups = groupIds.filter((id) => !scope.groups.includes(id));
      if (outsideGroups.length) {
        return error(c, rid, 403, "FORBIDDEN", "Часть групп не входит в вашу область");
      }
      if (studentIds.length) {
        const { data: members, error: membersError } = await service
          .from("group_memberships")
          .select("user_id")
          .in("group_id", scope.groups as string[]).eq("is_active", true).limit(5000);
        if (membersError) throw membersError;
        const known = new Set<string>(scope.students);
        for (const row of members || []) known.add(String((row as any).user_id));
        const outsideStudents = studentIds.filter((id) => !known.has(id));
        if (outsideStudents.length) {
          return error(c, rid, 403, "FORBIDDEN", "Часть студентов не входит в вашу область");
        }
      }
    }
    const created: any[] = [];
    for (const groupId of groupIds) {
      const { data, error: insertError } = await service
        .from("test_assignments")
        .insert({
          test_id: testId,
          teacher_id: userId,
          group_id: groupId,
          due_at: dueAt,
          time_limit_sec: timeLimitSec,
          max_attempts: maxAttempts,
          question_count: questionCount,
          topic_ids: topicIds && topicIds.length ? topicIds : null,
          instructions,
          created_by: userId,
        })
        .select("id,test_id,group_id,due_at,max_attempts,question_count")
        .maybeSingle();
      if (insertError) throw insertError;
      created.push(data);
    }
    if (studentIds.length) {
      const { data: personal, error: personalError } = await service
        .from("test_assignments")
        .insert({
          test_id: testId,
          teacher_id: userId,
          group_id: null,
          due_at: dueAt,
          time_limit_sec: timeLimitSec,
          max_attempts: maxAttempts,
          question_count: questionCount,
          topic_ids: topicIds && topicIds.length ? topicIds : null,
          instructions,
          created_by: userId,
        })
        .select("id,test_id,group_id,due_at,max_attempts,question_count")
        .maybeSingle();
      if (personalError) throw personalError;
      if (!personal) return error(c, rid, 503, "DB_ERROR", "Назначение не сохранилось");
      created.push(personal);
      const studentRows = studentIds.map((studentId) => ({
        assignment_id: String(personal.id),
        student_id: studentId,
      }));
      const { error: studentsError } = await service
        .from("test_assignment_students").insert(studentRows);
      if (studentsError) throw studentsError;
    }
    return c.json(ok({ assignments: created, test_title: test.title }, rid), 201);
  } catch (assignError) {
    console.error("[teacher:assign-test]", assignError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать назначение");
  }
});
}
