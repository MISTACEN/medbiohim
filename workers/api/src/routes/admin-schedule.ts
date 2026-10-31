/**
 * MEDBIOHIM Admin Schedule Management API
 * Handles schedule versioning, rollback, and bulk operations
 */

import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { resolveGroupByCohort } from "../lib/cohort-resolver";

const adminSchedule = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Helper function to check if user is staff
async function isAdmin(c: any): Promise<boolean> {
  const db = c.get("supabase");
  const user = c.get("user");
  
  const roles = await getCallerRoles(db, user.id);
  return ["teacher", "moderator", "admin"].some(r => roles.includes(r));
}

async function getCallerRoles(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", userId)
    .limit(25);

  if (error) throw error;

  const codes: string[] = [];
  for (const row of data || []) {
    const roleRows = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
    for (const role of roleRows) {
      const code = String(role?.code || "").toLowerCase().trim();
      if (code) codes.push(code);
    }
  }
  return [...new Set(codes)];
}

/** Резолвер когорты нужен тем, кто загружает расписание: staff или староста. */
async function canResolveCohort(c: any): Promise<boolean> {
  const db = c.get("supabase");
  const user = c.get("user");
  const roles = await getCallerRoles(db, user.id);
  if (["teacher", "moderator", "admin"].some((r) => roles.includes(r))) return true;
  const { data, error } = await db
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("role_in_group", "starosta")
    .eq("is_active", true)
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

/**
 * GET /admin/schedule/resolve-group?label=МБХ+201
 * Резолвер когорты (Блок 5 бэклога): «МБХ 201» в 2026-27 — когорта поступления
 * 2025 (2 курс). Привязка идёт к стабильному id группы, а не к меняющемуся
 * имени: в 2027-28 тот же файл «МБХ 301» найдёт ту же группу.
 */
adminSchedule.get("/schedule/resolve-group", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!(await canResolveCohort(c))) {
    return c.json(fail("FORBIDDEN", "Резолвер доступен staff и старостам", 403, rid), 403);
  }
  const label = String(c.req.query("label") || "").trim();
  if (!label || label.length > 120) {
    return c.json(fail("VALIDATION_ERROR", "Нужен label — название файла или группы (до 120 символов)", 422, rid), 422);
  }
  try {
    const { data: groups, error } = await db
      .from("groups")
      .select("id,code,name,admission_year,stream,course_number,is_active")
      .limit(500);
    if (error) {
      console.error("[admin:schedule:resolve-group]", error);
      return c.json(fail("DB_UNAVAILABLE", "Список групп недоступен", 503, rid), 503);
    }
    const resolution = resolveGroupByCohort(label, groups || []);
    // Ничего не выдумываем: пустой результат — это reason, UI покажет честно.
    return c.json(ok({
      computed: resolution.computed,
      match: resolution.match,
      candidates: resolution.candidates,
      reason: resolution.reason,
    }, rid));
  } catch (err) {
    console.error("[admin:schedule:resolve-group]", err);
    return c.json(fail("RESOLVE_FAILED", "Не удалось распознать группу", 503, rid), 503);
  }
});

/**
 * GET /admin/schedule/versions/:scheduleId
 * Get all versions of a schedule with audit trail
 */
adminSchedule.get("/schedule/versions/:scheduleId", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const scheduleId = String(c.req.param("scheduleId") || "");

  // Проверка прав: версии расписания — служебная информация редактора.
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Только преподаватели и админы могут смотреть версии расписания", 403, rid), 403);
  }

  // Verify UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scheduleId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID расписания", 422, rid), 422);
  }
  
  try {
    const { data, error } = await db
      .from("schedule_versions")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("version", { ascending: false })
      .limit(50);
    
    if (error) {
      console.error("[admin:schedule:versions]", error);
      return c.json(fail("DB_UNAVAILABLE", "История версий недоступна", 503, rid), 503);
    }
    
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[admin:schedule:versions]", error);
    return c.json(fail("VERSIONS_UNAVAILABLE", "История версий недоступна", 503, rid), 503);
  }
});

