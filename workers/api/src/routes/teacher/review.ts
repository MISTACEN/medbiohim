/**
 * 8.39–8.42: ручная проверка открытых ответов тестов.
 *
 * Очередь: открытые ответы студентов (попытки назначенных тестов и сессии
 * подготовки), оставленные на ручную проверку (grading_status pending/error,
 * is_correct NULL). Преподаватель видит только ответы по своим тестам
 * (created_by) или подключённым админом (teacher_visible) и только по
 * студентам своей области; у админа — все.
 *
 * Вердикт: POST переводит ответ в grading_status='manual', проставляет
 * is_correct/score и пересчитывает балл попытки по той же формуле, что и
 * medbiohim_finish_test_attempt (score = число верных, max = снимок вопросов).
 */
import { Hono } from "hono";
import { ok, requestId } from "../../lib/response";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import { callerRoles, canAdminister, requireTeachingCapability } from "../../lib/permissions";
import { createServiceClient } from "../../lib/supabase";
import { loadTeacherScope } from "../../lib/teacher-scope";
import { error, UUID, type TeacherEnv } from "./_shared";

const review = new Hono<TeacherEnv>();

/** Тесты, доступные преподавателю для проверки: свои или подключённые админом. */
async function visibleTestIds(
  service: any,
  isAdmin: boolean,
  userId: string,
): Promise<Set<string>> {
  let query = service.from("tests").select("id,created_by,teacher_visible").is("archived_at", null).limit(2000);
  if (!isAdmin) query = query.eq("created_by", userId);
  const { data, error: readError } = await query;
  if (readError) throw readError;
  return new Set(
    (data || [])
      .filter((row: any) => isAdmin || String(row.created_by || "") === userId || row.teacher_visible === true)
      .map((row: any) => String(row.id)),
  );
}

/** Студенты области: группы + персональные назначения; у админа — не ограничиваем. */
async function scopedStudentIds(service: any, isAdmin: boolean, userId: string): Promise<Set<string> | null> {
  if (isAdmin) return null;
  const scope = await loadTeacherScope(service, userId);
  const result = new Set<string>(scope.students);
  if (scope.groups.length) {
    const { data, error: readError } = await service
      .from("group_memberships")
      .select("user_id")
      .in("group_id", scope.groups as string[]).eq("is_active", true).limit(5000);
    if (readError) throw readError;
    for (const row of data || []) result.add(String((row as any).user_id));
  }
  return result;
}

function shapeAnswer(
  kind: "attempt" | "preparation",
  row: any,
  question: any,
  user: any,
  testTitle: string | null,
) {
  return {
    kind,
    id: String(row.id),
    user_id: String(row.user_id ?? row.attempt?.user_id ?? ""),
    user_name: user ? String(user.full_name || user.display_name || user.email || "Студент") : "Студент",
    test_id: String(row.test_id ?? row.attempt?.test_id ?? ""),
    test_title: testTitle,
    question_id: String(row.question_id),
    question_text: question ? String(question.text || "").slice(0, 500) : "—",
    etalon: question ? String(question.answer || "").slice(0, 500) || null : null,
    student_answer: String(row.answer_text || "").slice(0, 2000),
    grading_status: row.grading_status || null,
    grading_feedback: row.grading_feedback || null,
    // У попыток answered_at нет — показываем graded_at (у pending он пуст).
    answered_at: row.answered_at || row.graded_at || null,
  };
}

