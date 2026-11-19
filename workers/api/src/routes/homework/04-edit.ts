import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { loadTeacherScope, isWithinTeachingScope } from "../../lib/teacher-scope";

import { UUID, callerRoles } from "./shared";

import type { HomeworkRouter } from "./types";

export function registerEditRoutes(homework: HomeworkRouter) {
homework.patch("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  
  const id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID задания", 422, rid);
    return c.json(body, status as 422);
  }
  
  let payload: any;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  
  const title = String(payload?.title || "").trim().slice(0, 240);
  const description = payload?.description == null ? null : String(payload.description).slice(0, 10000);
  const dueAt = payload?.due_at ? String(payload.due_at) : null;
  
  if (!title || !dueAt || ((payload?.due_date || "") && typeof payload.due_date !== 'string')) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите название и срок выполнения", 422, rid);
    return c.json(body, status as 422);
  }
  
  const dueDate = dueAt.length >= 10 ? dueAt.slice(0, 10) : null;
  
  try {
    const roles = await callerRoles(db, user.id);
    const isManager = roles.includes("admin") || roles.includes("moderator");
    const isTeacher = roles.includes("teacher");
    
    // Verify homework exists and check ownership
    const { data: task, error: taskError } = await db.from("homeworks")
      .select("id,created_by,status,group_id,assigned_teacher").eq("id", id).maybeSingle();
      
    if (taskError) throw taskError;
    if (!task) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    
    if (task.status === "archived") {
      const { body, status } = fail("FORBIDDEN", "Нельзя редактировать архивное задание", 403, rid);
      return c.json(body, status as 403);
    }
    
    // Роль teacher не даёт прав на чужие группы: область складывается из
    // авторства, явного проверяющего и назначенных групп/студентов (§10).
    if (!isManager) {
      if (isTeacher) {
        const scope = await loadTeacherScope(db, user.id);
        const inScope = isWithinTeachingScope(scope, {
          createdBy: (task as { created_by?: unknown }).created_by,
          assignedTeacher: (task as { assigned_teacher?: unknown }).assigned_teacher,
          groupIds: [(task as { group_id?: unknown }).group_id as string | null | undefined],
        });
        if (!inScope) {
          const { body, status } = fail("FORBIDDEN", "Это задание вне вашей области преподавания", 403, rid);
          return c.json(body, status as 403);
        }
      } else if (task.group_id && String(task.created_by || "") !== user.id) {
        const { body, status } = fail("FORBIDDEN", "Нельзя редактировать чужие групповые задания", 403, rid);
        return c.json(body, status as 403);
      }
    }
    
    const { data, error } = await db.from("homeworks")
      .update({ 
        title, 
        description, 
        due_at: dueAt, 
        due_date: dueDate,
        updated_at: new Date().toISOString() 
      })
      .eq("id", id)
      .select("*,subjects(name,slug,color_hex),schedule_entries(id,date,start_time,end_time,subject_name)")
      .maybeSingle();
      
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    
    return c.json(ok({ item: data }, rid));
  } catch (error) {
    console.error("[homework:update]", error);
    const { body, status } = fail("HOMEWORK_UPDATE_FAILED", "Не удалось обновить задание", 503, rid);
    return c.json(body, status as 503);
  }
});

homework.delete("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  
  const id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID задания", 422, rid);
    return c.json(body, status as 422);
  }
  
  try {
    const roles = await callerRoles(db, user.id);
    const isManager = roles.includes("admin") || roles.includes("moderator");
    const isTeacher = roles.includes("teacher");
    
    // Get current homework state
    const { data: task, error: taskError } = await db.from("homeworks")
      .select("id,group_id,created_by,assigned_teacher,status").eq("id", id).maybeSingle();
      
    if (taskError) throw taskError;
    if (!task) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    
    if (task.status === "archived") {
      const { body, status } = fail("FORBIDDEN", "Задание уже удалено", 403, rid);
      return c.json(body, status as 403);
    }
    
    // Permission checks: модератор/админ — всё, teacher — только своя область.
    if (isManager) {
      // Managers can delete any homework
    } else if (isTeacher) {
      const scope = await loadTeacherScope(db, user.id);
      const inScope = isWithinTeachingScope(scope, {
        createdBy: (task as { created_by?: unknown }).created_by,
        assignedTeacher: (task as { assigned_teacher?: unknown }).assigned_teacher,
        groupIds: [(task as { group_id?: unknown }).group_id as string | null | undefined],
      });
      if (!inScope) {
        const { body, status } = fail("FORBIDDEN", "Это задание вне вашей области преподавания", 403, rid);
        return c.json(body, status as 403);
      }
    } else if (task.group_id) {
      // Student can only delete their own group homework
      if (String(task.created_by || "") !== user.id) {
        const { body, status } = fail("FORBIDDEN", "Можно удалять только собственные групповые задания", 403, rid);
        return c.json(body, status as 403);
      }
    } else {
      // Personal homework - must be owner
      if (String(task.created_by || "") !== user.id) {
        const { body, status } = fail("FORBIDDEN", "Можно удалять только свои личные задания", 403, rid);
        return c.json(body, status as 403);
      }
    }
    
    // Soft delete
    const { data, error } = await db.from("homeworks")
      .update({ 
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        status: "archived"
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
      
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    
    return c.json(ok({ message: "Задание удалено", item: data }, rid));
  } catch (error) {
    console.error("[homework:delete]", error);
    const { body, status } = fail("HOMEWORK_DELETE_FAILED", "Не удалось удалить задание", 503, rid);
    return c.json(body, status as 503);
  }
});
}
