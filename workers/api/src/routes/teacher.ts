import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  canAdminister,
  callerRoles,
  requireAdmin,
  requireTeachingCapability,
} from "../lib/permissions";
import {
  describeScope,
  loadTeacherScope,
  loadTeacherSubjectIds,
} from "../lib/teacher-scope";
import { createServiceClient } from "../lib/supabase";

/**
 * Кабинет преподавателя (план §9–§10, этап H).
 *
 * Всё, что здесь видно, ограничено областью: назначенные группы и студенты
 * (`teacher_assignments`), авторские задания и явное назначение проверяющим.
 * Администратор видит всё. Роль `teacher` без назначений получает пустой
 * кабинет — это ожидаемое состояние, а не ошибка.
 */
const teacher = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSIGNMENT_ROLES = new Set(["teacher", "curator", "assistant"]);
const SUBMISSION_FIELDS =
  "id,homework_id,user_id,status,grade,teacher_comment,text_answer,submitted_at,updated_at";

/**
 * В `homework_submissions` нет колонки `graded_at`: дата проверки лежит в
 * `updated_at`. Раньше запрос падал с 42703 и весь кабинет отдавал 503.
 * Контракт клиента сохраняем: `graded_at` вычисляется из статуса.
 */
function shapeSubmission(row: any) {
  const { updated_at, ...rest } = row || {};
  return {
    ...rest,
    graded_at: String(rest.status || "") === "graded" ? updated_at ?? null : null,
  };
}

function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))];
}

type HomeworkRow = {
  id: string;
  title: string;
  group_id: string | null;
  due_at: string | null;
  status: string | null;
  created_at: string | null;
};

/** Задания, доступные преподавателю: свои, по назначенным группам, у админа — все. */
async function scopedHomeworks(
  db: any,
  isAdmin: boolean,
  userId: string,
  groups: readonly string[],
): Promise<HomeworkRow[]> {
  const queries: Array<PromiseLike<{ data: any[] | null; error: any }>> = [];
  const fields = "id,title,group_id,due_at,status,created_at";
  if (isAdmin) {
    queries.push(db.from("homeworks").select(fields).order("created_at", { ascending: false }).limit(2000));
  } else {
    queries.push(db.from("homeworks").select(fields).eq("created_by", userId).order("created_at", { ascending: false }).limit(1000));
    if (groups.length) {
      queries.push(db.from("homeworks").select(fields).in("group_id", groups as string[]).order("created_at", { ascending: false }).limit(1000));
    }
  }
  const responses = await Promise.all(queries);
  const byId = new Map<string, HomeworkRow>();
  for (const response of responses) {
    if (response.error) throw response.error;
    for (const row of response.data || []) {
      const id = String((row as any).id || "");
      if (id && !byId.has(id)) byId.set(id, row as HomeworkRow);
    }
  }
  return [...byId.values()];
}

/** Работы в области: по доступным заданиям и по назначенным студентам. */
async function scopedSubmissions(
  db: any,
  isAdmin: boolean,
  homeworkIds: readonly string[],
  students: readonly string[],
  limit = 200,
) {
  const queries: Array<PromiseLike<{ data: any[] | null; error: any }>> = [];
  if (isAdmin) {
    queries.push(
      db.from("homework_submissions").select(SUBMISSION_FIELDS)
        .order("submitted_at", { ascending: false }).limit(limit),
    );
  } else {
    if (homeworkIds.length) {
      queries.push(
        db.from("homework_submissions").select(SUBMISSION_FIELDS)
          .in("homework_id", homeworkIds as string[])
          .order("submitted_at", { ascending: false }).limit(limit),
      );
    }
    if (students.length) {
      queries.push(
        db.from("homework_submissions").select(SUBMISSION_FIELDS)
          .in("user_id", students as string[])
          .order("submitted_at", { ascending: false }).limit(limit),
      );
    }
  }
  const responses = await Promise.all(queries);
  const byId = new Map<string, any>();
  for (const response of responses) {
    if (response.error) throw response.error;
    for (const row of response.data || []) {
      const id = String(row?.id || "");
      if (id && !byId.has(id)) byId.set(id, row);
    }
  }
  return [...byId.values()].map(shapeSubmission).sort((a, b) =>
    String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")),
  ).slice(0, limit);
}