review.get("/review/open-answers", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const userId = c.get("user").id;
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    const tests = await visibleTestIds(service, isAdmin, userId);
    if (!tests.size) return c.json(ok({ items: [], is_admin: isAdmin }, rid));
    const testIds = [...tests];
    const students = await scopedStudentIds(service, isAdmin, userId);

    // Сессии подготовки: неотвеченные эталоном открытые ответы по видимым тестам.
    const prepQuery = service
      .from("test_preparation_results")
      .select("id,user_id,test_id,question_id,answer_text,grading_status,grading_feedback,answered_at,tests(title)")
      .in("test_id", testIds as string[])
      .is("is_correct", null).not("answer_text", "is", null).not("answered_at", "is", null)
      .in("grading_status", ["pending", "error"])
      .order("answered_at", { ascending: false }).limit(200);
    // Попытки назначенных тестов: тот же фильтр, попытка должна быть завершена.
    // В test_answers нет answered_at (он же graded_at) — не фильтруем и не
    // сортируем по нему, иначе PostgREST отдаёт 42703 и очередь падает.
    const attemptQuery = service
      .from("test_answers")
      .select("id,attempt_id,question_id,answer_text,grading_status,grading_feedback,graded_at,test_attempts!inner(user_id,test_id,status,tests(title))")
      .in("test_attempts.test_id", testIds as string[])
      .is("is_correct", null).not("answer_text", "is", null)
      .in("grading_status", ["pending", "error"])
      // enum attempt_status: abandoned|in_progress|submitted — 'completed' нет.
      .eq("test_attempts.status", "submitted")
      .limit(200);

    const [prepRes, attemptRes] = await Promise.all([prepQuery, attemptQuery]);
    if (prepRes.error) throw prepRes.error;
    if (attemptRes.error) throw attemptRes.error;

    type QueueRow = { kind: "attempt" | "preparation"; row: any; userId: string; testId: string; title: string | null };
    const queue: QueueRow[] = [];
    for (const row of prepRes.data || []) {
      const attempt = Array.isArray(row.tests) ? row.tests[0] : row.tests;
      queue.push({
        kind: "preparation",
        row,
        userId: String(row.user_id),
        testId: String(row.test_id),
        title: attempt?.title ?? null,
      });
    }
    for (const row of attemptRes.data || []) {
      const attempt = Array.isArray(row.test_attempts) ? row.test_attempts[0] : row.test_attempts;
      if (!attempt) continue;
      queue.push({
        kind: "attempt",
        row,
        userId: String(attempt.user_id),
        testId: String(attempt.test_id),
        title: attempt.tests ? (Array.isArray(attempt.tests) ? (attempt.tests[0] as any)?.title ?? null : (attempt.tests as any).title ?? null) : null,
      });
    }

    const inScope = queue.filter((item) => !students || students.has(item.userId));
    if (!inScope.length) return c.json(ok({ items: [], is_admin: isAdmin }, rid));

    const questionIds = [...new Set(inScope.map((item) => String(item.row.question_id)))];
    const userIds = [...new Set(inScope.map((item) => item.userId))];
    const [questionsRes, peopleRes] = await Promise.all([
      service.from("questions").select("id,text,answer").in("id", questionIds as string[]).limit(1000),
      service.from("users").select("id,full_name,display_name,email").in("id", userIds as string[]).limit(1000),
    ]);
    if (questionsRes.error) throw questionsRes.error;
    if (peopleRes.error) throw peopleRes.error;
    const questions = new Map((questionsRes.data || []).map((row: any) => [String(row.id), row]));
    const people = new Map((peopleRes.data || []).map((row: any) => [String(row.id), row]));

    const items = inScope
      .sort((a, b) => String(b.row.answered_at || "").localeCompare(String(a.row.answered_at || "")))
      .slice(0, 200)
      .map((item) =>
        shapeAnswer(item.kind, item.row, questions.get(String(item.row.question_id)), people.get(item.userId), item.title),
      );
    return c.json(ok({ items, is_admin: isAdmin }, rid));
  } catch (queueError) {
    console.error("[teacher:review-queue]", queueError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Очередь проверки недоступна");
  }
});

