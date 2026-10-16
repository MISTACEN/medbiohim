import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const submissions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = new Set(["teacher", "moderator", "admin"]);

async function callerRoles(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db.from("user_roles").select("roles(code)").eq("user_id", userId).limit(25);
  if (error) throw error;
  const codes: string[] = [];
  for (const row of data || []) {
    const related = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
    for (const role of related) {
      const code = String(role?.code || "").toLowerCase().trim();
      if (code) codes.push(code);
    }
  }
  return [...new Set(codes)];
}

/** POST /api/v1/submissions/:id/grade — staff-only grading. */
submissions.post("/:id/grade", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const id = c.req.param("id");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID сдачи", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const rawGrade = payload?.grade;
  if (rawGrade === null || rawGrade === undefined || rawGrade === "" || !Number.isFinite(Number(rawGrade))) {
    const { body, status } = fail("VALIDATION_ERROR", "Оценка должна быть числом от 0 до 100", 422, rid);
    return c.json(body, status as 422);
  }
  const grade = Number(rawGrade);
  if (grade < 0 || grade > 100) {
    const { body, status } = fail("VALIDATION_ERROR", "Оценка должна быть от 0 до 100", 422, rid);
    return c.json(body, status as 422);
  }
  const comment = payload?.comment == null ? null : String(payload.comment).slice(0, 5000);
  try {
    const roles = await callerRoles(db, user.id);
    if (!roles.some((role) => STAFF_ROLES.has(role))) {
      const { body, status } = fail("FORBIDDEN", "Проверять работы могут только преподаватели и администраторы", 403, rid);
      return c.json(body, status as 403);
    }
    const { data: existing, error: existingError } = await db.from("homework_submissions")
      .select("id,homework_id,user_id,status").eq("id", id).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      const { body, status } = fail("NOT_FOUND", "Сданная работа не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    const { data, error } = await db.from("homework_submissions").update({
      grade,
      teacher_comment: comment,
      status: "graded",
      graded_at: new Date().toISOString(),
      graded_by: user.id,
    }).eq("id", id).select("id,homework_id,user_id,status,grade,teacher_comment,submitted_at,graded_at,graded_by").maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("GRADE_FAILED", "Работа не обновлена; проверьте права доступа к записи", 403, rid);
      return c.json(body, status as 403);
    }
    return c.json(ok({ submission: data }, rid));
  } catch (error) {
    console.error("[submission:grade]", error);
    const { body, status } = fail("GRADE_FAILED", "Не удалось сохранить оценку", 503, rid);
    return c.json(body, status as 503);
  }
});

/** Staff can return a submission for revision with a required explanation. */
submissions.post("/:id/return", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const id = c.req.param("id");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID сдачи", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const comment = String(payload?.comment || "").trim().slice(0, 5000);
  if (!comment) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите, что нужно исправить", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const roles = await callerRoles(db, user.id);
    if (!roles.some((role) => STAFF_ROLES.has(role))) {
      const { body, status } = fail("FORBIDDEN", "Возвращать работы на доработку могут только преподаватели и администраторы", 403, rid);
      return c.json(body, status as 403);
    }
    const { data: existing, error: existingError } = await db.from("homework_submissions")
      .select("id").eq("id", id).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      const { body, status } = fail("NOT_FOUND", "Сданная работа не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    const { data, error } = await db.from("homework_submissions").update({
      teacher_comment: comment,
      status: "returned",
      graded_at: new Date().toISOString(),
      graded_by: user.id,
    }).eq("id", id).select("id,homework_id,user_id,status,grade,teacher_comment,submitted_at,graded_at,graded_by").maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("GRADE_FAILED", "Не удалось вернуть работу на доработку", 403, rid);
      return c.json(body, status as 403);
    }
    return c.json(ok({ submission: data }, rid));
  } catch (error) {
    console.error("[submission:return]", error);
    const { body, status } = fail("RETURN_FAILED", "Не удалось вернуть работу на доработку", 503, rid);
    return c.json(body, status as 503);
  }
});

export default submissions;
