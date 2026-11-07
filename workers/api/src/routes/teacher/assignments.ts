/**
 * Назначения преподавателя на группы/студентов (teacher_assignments) и уровень детализации.
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

export default teacher;
