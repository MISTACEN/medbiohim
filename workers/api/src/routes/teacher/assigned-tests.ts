/**
 * Назначения тестов: создание, сводка, аналитика по вопросам, CSV-ведомость.
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
  MIN_SAMPLE_SIZE,
  UUID,
  canSeeTestResults,
  error,
  scopedHomeworks,
  scopedSubmissions,
  studentDirectory,
  teacherSubjects,
  uniqueIds,
  visibleResultTestIds,
  type TeacherEnv,
} from "./_shared";

const teacher = new Hono<TeacherEnv>();

/**
 * Назначения тестов (кабинет 8.20–8.24): преподаватель назначает
 * опубликованный тест своим группам/студентам с дедлайном, лимитом времени,
 * числом попыток и выборкой вопросов. Вопросы не копируются: назначение
 * ссылается на существующий тест и существующий движок попыток — второй
 * системы результатов не появляется.
 */
teacher.post("/test-assignments", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const db = c.get("supabase") as any;
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

/** Список назначений преподавателя со сводкой: кто прошёл, средний процент. */
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

/** Отменить назначение: только автор или администратор. */
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

/**
 * Аналитика по вопросам (кабинет «Аналитика»): какой вопрос группа завалила.
 * Источник — существующие результаты подготовки (test_preparation_results):
 * на каждый вопрос — долю верных ответов. Второй таблицы статистики нет.
 */
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

/** Ведомость по назначению в CSV (Excel-совместимо: ; и BOM). */
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

export default teacher;