/** Предметы преподавателя с названиями — для кабинета и админки. */
async function teacherSubjects(db: any, teacherId: string): Promise<Array<{ id: string; name: string }>> {
  const ids = await loadTeacherSubjectIds(db, teacherId);
  if (!ids.length) return [];
  const { data, error: readError } = await db.from("subjects")
    .select("id,name").in("id", ids).limit(200);
  if (readError) throw readError;
  return (data || []).map((row: any) => ({ id: String(row.id), name: String(row.name || "") }));
}

async function studentDirectory(db: any, studentIds: readonly string[]) {
  if (!studentIds.length) return new Map<string, { name: string; email: string | null }>();
  const { data, error: readError } = await db.from("users")
    .select("id,full_name,display_name,email").in("id", studentIds as string[]).limit(1000);
  if (readError) throw readError;
  const map = new Map<string, { name: string; email: string | null }>();
  for (const row of data || []) {
    map.set(String(row.id), {
      name: String(row.display_name || row.full_name || row.email || "Студент"),
      email: row.email ? String(row.email) : null,
    });
  }
  return map;
}

teacher.get("/overview", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const db = c.get("supabase") as any;
  const userId = c.get("user").id;
  try {
    const roles = await callerRoles(db, userId);
    const isAdmin = canAdminister(roles);
    const scope = await loadTeacherScope(db, userId);
    const subjects = await teacherSubjects(db, userId);
    const homeworks = await scopedHomeworks(db, isAdmin, userId, scope.groups);
    const submissions = await scopedSubmissions(
      db, isAdmin, homeworks.map((row) => row.id), scope.students, 500,
    );

    const groupIds = uniqueIds(scope.groups);
    const rosterQuery = groupIds.length
      ? await db.from("group_memberships").select("user_id,group_id,role_in_group")
        .in("group_id", groupIds).eq("is_active", true).limit(2000)
      : { data: [], error: null };
    if (rosterQuery.error) throw rosterQuery.error;
    const roster = (rosterQuery.data || []) as any[];
    const rosterIds = roster.map((row) => String(row.user_id));
    const scopeStudentIds = uniqueIds([...scope.students, ...rosterIds]);

    const groupsQuery = groupIds.length
      ? await db.from("groups").select("id,name,code,course_number,stream").in("id", groupIds).limit(200)
      : { data: [], error: null };
    if (groupsQuery.error) throw groupsQuery.error;

    const people = await studentDirectory(db, scopeStudentIds);
    const homeworkTitles = new Map(homeworks.map((row) => [row.id, row.title]));

    const pending = submissions.filter((row) => String(row.status || "") === "submitted");
    const graded = submissions.filter((row) => String(row.status || "") === "graded");
    const returned = submissions.filter((row) => String(row.status || "") === "returned");

    return c.json(ok({
      is_admin: isAdmin,
      scope: describeScope(scope),
      subjects,
      groups: groupsQuery.data || [],
      homeworks: homeworks.slice(0, 30),
      counts: {
        groups: groupIds.length,
        students: scopeStudentIds.length,
        homeworks: homeworks.length,
        submissions: submissions.length,
        pending: pending.length,
        graded: graded.length,
        returned: returned.length,
      },
      recent_submissions: submissions.slice(0, 15).map((row) => ({
        ...row,
        student_name: people.get(String(row.user_id))?.name || "Студент",
        homework_title: homeworkTitles.get(String(row.homework_id)) || null,
      })),
    }, rid));
  } catch (readError) {
    console.error("[teacher:overview]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Кабинет преподавателя временно недоступен");
  }
});

teacher.get("/submissions", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.results.view"))) return c.res;
  const db = c.get("supabase") as any;
  const userId = c.get("user").id;
  const status = String(c.req.query("status") || "").trim();
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 100), 1), 200);
  try {
    const roles = await callerRoles(db, userId);
    const isAdmin = canAdminister(roles);
    const scope = await loadTeacherScope(db, userId);
    const homeworks = await scopedHomeworks(db, isAdmin, userId, scope.groups);
    const homeworkTitles = new Map(homeworks.map((row) => [row.id, row.title]));
    let submissions = await scopedSubmissions(
      db, isAdmin, homeworks.map((row) => row.id), scope.students, 500,
    );
    if (["submitted", "graded", "returned", "draft"].includes(status)) {
      submissions = submissions.filter((row) => String(row.status || "") === status);
    }
    const items = submissions.slice(0, limit);
    const people = await studentDirectory(db, uniqueIds(items.map((row) => row.user_id)));
    return c.json(ok({
      items: items.map((row) => ({
        ...row,
        student_name: people.get(String(row.user_id))?.name || "Студент",
        student_email: people.get(String(row.user_id))?.email || null,
        homework_title: homeworkTitles.get(String(row.homework_id)) || null,
      })),
      total: submissions.length,
      is_admin: isAdmin,
    }, rid));
  } catch (readError) {
    console.error("[teacher:submissions]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Работы временно недоступны");
  }
});

