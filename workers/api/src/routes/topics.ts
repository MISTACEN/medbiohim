import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/**
 * Прогресс по темам программы: «сдано / не сдано / отработка» на уровне
 * каждой темы предмета. Данные приватные (RLS owner-only, user_id только
 * из JWT); план и расписание общие — их правки прогресс не трогают.
 */
const topics = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

export const TOPIC_STATUSES = ["pending", "in_progress", "passed", "failed", "retake_needed"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

topics.patch("/:id/progress", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const topicId = String(c.req.param("id") ?? "");
  if (!UUID.test(topicId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный идентификатор темы", 422, rid);
    return c.json(body, status as 422);
  }

  let input: any = {};
  try { input = await c.req.json(); } catch {}

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) {
    const requested = String(input.status || "");
    if (!(TOPIC_STATUSES as readonly string[]).includes(requested)) {
      const { body, status } = fail("VALIDATION_ERROR", "Недопустимый статус: " + (requested || "пусто"), 422, rid);
      return c.json(body, status as 422);
    }
    patch.status = requested;
  }
  if (input.grade !== undefined) {
    const grade = input.grade === null ? null : String(input.grade).trim().slice(0, 50);
    patch.grade = grade || null;
  }
  if (input.note !== undefined) {
    const note = input.note === null ? null : String(input.note).trim().slice(0, 1000);
    patch.note = note || null;
  }
  if (input.attempts !== undefined) {
    const attempts = Number(input.attempts);
    if (!Number.isInteger(attempts) || attempts < 0 || attempts > 99) {
      const { body, status } = fail("VALIDATION_ERROR", "Попытки — целое число от 0 до 99", 422, rid);
      return c.json(body, status as 422);
    }
    patch.attempts = attempts;
    patch.last_attempt_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 1) {
    const { body, status } = fail("VALIDATION_ERROR", "Нечего обновлять: передайте status, grade, note или attempts", 422, rid);
    return c.json(body, status as 422);
  }

  // Тема должна существовать — иначе upsert создал бы прогресс «в никуда».
  const { data: topic } = await db.from("topics").select("id").eq("id", topicId).maybeSingle();
  if (!topic) { const { body, status } = fail("NOT_FOUND", "Тема не найдена", 404, rid); return c.json(body, status as 404); }

  const { data, error } = await db
    .from("topic_progress")
    .upsert({ user_id: user.id, topic_id: topicId, ...patch }, { onConflict: "user_id,topic_id" })
    .select("topic_id,status,grade,note,attempts,last_attempt_at,updated_at")
    .single();
  if (error) {
    console.error("[topic-progress] upsert failed", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить прогресс", 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok({ item: data }, rid));
});

export default topics;
