/**
 * Ручная проверка открытых ответов тестов (кабинет 8.39–8.42).
 *
 * Решение владельца 2026-11-07: разрешена. В очередь попадают ответы из
 * test_preparation_results, которые движок не смог оценить автоматически
 * (is_correct IS NULL при наличии ответа) — по тестам, видимым учителю
 * (свои created_by или подключённые админом teacher_visible).
 * Вердикт учителя пишется теми же полями, что и AI-проверка:
 * grading_source='manual' — студент видит его в обычном разборе.
 */
import { Hono } from "hono";
import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { canAdminister, callerRoles, requireTeachingCapability } from "../../lib/permissions";
import { createServiceClient } from "../../lib/supabase";
import { UUID, error, type TeacherEnv } from "./_shared";

const teacher = new Hono<TeacherEnv>();

const RESULT_FIELDS =
  "id,test_id,session_id,question_id,user_id,answer_text,is_correct,score,grading_status,grading_feedback,answered_at,tests(title),questions(text,answer,type),users(display_name,full_name,email)";

/** Тесты, результаты которых видны учителю. */
async function visibleTestFilter(service: any, roles: readonly string[], userId: string) {
  if (roles.includes("admin")) return null; // без фильтра по тесту
  const { data, error: readError } = await service
    .from("tests")
    .select("id")
    .or(`created_by.eq.${userId},teacher_visible.eq.true`)
    .is("archived_at", null)
    .limit(2000);
  if (readError) throw readError;
  return (data || []).map((row: any) => String(row.id));
}

async function canGradeResult(service: any, roles: readonly string[], userId: string, resultId: string) {
  const { data: row, error: readError } = await service
    .from("test_preparation_results")
    .select("id,test_id")
    .eq("id", resultId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) return { row: null, allowed: false };
  if (roles.includes("admin")) return { row, allowed: true };
  const { data: test, error: testError } = await service
    .from("tests")
    .select("id,created_by,teacher_visible")
    .eq("id", String((row as any).test_id))
    .maybeSingle();
  if (testError) throw testError;
  const allowed = Boolean(
    test &&
    (String((test as any).created_by || "") === userId || (test as any).teacher_visible === true),
  );
  return { row, allowed };
}

/** Очередь ручной проверки: ответы без автоматического вердикта. */
teacher.get("/open-answers", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  const userId = c.get("user").id;
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 50), 1), 200);
  try {
    const roles = await callerRoles(service, userId);
    const visibleIds = await visibleTestFilter(service, roles, userId);
    if (Array.isArray(visibleIds) && !visibleIds.length) {
      return c.json(ok({ items: [], total: 0 }, rid));
    }
    let query = service
      .from("test_preparation_results")
      .select(RESULT_FIELDS)
      .not("answered_at", "is", null)
      .or("is_correct.is.null,and(grading_status.in.(pending,error))")
      .order("answered_at", { ascending: false })
      .limit(limit);
    if (Array.isArray(visibleIds)) query = query.in("test_id", visibleIds as string[]);
    const { data, error: readError } = await query;
    if (readError) throw readError;
    const items = (data || []).map((row: any) => {
      const test = Array.isArray(row.tests) ? row.tests[0] : row.tests;
      const question = Array.isArray(row.questions) ? row.questions[0] : row.questions;
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        test_id: row.test_id,
        test_title: test?.title || null,
        question_text: String(question?.text || "").slice(0, 500),
        question_type: question?.type || null,
        etalon: String(question?.answer || "").slice(0, 500),
        student_answer: String(row.answer_text || "").slice(0, 2000),
        grading_status: row.grading_status || null,
        grading_feedback: row.grading_feedback || null,
        student_name: user
          ? String(user.display_name || user.full_name || user.email || "Студент")
          : "Студент",
        answered_at: row.answered_at || null,
      };
    });
    return c.json(ok({ items, total: items.length }, rid));
  } catch (queueError) {
    console.error("[teacher:grading-queue]", queueError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Очередь проверки недоступна");
  }
});

/** Вердикт учителя по одному ответу: верно/неверно + комментарий. */
teacher.post("/open-answers/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const resultId = c.req.param("id") || "";
  if (!UUID.test(resultId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const isCorrect = input?.is_correct;
  if (typeof isCorrect !== "boolean") {
    return error(c, rid, 422, "VALIDATION_ERROR", "is_correct: true или false");
  }
  const feedback = input?.feedback ? String(input.feedback).slice(0, 1000) : null;
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, c.get("user").id);
    const { row, allowed } = await canGradeResult(service, roles, c.get("user").id, resultId);
    if (!row) return error(c, rid, 404, "NOT_FOUND", "Ответ не найден");
    if (!allowed) return error(c, rid, 403, "FORBIDDEN", "Этот тест не ваш и не подключён админом");
    const now = new Date().toISOString();
    const { data, error: updateError } = await service
      .from("test_preparation_results")
      .update({
        is_correct: isCorrect,
        score: isCorrect ? 100 : 0,
        grading_status: "deterministic",
        grading_source: "manual",
        grading_confidence: 1,
        grading_feedback: feedback ?? (isCorrect ? "Зачтено преподавателем." : "Не зачтено преподавателем."),
        grading_model: null,
        graded_at: now,
      })
      .eq("id", resultId)
      .select("id,is_correct,score,grading_status,grading_feedback,graded_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Ответ не найден");
    return c.json(ok({ answer: data }, rid));
  } catch (gradeError) {
    console.error("[teacher:grade-answer]", gradeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить вердикт");
  }
});

export default teacher;