/**
 * POST /admin/schedule/save
 * Save new version of schedule with versioning
 */
adminSchedule.post("/schedule/save", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  
  // Check permissions
  const isAdminOrStaff = await isAdmin(c);
  if (!isAdminOrStaff) {
    return c.json(fail("FORBIDDEN", "Только преподаватели и админы могут сохранять расписание", 403, rid), 403);
  }
  
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  
  const scheduleId = payload?.schedule_id;
  const entries = payload?.entries;
  const notes = payload?.notes || null;
  
  // Validate inputs
  if (!scheduleId || !Array.isArray(entries)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректные параметры", 422, rid), 422);
  }
  
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scheduleId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID расписания", 422, rid), 422);
  }
  
  try {
    // Call RPC function
    const { data, error } = await db.rpc("medbiohim_version_and_save_schedule", {
      p_user_id: user.id,
      p_schedule_id: scheduleId,
      p_entries: entries,
      p_notes: notes
    });
    
    if (error) {
      console.error("[admin:schedule:save]", error);
      return c.json(fail("SAVE_FAILED", "Не удалось сохранить расписание", 503, rid), 503);
    }
    
    const result = data?.[0];
    if (!result || result.success === false) {
      return c.json(fail("SAVE_FAILED", result.message || "Ошибка сохранения", 500, rid), 500);
    }
    
    return c.json(ok({
      success: true,
      message: result.message,
      new_version: result.new_version,
      version_id: result.new_id
    }, rid));
  } catch (error) {
    console.error("[admin:schedule:save]", error);
    return c.json(fail("SAVE_FAILED", "Не удалось сохранить расписание", 503, rid), 503);
  }
});

/**
 * POST /admin/schedule/rollback/:scheduleId/:targetVersion
 * Rollback schedule to previous version
 */
adminSchedule.post("/schedule/rollback/:scheduleId/:targetVersion", requireAuth, async (c) => {
  const rid = requestId();
  const scheduleId = String(c.req.param("scheduleId") || "");
  const targetVersion = parseInt(String(c.req.param("targetVersion") || ""), 10);
  
  if (!UUID.test(scheduleId) || isNaN(targetVersion) || targetVersion < 1) {
    return c.json(fail("VALIDATION_ERROR", "Некорректные параметры", 422, rid), 422);
  }
  
  try {
    // Verify user has permission
    const isAdminOrStaff = await isAdmin(c);
    if (!isAdminOrStaff) {
      return c.json(fail("FORBIDDEN", "Нет прав доступа", 403, rid), 403);
    }
    
    // Откат пока не реализован: раньше эндпоинт отвечал «Расписание откатно
    // к версии N», ничего не меняя, — это ложный успех. Честно сообщаем, что
    // операция недоступна, вместо того чтобы делать вид, что она выполнена.
    return c.json(fail(
      "ROLLBACK_NOT_IMPLEMENTED",
      "Откат расписания к прежней версии ещё не реализован. Сохраните расписание заново — прежняя версия останется в истории версий.",
      501,
      rid,
    ), 501);
  } catch (error) {
    console.error("[admin:schedule:rollback]", error);
    return c.json(fail("ROLLBACK_FAILED", "Не удалось откатить расписание", 503, rid), 503);
  }
});

/**
 * PATCH /admin/schedule/entries/:id
 * Update single schedule entry
 */