review.post("/review/open-answers", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const userId = c.get("user").id;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const kind = String(input?.kind || "");
  const answerId = String(input?.id || "");
  const isCorrect = input?.is_correct;
  const feedback = input?.feedback == null ? "" : String(input.feedback).slice(0, 500);
  if (kind !== "attempt" && kind !== "preparation") {
    return error(c, rid, 422, "VALIDATION_ERROR", "kind: attempt или preparation");
  }
  if (!UUID.test(answerId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID ответа");
  if (typeof isCorrect !== "boolean") return error(c, rid, 422, "VALIDATION_ERROR", "Нужен вердикт is_correct: true/false");

  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);

    // Тянем ответ вместе с тестом и студентом, чтобы проверить права до записи.
    type Loaded = { id: string; userId: string; testId: string; table: string };
    let loaded: Loaded | null = null;
    if (kind === "preparation") {
      const { data, error: readError } = await service
        .from("test_preparation_results")
        .select("id,user_id,test_id")
        .eq("id", answerId).maybeSingle();
      if (readError) throw readError;
      if (data) loaded = { id: String(data.id), userId: String(data.user_id), testId: String(data.test_id), table: "test_preparation_results" };
    } else {
      const { data, error: readError } = await service
        .from("test_answers")
        .select("id,attempt_id,test_attempts!inner(user_id,test_id)")
        .eq("id", answerId).maybeSingle();
      if (readError) throw readError;
      const attempt = data ? (Array.isArray((data as any).test_attempts) ? (data as any).test_attempts[0] : (data as any).test_attempts) : null;
      if (data && attempt) {
        loaded = { id: String(data.id), userId: String(attempt.user_id), testId: String(attempt.test_id), table: "test_answers" };
      }
    }
    if (!loaded) return error(c, rid, 404, "NOT_FOUND", "Ответ не найден");

    const tests = await visibleTestIds(service, isAdmin, userId);
    if (!tests.has(loaded.testId)) {
      return error(c, rid, 403, "FORBIDDEN", "Этот тест не ваш и не подключён админом");
    }
    const students = await scopedStudentIds(service, isAdmin, userId);
    if (students && !students.has(loaded.userId)) {
      return error(c, rid, 403, "FORBIDDEN", "Студент вне вашей области");
    }

    const { data: updated, error: updateError } = await service
      .from(loaded.table)
      .update({
        is_correct: isCorrect,
        score: isCorrect ? 100 : 0,
        grading_status: "manual",
        grading_source: "manual",
        grading_confidence: 1,
        grading_feedback: feedback || (isCorrect ? "Зачтено преподавателем." : "Не зачтено преподавателем."),
        grading_model: null,
        graded_at: new Date().toISOString(),
      })
      .eq("id", answerId)
      .select("id,question_id,is_correct,score,grading_status,grading_feedback,graded_at")
      .maybeSingle();
    if (updateError) {
      console.error("[teacher:review-apply]", updateError.code, updateError.message);
      return error(c, rid, 503, "DB_REVIEW", "Вердикт не сохранился");
    }
    if (!updated) return error(c, rid, 404, "NOT_FOUND", "Ответ не найден");

    // Попытка: пересчитываем балл той же формулой, что и finish-RPC.
    let attempt: { id: string; score: number; max_score: number; percent: number } | null = null;
    if (kind === "attempt") {
      const { data: answerRow, error: answerError } = await service
        .from("test_answers").select("attempt_id").eq("id", answerId).maybeSingle();
      if (answerError) throw answerError;
      const attemptId = answerRow ? String((answerRow as any).attempt_id) : "";
      if (attemptId && UUID.test(attemptId)) {
        const { data: attemptRow, error: attemptError } = await service
          .from("test_attempts").select("id,question_snapshot").eq("id", attemptId).maybeSingle();
        if (attemptError) throw attemptError;
        if (attemptRow) {
          const snapshot = Array.isArray((attemptRow as any).question_snapshot) ? (attemptRow as any).question_snapshot : [];
          const { count: scoreCount, error: scoreError } = await service
            .from("test_answers").select("id", { count: "exact", head: true })
            .eq("attempt_id", attemptId).eq("is_correct", true);
          if (scoreError) throw scoreError;
          const maxScore = snapshot.length;
          const score = Number(scoreCount || 0);
          const percent = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
          const { error: recalcError } = await service
            .from("test_attempts")
            .update({ score, max_score: maxScore, percent })
            .eq("id", attemptId);
          if (recalcError) throw recalcError;
          attempt = { id: attemptId, score, max_score: maxScore, percent };
        }
      }
    }

    return c.json(ok({ answer: updated, attempt }, rid), 200);
  } catch (verdictError) {
    console.error("[teacher:review]", verdictError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить вердикт");
  }
});

export default review;
