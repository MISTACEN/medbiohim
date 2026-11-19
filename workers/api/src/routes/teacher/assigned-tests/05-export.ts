import { requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";
import { canAdminister, callerRoles, requireTeachingCapability } from "../../../lib/permissions";
import { createServiceClient } from "../../../lib/supabase";
import { UUID, canSeeTestResults, error } from "../_shared";

import type { TeacherEnv } from "./types";

export function registerExportRoutes(teacher: TeacherEnv) {
teacher.get("/test-assignments/:id/export", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const assignmentId = c.req.param("id") || "";
  if (!UUID.test(assignmentId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const userId = c.get("user").id;
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    let assignmentQuery = service
      .from("test_assignments")
      .select("id,test_id,group_id,teacher_id,tests(title),groups(name,code),test_assignment_students(student_id)")
      .eq("id", assignmentId);
    if (!isAdmin) assignmentQuery = assignmentQuery.eq("teacher_id", userId);
    const { data: assignment, error: assignmentError } = await assignmentQuery.maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return error(c, rid, 404, "NOT_FOUND", "Назначение не найдено");
    const testId = String(assignment.test_id);

    // Экспорт — уровень 4: тоже только свои/подключённые тесты.
    if (!(await canSeeTestResults(service, roles, userId, testId))) {
      return error(c, rid, 403, "FORBIDDEN", "Ведомость доступна только для своих тестов или подключённых админом");
    }

    // Целевая аудитория: группа или персональный список.
    const targets = new Map<string, string>();
    const group = Array.isArray(assignment.groups) ? assignment.groups[0] : assignment.groups;
    const groupName = group ? String(group.name || group.code || "") : "";
    if (assignment.group_id) {
      const { data: members, error: membersError } = await service
        .from("group_memberships")
        .select("user_id").eq("group_id", assignment.group_id).eq("is_active", true).limit(2000);
      if (membersError) throw membersError;
      for (const row of members || []) targets.set(String((row as any).user_id), groupName);
    }
    for (const link of assignment.test_assignment_students || []) {
      targets.set(String((link as any).student_id), groupName || "персонально");
    }
    if (!targets.size) return error(c, rid, 404, "NOT_FOUND", "У назначения нет получателей");
    const studentIds = [...targets.keys()];
    const { data: people, error: peopleError } = await service
      .from("users").select("id,full_name,display_name,email").in("id", studentIds as string[]).limit(2000);
    if (peopleError) throw peopleError;
    const names = new Map<string, string>();
    for (const person of people || []) {
      names.set(String(person.id), String(person.display_name || person.full_name || person.email || "Студент"));
    }
    const { data: attempts, error: attemptsError } = await service
      .from("test_attempts")
      .select("user_id,percent,status,finished_at")
      .eq("test_id", testId).in("user_id", studentIds as string[])
      .order("finished_at", { ascending: false }).limit(20000);
    if (attemptsError) throw attemptsError;
    const perStudent = new Map<string, { attempts: number; best: number | null; last: string | null }>();
    for (const row of attempts || []) {
      const studentId = String((row as any).user_id);
      const entry = perStudent.get(studentId) || { attempts: 0, best: null, last: null };
      entry.attempts += 1;
      const percent = Number((row as any).percent);
      if (Number.isFinite(percent) && (entry.best == null || percent > entry.best)) entry.best = percent;
      if ((row as any).finished_at && !entry.last) entry.last = String((row as any).finished_at);
      perStudent.set(studentId, entry);
    }
    // Директива владельца 2026-11-08: «подготовка» (проверка сразу) не считается,
    // главный результат — полное тестирование (solve/exam/control). Полные
    // тестирования из движка подготовки попадают в ведомость наравне с попытками.
    const { data: fullPrep, error: fullPrepError } = await service
      .from("test_preparation_results")
      .select("user_id,is_correct,answered_at,session_id,test_preparation_sessions!inner(experience)")
      .eq("test_id", testId).in("user_id", studentIds as string[])
      .in("test_preparation_sessions.experience", ["solve", "exam", "control"])
      .not("answered_at", "is", null).limit(20000);
    if (fullPrepError) throw fullPrepError;
    const prepBySession = new Map<string, Map<string, { correct: number; total: number; user: string; last: string | null }>>();
    for (const row of fullPrep || []) {
      const sessionId = String((row as any).session_id);
      const bucket = prepBySession.get(sessionId) || new Map();
      prepBySession.set(sessionId, bucket);
      const questionKey = String((row as any).question_id);
      const entry = bucket.get(questionKey) || { correct: 0, total: 0, user: String((row as any).user_id), last: null as string | null };
      entry.total += 1;
      if ((row as any).is_correct === true) entry.correct += 1;
      const answered = String((row as any).answered_at || "");
      if (answered && (!entry.last || answered > entry.last)) entry.last = answered;
      bucket.set(questionKey, entry);
    }
    for (const bucket of prepBySession.values()) {
      let correct = 0;
      let total = 0;
      let last: string | null = null;
      let user = "";
      for (const q of bucket.values()) {
        user = q.user;
        correct += q.correct;
        total += 1;
        if (q.last && (!last || q.last > last)) last = q.last;
      }
      if (!user || total === 0) continue;
      const percent = Math.round((correct / total) * 100);
      const entry = perStudent.get(user) || { attempts: 0, best: null, last: null };
      entry.attempts += 1;
      if (entry.best == null || percent > entry.best) entry.best = percent;
      if (last && (!entry.last || last > entry.last)) entry.last = last;
      perStudent.set(user, entry);
    }
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = ["ФИО;Группа;Попыток;Лучший результат %;Последняя сдача"];
    for (const studentId of studentIds) {
      const stat = perStudent.get(studentId);
      lines.push([
        escape(names.get(studentId) || studentId),
        escape(targets.get(studentId) || ""),
        String(stat?.attempts || 0),
        stat?.best != null ? String(stat.best) : "—",
        stat?.last ? new Date(stat.last).toLocaleString("ru-RU") : "—",
      ].join(";"));
    }
    // Водяной знак (Блок 8): кто и когда выгрузил ведомость — первая строка CSV.
    const downloader = (await service.from("users").select("full_name,display_name,email").eq("id", userId).maybeSingle()).data as any;
    const who = downloader ? String(downloader.full_name || downloader.display_name || downloader.email || userId) : userId;
    const watermark = escape(`Выгрузил: ${who} · ${new Date().toLocaleString("ru-RU")} · MEDBIOHIM`);
    lines.unshift(watermark);
    const csv = "\uFEFF" + lines.join("\r\n");
    const testTitle = (Array.isArray(assignment.tests) ? assignment.tests[0] : assignment.tests)?.title || "vedomost";
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vedomost-${String(testTitle).slice(0, 40).replace(/[^a-zA-Zа-яА-Я0-9-_/]/g, "")}.csv"`,
        "x-request-id": rid,
      },
    });
  } catch (exportError) {
    console.error("[teacher:export]", exportError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Экспорт временно недоступен");
  }
});
}