adminSchedule.patch("/schedule/entries/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const entryId = String(c.req.param("id") || "");

  // Проверка прав: правка записей расписания — не студенческая операция.
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Только преподаватели и админы могут править записи расписания", 403, rid), 403);
  }

  if (!UUID.test(entryId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID записи", 422, rid), 422);
  }
  
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  
  // Validate updatable fields
  const room = payload?.room || null;
  const start_time = payload?.start_time || null;
  const end_time = payload?.end_time || null;
  const lesson_type = payload?.lesson_type || null;
  const topic = payload?.topic || null;
  const is_canceled = payload?.is_canceled;
  
  try {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    
    if (room !== null) updateData.room = room;
    if (start_time !== null) updateData.start_time = start_time;
    if (end_time !== null) updateData.end_time = end_time;
    if (lesson_type !== null) updateData.lesson_type = lesson_type;
    if (topic !== null) updateData.topic = topic;
    if (is_canceled !== undefined) {
      updateData.status = is_canceled ? 'canceled' : 'scheduled';
    }
    
    const { data, error } = await db
      .from("schedule_entries")
      .update(updateData)
      .eq("id", entryId)
      .select("*")
      .maybeSingle();
    
    if (error) throw error;
    if (!data) {
      return c.json(fail("NOT_FOUND", "Запись не найдена", 404, rid), 404);
    }
    
    return c.json(ok({ item: data }, rid));
  } catch (error) {
    console.error("[admin:schedule:update]", error);
    return c.json(fail("UPDATE_FAILED", "Не удалось обновить запись", 503, rid), 503);
  }
});

/**
 * DELETE /admin/schedule/entries/:id
 * Delete schedule entry (soft delete)
 */
adminSchedule.delete("/schedule/entries/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const entryId = String(c.req.param("id") || "");

  // Проверка прав: архивация записи расписания — не студенческая операция.
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Только преподаватели и админы могут изменять записи расписания", 403, rid), 403);
  }

  if (!UUID.test(entryId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID записи", 422, rid), 422);
  }

  try {
    const { data, error } = await db
      .from("schedule_entries")
      .update({
        archived_at: new Date().toISOString(),
        status: 'canceled'
      })
      .eq("id", entryId)
      .select("*")
      .maybeSingle();
    
    if (error) throw error;
    if (!data) {
      return c.json(fail("NOT_FOUND", "Запись не найдена", 404, rid), 404);
    }
    
    return c.json(ok({ 
      message: "Запись отменена",
      item: data 
    }, rid));
  } catch (error) {
    console.error("[admin:schedule:delete]", error);
    return c.json(fail("DELETE_FAILED", "Не удалось отменить запись", 503, rid), 503);
  }
});

/**
 * GET /admin/schedule/analytics/:scheduleId
 * Get analytics for a schedule
 */
adminSchedule.get("/schedule/analytics/:scheduleId", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const scheduleId = String(c.req.param("scheduleId") || "");

  // Проверка прав: аналитика расписания — служебная информация редактора.
  if (!(await isAdmin(c))) {
    return c.json(fail("FORBIDDEN", "Только преподаватели и админы могут смотреть аналитику расписания", 403, rid), 403);
  }

  if (!UUID.test(scheduleId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID расписания", 422, rid), 422);
  }
  
  try {
    // PostgREST does not expose GROUP BY through supabase-js, so aggregate the
    // rows for this schedule in the Worker instead of calling a missing method.
    const { data: entries, error } = await db
      .from("schedule_entries")
      .select("status,subject_id,teacher_id")
      .eq("schedule_id", scheduleId);
    
    if (error) throw error;
    
    const statusCounts: Record<string, number> = {};
    const subjects = new Set<string>();
    const teachers = new Map<string, number>();
    for (const entry of entries || []) {
      const status = String((entry as any).status || "unknown");
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const subjectId = String((entry as any).subject_id || "");
      if (subjectId) subjects.add(subjectId);
      const teacherId = String((entry as any).teacher_id || "");
      if (teacherId) teachers.set(teacherId, (teachers.get(teacherId) || 0) + 1);
    }
    
    return c.json(ok({
      status_counts: statusCounts,
      total_unique_subjects: subjects.size,
      teacher_distribution: [...teachers.entries()].map(([teacher_id, count]) => ({ teacher_id, count })),
      total_entries: (entries || []).length
    }, rid));
  } catch (error) {
    console.error("[admin:schedule:analytics]", error);
    return c.json(fail("ANALYTICS_UNAVAILABLE", "Аналитика недоступна", 503, rid), 503);
  }
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default adminSchedule;