/**
 * Опубликованные тесты для предпросмотра (план §9.1). Чтение — teacher/admin;
 * сам прогон идёт через GET /tests/preview/:id без записи попыток.
 */
teacher.get("/tests", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const db = c.get("supabase") as any;
  const q = String(c.req.query("q") || "").replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 80).trim();
  const user = c.get("user");
  try {
    const roles = await callerRoles(db, user.id);
    const isAdmin = canAdminister(roles);
    let query = db.from("tests")
      .select("id,title,subject_id,is_published,teacher_visible,created_by,created_at,subjects(name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false }).limit(300);
    if (q) query = query.ilike("title", `%${q}%`);
    const { data, error: readError } = await query;
    if (readError) throw readError;
    // Свой тест виден всегда (включая черновик), чужой — если опубликован,
    // разрешён администратором и относится к предмету преподавателя.
    const subjectIds = isAdmin ? [] : await loadTeacherSubjectIds(db, user.id);
    const rows = ((data || []) as any[]).filter((row) => {
      if (isAdmin) return true;
      if (String(row.created_by || "") === user.id) return true;
      if (row.is_published !== true) return false;
      if (row.teacher_visible === false) return false;
      if (!subjectIds.length) return true;
      return !row.subject_id || subjectIds.includes(String(row.subject_id));
    });
    const testIds = uniqueIds(rows.map((row) => row.id));
    const counts = new Map<string, number>();
    if (testIds.length) {
      const { data: links, error: linksError } = await db.from("test_questions")
        .select("test_id").in("test_id", testIds as string[]).limit(5000);
      if (linksError) throw linksError;
      for (const link of links || []) {
        const key = String((link as any).test_id || "");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return c.json(ok({
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        subject_id: row.subject_id ?? null,
        subject_name: (Array.isArray(row.subjects) ? row.subjects[0] : row.subjects)?.name || null,
        question_count: counts.get(String(row.id)) || 0,
        is_published: row.is_published === true,
        teacher_visible: row.teacher_visible !== false,
        is_mine: String(row.created_by || "") === user.id,
        created_by: row.created_by ?? null,
        created_at: row.created_at,
      })),
      total: rows.length,
      is_admin: isAdmin,
      my_subjects: await teacherSubjects(db, user.id),
    }, rid));
  } catch (readError) {
    console.error("[teacher:tests]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Список тестов временно недоступен");
  }
});

