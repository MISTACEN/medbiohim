import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { requireContentOwnership } from "../../lib/content-access";
import { loadTeacherScope } from "../../lib/teacher-scope";
import {
  CONTENT_MODERATORS,
  MANAGERS,
  UUID,
  countRows,
  dbFor,
  gate,
  jsonBody,
  responseError,
  roleCodes,
  validText,
} from "./shared";
import type { ParityApp } from "./shared";

export function registerHomeworks(parity: ParityApp) {
// Admin homework panel. Deletion is blocked when student submissions/progress/attachments exist.
parity.get("/homeworks", requireAuth, async (c) => {
  const rid = requestId();
  // Панель собирает ДЗ и сдачи ВСЕХ групп вместе с ФИО и почтами студентов —
  // это админская сводка. Преподаватель читает сдачи только своей области
  // через /teacher/submissions (план §38.2-38.3).
  if (!(await gate(c, CONTENT_MODERATORS))) return c.res;
  const db = dbFor(c);
  try {
    const { data: homeworks, error } = await db.from("homeworks")
      .select("id,title,description,due_at,due_date,status,created_at,subject_id,group_id")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    const rows = homeworks || [];
    const subjectIds = [...new Set(rows.map((x: any) => x.subject_id).filter(Boolean))];
    const groupIds = [...new Set(rows.map((x: any) => x.group_id).filter(Boolean))];
    const homeworkIds = rows.map((x: any) => x.id).filter(Boolean);
    const [subjectsResult, groupsResult, submissionsResult] = await Promise.all([
      subjectIds.length ? db.from("subjects").select("id,name,slug").in("id", subjectIds) : Promise.resolve({ data: [], error: null }),
      groupIds.length ? db.from("groups").select("id,name,code").in("id", groupIds) : Promise.resolve({ data: [], error: null }),
      homeworkIds.length ? db.from("homework_submissions").select("id,homework_id,user_id,text_answer,status,grade,teacher_comment,submitted_at").in("homework_id", homeworkIds).order("submitted_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    ]);
    if (subjectsResult.error || groupsResult.error || submissionsResult.error) throw new Error("homework relations failed");
    const subjectMap = Object.fromEntries((subjectsResult.data || []).map((x: any) => [String(x.id), x]));
    const groupMap = Object.fromEntries((groupsResult.data || []).map((x: any) => [String(x.id), x]));
    const submissions = submissionsResult.data || [];
    const userIds = [...new Set(submissions.map((x: any) => x.user_id).filter(Boolean))];
    const { data: users, error: usersError } = userIds.length
      ? await db.from("users").select("id,full_name,email").in("id", userIds)
      : { data: [], error: null };
    if (usersError) throw usersError;
    const userMap = Object.fromEntries((users || []).map((x: any) => [String(x.id), x]));
    const byHomework: Record<string, any[]> = {};
    for (const sub of submissions) (byHomework[String(sub.homework_id)] ||= []).push(sub);
    const items: any[] = [];
    for (const hw of rows) {
      const base = {
        ...hw,
        subject_name: subjectMap[String(hw.subject_id)]?.name || null,
        group_name: groupMap[String(hw.group_id)]?.name || groupMap[String(hw.group_id)]?.code || null,
      };
      const subs = byHomework[String(hw.id)] || [];
      if (!subs.length) items.push(base);
      else for (const sub of subs) {
        const user = userMap[String(sub.user_id)] || {};
        items.push({
          ...base, submission_id: sub.id, student_name: user.full_name || null, student_email: user.email || null,
          submission_status: sub.status, grade: sub.grade, text_answer: sub.text_answer,
          teacher_comment: sub.teacher_comment, submitted_at: sub.submitted_at,
        });
      }
    }
    return c.json(ok({ items }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить домашние задания");
  }
});

parity.post("/homeworks", requireAuth, async (c) => {
  const rid = requestId();
  // Создание ДЗ преподавателем сохранено, но только в НАЗНАЧЕННЫХ ему группах:
  // без проверки области панель позволяла задать задание любой группе или
  // вообще без группы (план §6.8, §13.2).
  if (!(await gate(c, MANAGERS))) return c.res;
  const input = await jsonBody(c);
  if (!input || !validText(input.title, 300)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Укажите название домашнего задания");
  const subjectId = input.subject_id ? String(input.subject_id) : null;
  const groupId = input.group_id ? String(input.group_id) : null;
  if (subjectId && !UUID.test(subjectId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_id");
  if (groupId && !UUID.test(groupId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный group_id");
  let dueAt: string | null = null;
  if (input.due_at) {
    const date = new Date(String(input.due_at));
    if (Number.isNaN(date.getTime())) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный срок сдачи");
    dueAt = date.toISOString();
  }
  const db = dbFor(c), user = c.get("user");
  try {
    const roles = await roleCodes(c);
    // Не admin/moderator? Значит teacher: группа обязательна и обязана быть
    // в его области (teacher_assignments). Таблицы назначений нет — fail-closed.
    if (!roles.includes("admin") && !roles.includes("moderator")) {
      const requestedGroupId = groupId ? String(groupId) : null;
      if (!requestedGroupId) {
        return responseError(c, rid, 403, "FORBIDDEN", "Домашнее задание преподавателя создаётся для назначенной группы");
      }
      const scope = await loadTeacherScope(c.get("supabase"), user.id);
      if (!scope.groups.includes(String(requestedGroupId))) {
        return responseError(c, rid, 403, "FORBIDDEN", "Группа не входит в вашу область преподавания");
      }
    }
    if (subjectId) {
      const { data, error } = await db.from("subjects").select("id").eq("id", subjectId).maybeSingle();
      if (error) throw error;
      if (!data) return responseError(c, rid, 422, "SUBJECT_NOT_FOUND", "Предмет не найден");
    }
    if (groupId) {
      const { data, error } = await db.from("groups").select("id,is_active").eq("id", groupId).maybeSingle();
      if (error) throw error;
      if (!data || data.is_active === false) return responseError(c, rid, 422, "GROUP_NOT_FOUND", "Активная группа не найдена");
    }
    const row: any = {
      title: input.title.trim(), description: String(input.description || "").slice(0, 20000),
      subject_id: subjectId, group_id: groupId, due_at: dueAt,
      due_date: dueAt ? dueAt.slice(0, 10) : null,
      created_by: user.id, created_by_role: roles.includes("admin") ? "admin" : "teacher", status: "open",
    };
    const { data, error } = await db.from("homeworks").insert(row).select("id,title,description,due_at,due_date,status,created_at,subject_id,group_id").single();
    if (error) throw error;
    return c.json(ok({ item: data }, rid), 201);
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать домашнее задание");
  }
});

parity.delete("/homeworks/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, MANAGERS))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID домашнего задания");
  const db = dbFor(c);
  try {
    const { data: homework, error: readError } = await db.from("homeworks")
      .select("id,created_by").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!homework) return responseError(c, rid, 404, "NOT_FOUND", "Домашнее задание не найдено");
    // Преподаватель удаляет только своё задание; чужое — модератор или админ.
    if (!await requireContentOwnership(c, (homework as { created_by?: unknown }).created_by)) return c.res;
    const [submissions, progress, attachments] = await Promise.all([
      countRows(db, "homework_submissions", "homework_id", id),
      countRows(db, "homework_progress", "homework_id", id),
      countRows(db, "homework_attachments", "homework_id", id),
    ]);
    if (submissions + progress + attachments > 0) {
      return responseError(c, rid, 409, "HOMEWORK_HAS_ACTIVITY", "Нельзя удалить ДЗ: уже есть ответы, прогресс или вложения");
    }
    const { data, error } = await db.from("homeworks").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Домашнее задание не найдено");
    return c.json(ok({ deleted: true, id }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить домашнее задание");
  }
});
}
