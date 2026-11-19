import { ok, requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";
import { canAdminister, callerRoles, requireTeachingCapability } from "../../../lib/permissions";
import { createServiceClient } from "../../../lib/supabase";
import { MIN_SAMPLE_SIZE, UUID, canSeeTestResults, error } from "../_shared";

import type { TeacherEnv } from "./types";

export function registerAnalyticsRoutes(teacher: TeacherEnv) {
teacher.get("/test-assignments/:id/analytics", requireAuth, async (c) => {
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
      .select("id,test_id,group_id,teacher_id,tests(title)")
      .eq("id", assignmentId);
    if (!isAdmin) assignmentQuery = assignmentQuery.eq("teacher_id", userId);
    const { data: assignment, error: assignmentError } = await assignmentQuery.maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return error(c, rid, 404, "NOT_FOUND", "Назначение не найдено");
    const testId = String(assignment.test_id);
    const testTitle = (Array.isArray(assignment.tests) ? assignment.tests[0] : assignment.tests)?.title || null;

    // Решение владельца: аналитика — только на своих тестах или подключённых
    // админом (teacher_visible). Чужие тесты без галочки — 403.
    if (!(await canSeeTestResults(service, roles, userId, testId))) {
      return error(c, rid, 403, "FORBIDDEN", "Аналитика доступна только для своих тестов или подключённых админом");
    }

    const { data: links, error: linksError } = await service
      .from("test_questions")
      .select("order_index,question:questions(id,text)")
      .eq("test_id", testId)
      .order("order_index", { ascending: true });
    if (linksError) throw linksError;
    const questions = (links || [])
      .map((link: any) => (Array.isArray(link.question) ? link.question[0] : link.question))
      .filter(Boolean);
    if (!questions.length) {
      return c.json(ok({ test_title: testTitle, items: [] }, rid));
    }
    const questionIds = questions.map((q: any) => String(q.id));
    const { data: results, error: resultsError } = await service
      .from("test_preparation_results")
      .select("question_id,user_id,is_correct,answered_at")
      .eq("test_id", testId)
      .in("question_id", questionIds as string[])
      .not("answered_at", "is", null)
      .limit(20000);
    if (resultsError) throw resultsError;
    // Последний ответ каждого пользователя на каждый вопрос — как в банке прогресса.
    const latest = new Map<string, any>();
    for (const row of results || []) {
      const key = `${row.question_id}:${row.user_id}`;
      if (!latest.has(key)) latest.set(key, row);
    }
    const perQuestion = new Map<string, { answered: number; correct: number }>();
    for (const row of latest.values()) {
      const key = String(row.question_id);
      const entry = perQuestion.get(key) || { answered: 0, correct: 0 };
      entry.answered += 1;
      if (row.is_correct === true) entry.correct += 1;
      perQuestion.set(key, entry);
    }
    const items = questions.map((question: any, index: number) => {
      const stat = perQuestion.get(String(question.id)) || { answered: 0, correct: 0 };
      // Порог малой выборки N=5 (решение владельца): меньше — «мало данных».
      const lowSample = stat.answered < MIN_SAMPLE_SIZE;
      return {
        question_id: String(question.id),
        order: index + 1,
        text: String(question.text || "").slice(0, 300),
        answered: stat.answered,
        correct: stat.correct,
        low_sample: lowSample,
        correct_percent: stat.answered && !lowSample
          ? Math.round((stat.correct / stat.answered) * 100)
          : null,
      };
    }).sort((a: any, b: any) => (a.correct_percent ?? 101) - (b.correct_percent ?? 101));
    return c.json(ok({
      test_title: testTitle,
      items,
      unique_students: new Set([...latest.values()].map((row: any) => String(row.user_id))).size,
    }, rid));
  } catch (analyticsError) {
    console.error("[teacher:analytics]", analyticsError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Аналитика временно недоступна");
  }
});
}