teacher.get("/assignments", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const db = c.get("supabase") as any;
  const userId = c.get("user").id;
  try {
    const roles = await callerRoles(db, userId);
    const isAdmin = canAdminister(roles);
    let query = db.from("teacher_assignments")
      .select("id,teacher_id,group_id,student_id,subject_id,role,detail_level,created_by,created_at")
      .order("created_at", { ascending: false }).limit(500);
    if (!isAdmin) query = query.eq("teacher_id", userId);
    const { data, error: readError } = await query;
    if (readError) throw readError;
    const rows = (data || []) as any[];
    const teacherIds = uniqueIds(rows.map((row) => row.teacher_id));
    const groupIds = uniqueIds(rows.map((row) => row.group_id));
    const studentIds = uniqueIds(rows.map((row) => row.student_id));
    const [teachers, groups, students] = await Promise.all([
      teacherIds.length
        ? db.from("users").select("id,full_name,display_name,email").in("id", teacherIds).limit(500)
        : Promise.resolve({ data: [], error: null }),
      groupIds.length
        ? db.from("groups").select("id,name,code").in("id", groupIds).limit(500)
        : Promise.resolve({ data: [], error: null }),
      studentIds.length
        ? db.from("users").select("id,full_name,display_name,email").in("id", studentIds).limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const nameOf = (row: any) => String(row.display_name || row.full_name || row.email || "");
    const teacherMap = new Map((teachers.data || []).map((row: any) => [String(row.id), nameOf(row)]));
    const groupMap = new Map((groups.data || []).map((row: any) => [String(row.id), String(row.name || row.code || "")]));
    const studentMap = new Map((students.data || []).map((row: any) => [String(row.id), nameOf(row)]));
    return c.json(ok({
      items: rows.map((row) => ({
        ...row,
        teacher_name: teacherMap.get(String(row.teacher_id)) || null,
        group_name: groupMap.get(String(row.group_id)) || null,
        student_name: studentMap.get(String(row.student_id)) || null,
      })),
      is_admin: isAdmin,
    }, rid));
  } catch (readError) {
    console.error("[teacher:assignments]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Назначения временно недоступны");
  }
});

teacher.post("/assignments", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const db = c.get("supabase") as any;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const teacherId = String(input?.teacher_id || "");
  const groupId = input?.group_id ? String(input.group_id) : "";
  const studentId = input?.student_id ? String(input.student_id) : "";
  const subjectId = input?.subject_id ? String(input.subject_id) : "";
  const role = String(input?.role || "teacher");
  if (!UUID.test(teacherId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный teacher_id");
  if (Boolean(groupId) === Boolean(studentId)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Нужна ровно одна цель: группа или студент");
  }
  if ((groupId && !UUID.test(groupId)) || (studentId && !UUID.test(studentId)) || (subjectId && !UUID.test(subjectId))) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор цели");
  }
  if (!ASSIGNMENT_ROLES.has(role)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Роль: teacher, curator или assistant");
  }
  try {
    const { data: person, error: personError } = await db.from("users")
      .select("id").eq("id", teacherId).maybeSingle();
    if (personError) throw personError;
    if (!person) return error(c, rid, 404, "NOT_FOUND", "Преподаватель не найден");
    const { data, error: insertError } = await db.from("teacher_assignments").insert({
      teacher_id: teacherId,
      group_id: groupId || null,
      student_id: studentId || null,
      subject_id: subjectId || null,
      role,
      created_by: c.get("user").id,
    }).select("id,teacher_id,group_id,student_id,subject_id,role,created_at").maybeSingle();
    if (insertError) {
      if (String((insertError as any).code) === "23505") {
        return error(c, rid, 409, "ALREADY_ASSIGNED", "Такое назначение уже существует");
      }
      throw insertError;
    }
    return c.json(ok({ assignment: data }, rid), 201);
  } catch (writeError) {
    console.error("[teacher:assign]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить назначение");
  }
});

teacher.delete("/assignments/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const db = c.get("supabase") as any;
  try {
    const { data, error: deleteError } = await db.from("teacher_assignments")
      .delete().eq("id", id).select("id").maybeSingle();
    if (deleteError) throw deleteError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Назначение не найдено");
    return c.json(ok({ removed: true, id }, rid));
  } catch (deleteFailure) {
    console.error("[teacher:unassign]", deleteFailure);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось снять назначение");
  }
});

/**
 * Уровень детализации результатов (1–4) на назначение — меняет только админ:
 *   1 статистика · 2 + ответы · 3 + разбор и эталоны · 4 + история, аналитика, экспорт.
 */
