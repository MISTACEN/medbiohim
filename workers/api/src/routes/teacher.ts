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
import { describeScope, isWithinTeachingScope, loadTeacherScope } from "../lib/teacher-scope";

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
  "id,homework_id,user_id,status,grade,teacher_comment,text_answer,submitted_at,graded_at";

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
  return [...byId.values()].sort((a, b) =>
    String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")),
  ).slice(0, limit);
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

export default teacher;
