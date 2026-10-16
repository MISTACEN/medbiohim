import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const homework = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

homework.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("homeworks")
      .select("*")
      .order("due_at", { ascending: true })
      .limit(200);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Задания недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [], user_id: user.id }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Задания недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

homework.post("/", requireAuth, async (c) => {
  const rid = requestId();
  const { body, status } = fail("FORBIDDEN", "Создание заданий доступно только преподавателям", 403, rid);
  return c.json(body, status as 403);
});

homework.post("/:id/submit", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  let payload: Record<string, unknown> = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await supabase
      .from("homework_submissions")
      .insert({
        homework_id: id,
        user_id: user.id,
        content: payload.content ?? payload.body ?? null,
        status: "submitted",
      })
      .select("*")
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отправить работу", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отправить работу", 503, rid);
    return c.json(body, status as 503);
  }
});

homework.post("/:id/progress", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  let payload: { progress?: number; status?: string } = {};
  try {
    payload = await c.req.json();
  } catch {}
  try {
    const { data, error } = await supabase
      .from("homework_progress")
      .upsert(
        {
          homework_id: id,
          user_id: user.id,
          progress: payload.progress ?? 0,
          status: payload.status ?? "in_progress",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "homework_id,user_id" }
      )
      .select("*")
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить прогресс", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить прогресс", 503, rid);
    return c.json(body, status as 503);
  }
});

export default homework;