teacher.patch("/assignments/:id/detail", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const detailLevel = Number(input?.detail_level);
  if (!Number.isInteger(detailLevel) || detailLevel < 1 || detailLevel > 4) {
    return error(c, rid, 422, "VALIDATION_ERROR", "detail_level: целое 1..4");
  }
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data, error: updateError } = await service
      .from("teacher_assignments")
      .update({ detail_level: detailLevel })
      .eq("id", id)
      .select("id,teacher_id,group_id,detail_level")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Назначение не найдено");
    return c.json(ok({ assignment: data }, rid));
  } catch (detailError) {
    console.error("[teacher:detail-level]", detailError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить уровень детализации");
  }
});

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
      .from("tests").select("id,title,is_published,archived_at")
      .eq("id", testId).is("archived_at", null).maybeSingle();
    if (testError) throw testError;
    if (!test || test.is_published !== true) {
      return error(c, rid, 404, "NOT_FOUND", "Тест не найден или не опубликован");
    }
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    const scope = await loadTeacherScope(service, userId);
    if (!isAdmin) {
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
 * Свой тест преподавателя (кабинет 8.7–8.11): собирается из личного банка
 * вопросов. Вопросы копируются в общий каталог questions со ссылкой на
 * предмет — существующий движок попыток и статистика работают без изменений.
 * Авторство фиксируется в tests.created_by; чужие тесты редактировать нельзя.
 */
teacher.post("/tests", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const userId = c.get("user").id;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const title = String(input?.title || "").trim();
  const subjectId = String(input?.subject_id || "");
  const questionIds = uniqueIds(Array.isArray(input?.question_ids) ? input.question_ids : []);
  const timeLimitSec = input?.time_limit_sec != null ? Number(input.time_limit_sec) : null;
  const maxAttempts = input?.max_attempts != null ? Number(input.max_attempts) : null;
  const instructions = input?.instructions ? String(input.instructions).slice(0, 1000) : null;
  const isPublished = input?.is_published !== false;
  if (!title || title.length > 300) return error(c, rid, 422, "VALIDATION_ERROR", "Название обязательно (до 300 символов)");
  if (!UUID.test(subjectId)) return error(c, rid, 422, "VALIDATION_ERROR", "Выберите предмет");
  if (!questionIds.length) return error(c, rid, 422, "VALIDATION_ERROR", "Выберите хотя бы один вопрос");
  if (questionIds.length > 200) return error(c, rid, 422, "VALIDATION_ERROR", "Максимум 200 вопросов");
  for (const [value, label] of [[maxAttempts, "max_attempts"], [timeLimitSec, "time_limit_sec"]] as const) {
    if (value != null && (!Number.isInteger(value) || value < 1 || value > 86400)) {
      return error(c, rid, 422, "VALIDATION_ERROR", `${label}: целое 1..86400`);
    }
  }
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data: subject, error: subjectError } = await service
      .from("subjects").select("id").eq("id", subjectId).maybeSingle();
    if (subjectError) throw subjectError;
    if (!subject) return error(c, rid, 404, "NOT_FOUND", "Предмет не найден");
    // Личный банк автора: чужие вопросы не подсунуть даже подменой id.
    const { data: storeRows, error: storeError } = await service
      .from("site_content").select("payload")
      .eq("key", "user_questions").limit(1);
    if (storeError) throw storeError;
    const bank: any[] = Array.isArray(storeRows?.[0]?.payload?.items) ? storeRows[0].payload.items : [];
    const byId = new Map<string, any>(
      bank.filter((item) => String(item?.author_id || "") === userId).map((item) => [String(item.id), item]),
    );
    const picked = questionIds.map((id) => byId.get(id)).filter(Boolean);
    if (picked.length !== questionIds.length) {
      return error(c, rid, 403, "FORBIDDEN", "Часть вопросов не найдена в вашем личном банке");
    }
    const questionRows = picked.map((item: any) => {
      const options = Array.isArray(item.options) ? item.options : [];
      return {
        subject_id: subjectId,
        type: String(item.kind || "single"),
        text: String(item.text || "").slice(0, 4000),
        answer: String(item.answer || "").slice(0, 500),
        options: JSON.stringify(
          options.map((label: string, index: number) => ({
            key: String.fromCharCode(65 + index),
            label: String(label),
          })),
        ),
        difficulty: null,
        is_published: true,
      };
    });
    const { data: insertedQuestions, error: questionsError } = await service
      .from("questions").insert(questionRows).select("id");
    if (questionsError) throw questionsError;
    const insertedIds = (insertedQuestions || []).map((row: any) => String(row.id));
    const { data: test, error: testError } = await service
      .from("tests")
      .insert({
        title,
        subject_id: subjectId,
        is_published: isPublished,
        created_by: userId,
        time_limit_sec: timeLimitSec,
        max_attempts: maxAttempts,
        source_key: `teacher:${userId}:${Date.now()}`,
      })
      .select("id,title,is_published,created_by")
      .maybeSingle();
    if (testError) throw testError;
    if (!test) return error(c, rid, 503, "DB_ERROR", "Тест не сохранился");
    const links = insertedIds.map((questionId, index) => ({
      test_id: String(test.id),
      question_id: questionId,
      order_index: index,
    }));
    const { error: linksError } = await service.from("test_questions").insert(links);
    if (linksError) throw linksError;
    return c.json(ok({ test, question_count: insertedIds.length }, rid), 201);
  } catch (createError) {
    console.error("[teacher:create-test]", createError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать тест");
  }
});

