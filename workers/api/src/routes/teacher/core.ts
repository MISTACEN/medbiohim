/**
 * Ядро кабинета: обзор области, работы на проверку, кандидаты и предметы.
 * Выделено из монолита routes/teacher.ts — один домен, один файл.
 */
import { Hono } from "hono";
import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import {
  canAdminister,
  callerRoles,
  requireAdmin,
  requireTeachingCapability,
} from "../../lib/permissions";
import { describeScope, loadTeacherScope } from "../../lib/teacher-scope";

import { UUID, error, scopedHomeworks, scopedSubmissions, studentDirectory, teacherSubjects, uniqueIds, type TeacherEnv } from "./_shared";

const teacher = new Hono<TeacherEnv>();

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

/**
 * PUT /subjects — полная замена набора предметов преподавателя (только админ).
 *
 * Прод-баг (найден приёмкой 2026-11-22): фронтовый teacherSetSubjects давно
 * шлёт PUT /teacher/subjects, но обработчика не было — кнопка «Сохранить
 * предметы» в админке падала «Не удалось выполнить запрос». Замена полная и
 * атомарная по смыслу: удалить старые строки учителя, вставить новый набор.
 * created_by = администратор, выполнивший замену.
 */
teacher.put("/subjects", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const db = c.get("supabase") as any;
  const adminId = c.get("user").id;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const teacherId = String(input?.teacher_id || "");
  const subjectIds = uniqueIds(Array.isArray(input?.subject_ids) ? input.subject_ids : []);
  if (!UUID.test(teacherId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный teacher_id");
  if (subjectIds.length > 200) return error(c, rid, 422, "VALIDATION_ERROR", "Максимум 200 предметов");

  try {
    // Учитель должен существовать; роль не навязываем — панель уже листает
    // только преподавателей, а серверная проверка роли учителями отдельно.
    const { data: teacher, error: teacherError } = await db
      .from("users")
      .select("id")
      .eq("id", teacherId)
      .maybeSingle();
    if (teacherError) throw teacherError;
    if (!teacher) return error(c, rid, 404, "NOT_FOUND", "Преподаватель не найден");

    // Предметы должны существовать: иначе тишина при опечатке id.
    const { data: subjectRows, error: subjectsError } = await db
      .from("subjects")
      .select("id")
      .in("id", subjectIds)
      .limit(200);
    if (subjectsError) throw subjectsError;
    if ((subjectRows || []).length !== subjectIds.length) {
      return error(c, rid, 422, "VALIDATION_ERROR", "Некоторые предметы не найдены");
    }

    const { error: deleteError } = await db
      .from("teacher_subjects")
      .delete()
      .eq("teacher_id", teacherId);
    if (deleteError) throw deleteError;

    let items: Array<{ id: string; name: string }> = [];
    if (subjectIds.length) {
      const { data: inserted, error: insertError } = await db
        .from("teacher_subjects")
        .insert(subjectIds.map((subjectId: string) => ({
          teacher_id: teacherId,
          subject_id: subjectId,
          created_by: adminId,
        })))
        .select("subject_id");
      if (insertError) throw insertError;
      const ids = (inserted || []).map((row: any) => String(row.subject_id));
      const { data: named, error: namedError } = await db
        .from("subjects")
        .select("id,name")
        .in("id", ids)
        .limit(200);
      if (namedError) throw namedError;
      items = (named || []).map((row: any) => ({ id: String(row.id), name: String(row.name || "") }));
    }

    return c.json(ok({ items, teacher_id: teacherId }, rid));
  } catch (saveError) {
    console.error("[teacher:subjects:put]", saveError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить предметы преподавателя");
  }
});

export default teacher;
