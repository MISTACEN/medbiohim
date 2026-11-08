/**
 * Студенты области: ростер и карточка с историей попыток.
 * Выделено из монолита routes/teacher.ts — один домен, один файл.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import {
  canAdminister,
  callerRoles,
  requireAdmin,
  requireTeachingCapability,
} from "../../lib/permissions";
import { describeScope, loadTeacherScope, loadTeacherSubjectIds } from "../../lib/teacher-scope";
import { createServiceClient } from "../../lib/supabase";
import {
  ASSIGNMENT_ROLES,
  UUID,
  error,
  scopedHomeworks,
  scopedSubmissions,
  studentDirectory,
  teacherSubjects,
  uniqueIds,
  type TeacherEnv,
} from "./_shared";

const teacher = new Hono<TeacherEnv>();

/** Ростер студентов области: ФИО, группа, попытки и средний процент по тестам автора. */
teacher.get("/students", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const userId = c.get("user").id;
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    const scope = await loadTeacherScope(service, userId);
    const groupsQuery = scope.groups.length
      ? await service.from("group_memberships")
          .select("user_id,group_id,groups(name,code)")
          .in("group_id", scope.groups as string[]).eq("is_active", true).limit(5000)
      : { data: [], error: null };
    if (groupsQuery.error) throw groupsQuery.error;
    const rows = (groupsQuery.data || []) as any[];
    const roster = new Map<string, { id: string; name: string; group: string | null; group_id: string }>();
    for (const row of rows) {
      const studentId = String(row.user_id);
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      if (!roster.has(studentId)) {
        roster.set(studentId, {
          id: studentId,
          name: "Студент",
          group: group ? String(group.name || group.code || "") : null,
          group_id: String(row.group_id),
        });
      }
    }
    // Персонально назначенные студенты тоже входят в ростер.
    for (const studentId of scope.students) {
      if (!roster.has(studentId)) {
        roster.set(studentId, { id: studentId, name: "Студент", group: null, group_id: "" });
      }
    }
    const ids = [...roster.keys()];
    if (!ids.length) return c.json(ok({ items: [], is_admin: isAdmin }, rid));
    const { data: people, error: peopleError } = await service
      .from("users").select("id,full_name,display_name,email").in("id", ids as string[]).limit(1000);
    if (peopleError) throw peopleError;
    for (const person of people || []) {
      const entry = roster.get(String(person.id));
      if (entry) {
        entry.name = String(person.display_name || person.full_name || person.email || "Студент");
      }
    }
    // Попытки по тестам автора (или все — у администратора).
    let testsQuery = service.from("tests").select("id").is("archived_at", null).limit(2000);
    if (!isAdmin) testsQuery = testsQuery.eq("created_by", userId);
    const { data: ownTests, error: ownTestsError } = await testsQuery;
    if (ownTestsError) throw ownTestsError;
    const ownTestIds = (ownTests || []).map((row: any) => String(row.id));
    const stats = new Map<string, { attempts: number; finished: number; percentSum: number; percentCount: number }>();
    if (ownTestIds.length) {
      const { data: attempts, error: attemptsError } = await service
        .from("test_attempts")
        .select("user_id,test_id,percent,finished_at")
        .in("test_id", ownTestIds as string[]).limit(5000);
      if (attemptsError) throw attemptsError;
      for (const attempt of attempts || []) {
        const studentId = String((attempt as any).user_id);
        if (!roster.has(studentId)) continue;
        const entry = stats.get(studentId) || { attempts: 0, finished: 0, percentSum: 0, percentCount: 0 };
        entry.attempts += 1;
        const percent = Number((attempt as any).percent);
        if ((attempt as any).finished_at && Number.isFinite(percent)) {
          entry.finished += 1;
          entry.percentSum += percent;
          entry.percentCount += 1;
        }
        stats.set(studentId, entry);
      }
    }
    const items = [...roster.values()].map((entry) => {
      const stat = stats.get(entry.id);
      return {
        ...entry,
        attempts: stat?.attempts || 0,
        finished: stat?.finished || 0,
        avg_percent: stat && stat.percentCount
          ? Math.round(stat.percentSum / stat.percentCount)
          : null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return c.json(ok({ items, total: items.length, is_admin: isAdmin }, rid));
  } catch (rosterError) {
    console.error("[teacher:students]", rosterError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Список студентов недоступен");
  }
});

/** Карточка студента: попытки по тестам преподавателя (кабинет 8.25–8.31). */
teacher.get("/students/:id/attempts", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const userId = c.get("user").id;
  const studentId = c.req.param("id") || "";
  if (!UUID.test(studentId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный студент");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    if (!isAdmin) {
      const scope = await loadTeacherScope(service, userId);
      const { data: membership, error: membershipError } = await service
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", studentId).in("group_id", scope.groups as string[])
        .eq("is_active", true).limit(1);
      if (membershipError) throw membershipError;
      const inScope = Boolean(membership?.length) || scope.students.includes(studentId);
      if (!inScope) {
        return error(c, rid, 403, "FORBIDDEN", "Студент вне вашей области");
      }
    }
    let testsQuery = service.from("tests")
      .select("id,created_by")
      .is("archived_at", null).limit(2000);
    if (!isAdmin) testsQuery = testsQuery.eq("created_by", userId);
    const { data: ownTests, error: ownTestsError } = await testsQuery;
    if (ownTestsError) throw ownTestsError;
    // Директива владельца 2026-11-08: результаты — только по своим тестам.
    const ownTestIds = (ownTests || [])
      .filter((row: any) => isAdmin || String(row.created_by || "") === userId)
      .map((row: any) => String(row.id));
    if (!ownTestIds.length) return c.json(ok({ items: [], student_id: studentId, detail_level: 4 }, rid));
    // Максимум из уровней детализации по назначениям преподавателя, накрывающим
    // группы студента; у админа — полный уровень.
    let detailLevel = 4;
    if (!isAdmin) {
      const scope = await loadTeacherScope(service, userId);
      const { data: studentGroups, error: studentGroupsError } = await service
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", studentId).eq("is_active", true).limit(50);
      if (studentGroupsError) throw studentGroupsError;
      const coveringGroupIds = (studentGroups || [])
        .map((row: any) => String(row.group_id))
        .filter((groupId: string) => scope.groups.includes(groupId));
      if (coveringGroupIds.length) {
        const { data: assignments, error: assignmentsError } = await service
          .from("teacher_assignments")
          .select("detail_level")
          .eq("teacher_id", userId)
          .in("group_id", coveringGroupIds as string[])
          .limit(100);
        if (assignmentsError) throw assignmentsError;
        const levels = (assignments || []).map((row: any) => Number(row.detail_level) || 4);
        detailLevel = levels.length ? Math.max(...levels) : 4;
      }
    }
    const { data: attempts, error: attemptsError } = await service
      .from("test_attempts")
      .select("id,test_id,user_id,percent,status,score,max_score,started_at,finished_at,tests(title)")
      .in("test_id", ownTestIds as string[]).eq("user_id", studentId)
      .order("started_at", { ascending: false }).limit(200);
    if (attemptsError) throw attemptsError;
    const items = (attempts || []).map((row: any) => {
      const test = Array.isArray(row.tests) ? row.tests[0] : row.tests;
      return {
        id: row.id,
        test_title: test?.title || null,
        percent: Number.isFinite(Number(row.percent)) ? Number(row.percent) : null,
        score: row.score ?? null,
        max_score: row.max_score ?? null,
        status: row.status || null,
        started_at: row.started_at || null,
        finished_at: row.finished_at || null,
      };
    });
    return c.json(ok({ items, student_id: studentId, detail_level: detailLevel }, rid));
  } catch (cardError) {
    console.error("[teacher:student-card]", cardError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Карточка студента недоступна");
  }
});

export default teacher;

/**
 * По-вопросный разбор попытки (кабинет 8.31): ответы студента по конкретному
 * тесту из test_preparation_results — студент отвечал через «Начать»,
 * результаты уже лежат там. Эталоны и ответы выдаются согласно уровню
 * детализации (detail_level 1–4), который назначил администратор.
 */
teacher.get("/students/:id/test/:testId/answers", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const userId = c.get("user").id;
  const studentId = c.req.param("id") || "";
  const testId = c.req.param("testId") || "";
  if (!UUID.test(studentId) || !UUID.test(testId)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректные идентификаторы");
  }
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    // Тест должен быть виден учителю: свой или подключённый админом.
    const { data: test, error: testError } = await service
      .from("tests")
      .select("id,created_by,title")
      .eq("id", testId).maybeSingle();
    if (testError) throw testError;
    if (!test) return error(c, rid, 404, "NOT_FOUND", "Тест не найден");
    if (!isAdmin) {
      const ownsTest = String((test as any).created_by || "") === userId;
      if (!ownsTest) {
        return error(c, rid, 403, "FORBIDDEN", "Разбор доступен только по вашим тестам");
      }
      const scope = await loadTeacherScope(service, userId);
      const { data: membership, error: membershipError } = await service
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", studentId).in("group_id", scope.groups as string[])
        .eq("is_active", true).limit(1);
      if (membershipError) throw membershipError;
      const inScope = Boolean(membership?.length) || scope.students.includes(studentId);
      if (!inScope) return error(c, rid, 403, "FORBIDDEN", "Студент вне вашей области");
    }

    // Уровень детализации: максимум по назначениям, накрывающим группы студента.
    let detailLevel = 4;
    if (!isAdmin) {
      const scope = await loadTeacherScope(service, userId);
      const { data: studentGroups, error: studentGroupsError } = await service
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", studentId).eq("is_active", true).limit(50);
      if (studentGroupsError) throw studentGroupsError;
      const coveringGroupIds = (studentGroups || [])
        .map((row: any) => String(row.group_id))
        .filter((groupId: string) => scope.groups.includes(groupId));
      if (coveringGroupIds.length) {
        const { data: assignments, error: assignmentsError } = await service
          .from("teacher_assignments")
          .select("detail_level")
          .eq("teacher_id", userId)
          .in("group_id", coveringGroupIds as string[])
          .limit(100);
        if (assignmentsError) throw assignmentsError;
        const levels = (assignments || []).map((row: any) => Number(row.detail_level) || 4);
        detailLevel = levels.length ? Math.max(...levels) : 4;
      }
    }

    const { data: answers, error: answersError } = await service
      .from("test_preparation_results")
      .select("question_id,answer_text,is_correct,score,grading_status,grading_source,grading_feedback,answered_at")
      .eq("user_id", studentId).eq("test_id", testId)
      .not("answered_at", "is", null)
      .order("answered_at", { ascending: true })
      .limit(1000);
    if (answersError) throw answersError;
    const rows = (answers || []) as any[];
    // 8.31: ответы из попыток назначенных тестов (test_answers) — раньше разбор
    // видел только сессии подготовки, и попытки назначений выпадали из разбора.
    const { data: attemptAnswers, error: attemptAnswersError } = await service
      .from("test_answers")
      .select("question_id,answer_text,is_correct,score,grading_status,grading_source,grading_feedback,graded_at,test_attempts!inner(user_id,test_id,status)")
      .eq("test_attempts.user_id", studentId)
      .eq("test_attempts.test_id", testId)
      .eq("test_attempts.status", "submitted")
      .limit(1000);
    if (attemptAnswersError) throw attemptAnswersError;
    const attemptRows = ((attemptAnswers || []) as any[]).map((row) => ({
      question_id: row.question_id,
      answer_text: row.answer_text,
      is_correct: row.is_correct,
      score: row.score,
      grading_status: row.grading_status,
      grading_source: row.grading_source,
      grading_feedback: row.grading_feedback,
      // В test_answers нет answered_at — используем graded_at (может быть null).
      answered_at: row.graded_at,
      source: "attempt",
    }));
    const allRows = [...rows.map((row) => ({ ...row, source: "preparation" })), ...attemptRows];
    const questionIds = [...new Set(allRows.map((row) => String(row.question_id)))];
    const { data: questions, error: questionsError } = await service
      .from("questions")
      .select("id,text,answer")
      .in("id", questionIds as string[])
      .limit(1000);
    if (questionsError) throw questionsError;
    const questionTexts = new Map<string, { text: string; etalon: string }>();
    for (const question of questions || []) {
      questionTexts.set(String(question.id), {
        text: String((question as any).text || "").slice(0, 500),
        etalon: String((question as any).answer || "").slice(0, 500),
      });
    }
    const seen = new Set<string>();
    const items: any[] = [];
    for (const row of [...allRows].reverse()) {
      const key = String(row.question_id);
      if (seen.has(key)) continue; // последний ответ на вопрос — как в прогрессе банка
      seen.add(key);
      const meta = questionTexts.get(key);
      const isCorrect = row.is_correct === true;
      const item: Record<string, unknown> = {
        question_id: key,
        text: meta?.text || "—",
        student_answer: detailLevel >= 2 ? String(row.answer_text || "").slice(0, 1000) : null,
        is_correct: row.is_correct,
        score: row.score ?? null,
        grading_source: row.grading_source || null,
        grading_feedback: detailLevel >= 3 ? String(row.grading_feedback || "").slice(0, 500) || null : null,
        answered_at: row.answered_at || null,
        source: row.source,
      };
      // Эталон — уровень 3+: иначе студент узнает правильные ответы через учителя.
      if (detailLevel >= 3) item.etalon = meta?.etalon || null;
      items.push(item);
    }
    return c.json(ok({
      student_id: studentId,
      test_id: testId,
      test_title: (test as any).title || null,
      detail_level: detailLevel,
      items,
    }, rid));
  } catch (breakdownError) {
    console.error("[teacher:student-breakdown]", breakdownError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Разбор попытки недоступен");
  }
});