/** Правка своего теста: название, публикация, настройки. */
teacher.patch("/tests/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const userId = c.get("user").id;
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const patch: Record<string, unknown> = {};
  if (input?.title != null) {
    const title = String(input.title).trim();
    if (!title || title.length > 300) return error(c, rid, 422, "VALIDATION_ERROR", "Название обязательно (до 300 символов)");
    patch.title = title;
  }
  if (input?.is_published != null) patch.is_published = input.is_published === true;
  if (input?.time_limit_sec != null) {
    const value = Number(input.time_limit_sec);
    if (!Number.isInteger(value) || value < 1 || value > 86400) {
      return error(c, rid, 422, "VALIDATION_ERROR", "time_limit_sec: целое 1..86400");
    }
    patch.time_limit_sec = value;
  }
  if (input?.max_attempts != null) {
    const value = Number(input.max_attempts);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      return error(c, rid, 422, "VALIDATION_ERROR", "max_attempts: целое 1..100");
    }
    patch.max_attempts = value;
  }
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    let query = service.from("tests").update(patch).eq("id", id);
    if (!canAdminister(roles)) query = query.eq("created_by", userId);
    const { data, error: updateError } = await query.select("id,title,is_published").maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден или не ваш");
    return c.json(ok({ test: data }, rid));
  } catch (patchError) {
    console.error("[teacher:patch-test]", patchError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить тест");
  }
});

/** Удалить (архивировать) свой тест. */
teacher.delete("/tests/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, c.get("user").id);
    const archivedAt = new Date().toISOString();
    let query = service.from("tests").update({ archived_at: archivedAt }).eq("id", id);
    if (!canAdminister(roles)) query = query.eq("created_by", c.get("user").id);
    const { data, error: deleteTestError } = await query.select("id").maybeSingle();
    if (deleteTestError) throw deleteTestError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден или не ваш");
    return c.json(ok({ removed: true, id }, rid));
  } catch (deleteTestError) {
    console.error("[teacher:delete-test]", deleteTestError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить тест");
  }
});

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
    let testsQuery = service.from("tests").select("id").is("archived_at", null).limit(2000);
    if (!isAdmin) testsQuery = testsQuery.eq("created_by", userId);
    const { data: ownTests, error: ownTestsError } = await testsQuery;
    if (ownTestsError) throw ownTestsError;
    const ownTestIds = (ownTests || []).map((row: any) => String(row.id));
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
      return {
        question_id: String(question.id),
        order: index + 1,
        text: String(question.text || "").slice(0, 300),
        answered: stat.answered,
        correct: stat.correct,
        correct_percent: stat.answered ? Math.round((stat.correct / stat.answered) * 100) : null,
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

teacher.get("/candidates", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const db = c.get("supabase") as any;
  // Пользовательский ввод идёт в PostgREST-фильтр: оставляем только безопасные символы.
  const q = String(c.req.query("q") || "").replace(/[^\p{L}\p{N}@._ -]/gu, "").slice(0, 80).trim();
  try {
    const { data: role, error: roleError } = await db.from("roles").select("id").eq("code", "teacher").maybeSingle();
    if (roleError) throw roleError;
    let teacherIds: string[] = [];
    if (role?.id) {
      const { data: links, error: linkError } = await db.from("user_roles")
        .select("user_id").eq("role_id", role.id).limit(1000);
      if (linkError) throw linkError;
      teacherIds = uniqueIds((links || []).map((row: any) => row.user_id));
    }
    let teachers: Array<{ id: string; name: string; email: string | null }> = [];
    if (teacherIds.length) {
      let usersQuery = db.from("users")
        .select("id,full_name,display_name,email").in("id", teacherIds).limit(500);
      if (q) {
        usersQuery = usersQuery.or(
          `email.ilike.%${q}%,full_name.ilike.%${q}%,display_name.ilike.%${q}%`,
        );
      }
      const { data, error: usersError } = await usersQuery;
      if (usersError) throw usersError;
      teachers = (data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.display_name || row.full_name || row.email || "Преподаватель"),
        email: row.email ? String(row.email) : null,
      }));
    }
    const { data: groups, error: groupsError } = await db.from("groups")
      .select("id,name,code,course_number").eq("is_active", true).order("name").limit(500);
    if (groupsError) throw groupsError;
    return c.json(ok({ teachers, groups: groups || [] }, rid));
  } catch (readError) {
    console.error("[teacher:candidates]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Список преподавателей и групп недоступен");
  }
});

