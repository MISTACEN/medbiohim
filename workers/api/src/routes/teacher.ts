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
      .select("id,teacher_id,group_id,student_id,subject_id,role,created_by,created_at")
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
