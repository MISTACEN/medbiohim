import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";

import { UUID } from "./shared";

import type { HomeworkRouter } from "./types";

export function registerSubmitRoutes(homework: HomeworkRouter) {
homework.post("/:id/submit", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID задания", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: Record<string, unknown>;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const textAnswer = payload.text_answer == null ? (payload.content ?? payload.body ?? null) : payload.text_answer;
  if (textAnswer !== null && String(textAnswer).length > 50000) {
    const { body, status } = fail("PAYLOAD_TOO_LARGE", "Ответ слишком длинный", 413, rid);
    return c.json(body, status as 413);
  }
  const fileId = payload.file_id == null || payload.file_id === "" ? null : String(payload.file_id);
  if (fileId && !UUID.test(fileId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный file_id", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: task, error: taskError } = await db.from("homeworks")
      .select("id,group_id,status,created_by").eq("id", id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) {
      const { body, status } = fail("NOT_FOUND", "Задание не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    if (!task.group_id && String(task.created_by || "") !== user.id) {
      const { body, status } = fail("FORBIDDEN", "Личное задание недоступно для сдачи другим пользователям", 403, rid);
      return c.json(body, status as 403);
    }
    if (task.group_id) {
      const { data: membership, error: membershipError } = await db.from("group_memberships")
        .select("group_id").eq("user_id", user.id).eq("group_id", task.group_id).eq("is_active", true).limit(1);
      if (membershipError) throw membershipError;
      if (!membership?.length) {
        const { body, status } = fail("FORBIDDEN", "Задание недоступно в вашей учебной группе", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data: existing, error: existingError } = await db.from("homework_submissions")
      .select("id,status").eq("homework_id", id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
    if (existingError) throw existingError;
    const locked = (existing || []).some((row: any) => ["submitted", "pending", "awaiting_review", "on_review"].includes(String(row.status || "").toLowerCase()));
    if (locked) {
      const { body, status } = fail("SUBMISSION_LOCKED", "Работа уже сдана и ожидает проверки", 409, rid);
      return c.json(body, status as 409);
    }
    if (fileId) {
      const { data: file, error: fileError } = await db.from("files").select("id,uploaded_by").eq("id", fileId).maybeSingle();
      if (fileError) throw fileError;
      if (!file || String(file.uploaded_by || "") !== user.id) {
        const { body, status } = fail("FORBIDDEN", "Файл недоступен в контексте этого задания", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data, error } = await db.from("homework_submissions").insert({
      homework_id: id, user_id: user.id, text_answer: textAnswer == null ? null : String(textAnswer),
      file_id: fileId, status: "submitted", submitted_at: new Date().toISOString(),
    }).select("*").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("submission not returned");
    return c.json(ok({ submission: data }, rid), 201);
  } catch (error) {
    console.error("[homework:submit]", error);
    const { body, status } = fail("SUBMISSION_FAILED", "Не удалось отправить работу", 503, rid);
    return c.json(body, status as 503);
  }
});

homework.post("/:id/progress", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = (c.req.param("id") ?? "");
  let payload: { progress?: number; status?: string; completed?: boolean } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const progress = payload.progress ?? (payload.completed ? 100 : 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    const { body, status } = fail("VALIDATION_ERROR", "progress должен быть числом от 0 до 100", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase.from("homework_progress").upsert({
      homework_id: id, user_id: user.id, progress, completed: payload.completed ?? progress >= 100,
      status: payload.status ?? (progress >= 100 ? "completed" : "in_progress"), updated_at: new Date().toISOString(),
    }, { onConflict: "homework_id,user_id" }).select("*").maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить прогресс", 503, rid);
      return c.json(body, status as 503);
    }
    // Фаза 5: отметка по ДЗ — событие ленты.
    const { logActivity } = await import("../../lib/activity");
    await logActivity(c.env, {
      userId: user.id,
      kind: "homework_marked",
      refId: id,
      payload: { progress, completed: (data as any)?.completed === true },
    });
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить прогресс", 503, rid);
    return c.json(body, status as 503);
  }
});
}