/**
 * Предметы преподавателя. Преподаватель читает свои; администратор — любого
 * преподавателя через `?teacher_id=` и сразу получает каталог для выбора.
 */
teacher.get("/subjects", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const db = c.get("supabase") as any;
  const userId = c.get("user").id;
  const requested = String(c.req.query("teacher_id") || "");
  try {
    const isAdmin = canAdminister(await callerRoles(db, userId));
    if (requested && !UUID.test(requested)) {
      return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный teacher_id");
    }
    const teacherId = isAdmin && requested ? requested : userId;
    const items = await teacherSubjects(db, teacherId);
    let catalog: Array<{ id: string; name: string }> = [];
    if (isAdmin) {
      const { data, error: catalogError } = await db.from("subjects")
        .select("id,name").order("name").limit(1000);
      if (catalogError) throw catalogError;
      catalog = (data || []).map((row: any) => ({ id: String(row.id), name: String(row.name || "") }));
    }
    return c.json(ok({ items, catalog, is_admin: isAdmin, teacher_id: teacherId }, rid));
  } catch (readError) {
    console.error("[teacher:subjects]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Предметы преподавателя недоступны");
  }
});

/** Полная замена набора предметов преподавателя (только администратор). */
teacher.put("/subjects", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const db = c.get("supabase") as any;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const teacherId = String(input?.teacher_id || "");
  const subjectIds = Array.isArray(input?.subject_ids)
    ? [...new Set((input.subject_ids as unknown[]).map((id) => String(id)).filter(Boolean))]
    : [];
  if (!UUID.test(teacherId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный teacher_id");
  if (subjectIds.some((id) => !UUID.test(id))) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_id");
  }
  if (subjectIds.length > 50) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Не больше 50 предметов на преподавателя");
  }
  try {
    const { data: person, error: personError } = await db.from("users")
      .select("id").eq("id", teacherId).maybeSingle();
    if (personError) throw personError;
    if (!person) return error(c, rid, 404, "NOT_FOUND", "Преподаватель не найден");
    const { error: clearError } = await db.from("teacher_subjects")
      .delete().eq("teacher_id", teacherId);
    if (clearError) throw clearError;
    if (subjectIds.length) {
      const { error: insertError } = await db.from("teacher_subjects").insert(
        subjectIds.map((subjectId) => ({
          teacher_id: teacherId,
          subject_id: subjectId,
          created_by: c.get("user").id,
        })),
      );
      if (insertError) throw insertError;
    }
    return c.json(ok({ items: await teacherSubjects(db, teacherId) }, rid));
  } catch (writeError) {
    console.error("[teacher:subjects:put]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить предметы");
  }
});

/**
 * Назначить автора теста (только администратор). Автор видит тест всегда,
 * включая черновик, — так администратор решает, какой тест «его», а какой нет.
 */
teacher.patch("/tests/:id/owner", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор теста");
  const db = c.get("supabase") as any;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const teacherId = input?.teacher_id ? String(input.teacher_id) : "";
  if (teacherId && !UUID.test(teacherId)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный teacher_id");
  }
  try {
    if (teacherId) {
      const { data: person, error: personError } = await db.from("users")
        .select("id").eq("id", teacherId).maybeSingle();
      if (personError) throw personError;
      if (!person) return error(c, rid, 404, "NOT_FOUND", "Преподаватель не найден");
    }
    const { data, error: updateError } = await db.from("tests")
      .update({ created_by: teacherId || null })
      .eq("id", id).select("id,title,created_by").maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден");
    return c.json(ok({ test: data }, rid));
  } catch (writeError) {
    console.error("[teacher:tests:owner]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось назначить автора теста");
  }
});

/** Разрешить или запретить показ теста преподавателям (только администратор). */
teacher.patch("/tests/:id/visibility", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор теста");
  const db = c.get("supabase") as any;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  if (typeof input?.teacher_visible !== "boolean") {
    return error(c, rid, 422, "VALIDATION_ERROR", "Нужен флаг teacher_visible");
  }
  try {
    const { data, error: updateError } = await db.from("tests")
      .update({ teacher_visible: input.teacher_visible })
      .eq("id", id).select("id,title,teacher_visible").maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден");
    return c.json(ok({ test: data }, rid));
  } catch (writeError) {
    console.error("[teacher:tests:visibility]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить видимость теста");
  }
});

export default teacher;
