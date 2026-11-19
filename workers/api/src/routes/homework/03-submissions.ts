import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { loadTeacherScope, isWithinTeachingScope } from "../../lib/teacher-scope";

import { UUID, callerRoles } from "./shared";

import type { HomeworkRouter } from "./types";

export function registerSubmissionRoutes(homework: HomeworkRouter) {
homework.get("/:id/submissions", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID задания", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: task, error: taskError } = await db.from("homeworks")
      .select("id,group_id,created_by").eq("id", id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    const roles = await callerRoles(db, user.id);
    // Администратор и модератор действуют в рамках своих полномочий.
    const isModeratorLike = roles.includes("admin") || roles.includes("moderator");
    const isTeacher = roles.includes("teacher");
    // Преподаватель — ограниченный инструмент, а не «staff с полным доступом»:
    // он видит сдачи только по СВОИМ заданиям и в НАЗНАЧЕННЫХ ему группах
    // (teacher_assignments). Чужое задание или чужая группа — 403.
    if (!isModeratorLike && isTeacher) {
      const scope = await loadTeacherScope(db, user.id);
      const inScope = isWithinTeachingScope(scope, {
        createdBy: task.created_by,
        groupIds: [task.group_id],
      });
      if (!inScope) {
        const { body, status } = fail("FORBIDDEN", "Задание вне вашей области проверки", 403, rid);
        return c.json(body, status as 403);
      }
    }
    if (!isModeratorLike && !isTeacher) {
      if (task.group_id) {
        const { data: membership, error: membershipError } = await db.from("group_memberships")
          .select("group_id").eq("user_id", user.id).eq("group_id", task.group_id).eq("is_active", true).limit(1);
        if (membershipError) throw membershipError;
        if (!membership?.length) {
          const { body, status } = fail("FORBIDDEN", "Задание недоступно в вашей учебной группе", 403, rid);
          return c.json(body, status as 403);
        }
      } else if (String(task.created_by || "") !== user.id) {
        const { body, status } = fail("FORBIDDEN", "Можно просматривать только собственные задания", 403, rid);
        return c.json(body, status as 403);
      }
    }
    let query = db.from("homework_submissions")
      // У homework_submissions нет колонок graded_at/graded_by.
      .select("id,homework_id,user_id,text_answer,file_id,status,grade,teacher_comment,submitted_at,created_at")
      .eq("homework_id", id).order("submitted_at", { ascending: false }).limit(500);
    // Студент видит только свои сдачи; проверяющий — работы своей области.
    if (!isModeratorLike && !isTeacher) query = query.eq("user_id", user.id);
    const { data, error } = await query;
    if (error) throw error;
    return c.json(ok({ items: data || [], can_grade: isModeratorLike || isTeacher }, rid));
  } catch (error) {
    console.error("[homework:submissions]", error);
    const { body, status } = fail("SUBMISSIONS_UNAVAILABLE", "Не удалось загрузить сданные работы", 503, rid);
    return c.json(body, status as 503);
  }
});
}
