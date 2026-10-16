import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const trainings = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

trainings.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const status = c.req.query("status");
  try {
    const { data, error } = await supabase.rpc("histology_training_list", {
      p_status: status || null,
    });
    if (error) {
      // fallback table under RLS
      const user = c.get("user");
      let q = supabase
        .from("trainings")
        .select("id,status,score,created_at,completed_at,kind")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (status) q = q.eq("status", status);
      const alt = await q;
      if (alt.error) {
        const { body, status: st } = fail("DB_UNAVAILABLE", "Тренажёры недоступны", 503, rid);
        return c.json(body, st as 503);
      }
      return c.json(ok({ items: alt.data || [] }, rid));
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status: st } = fail("DB_UNAVAILABLE", "Тренажёры недоступны", 503, rid);
    return c.json(body, st as 503);
  }
});

trainings.post("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  let input: Record<string, unknown> = {};
  try {
    input = await c.req.json();
  } catch {}
  try {
    const { data, error } = await supabase.rpc("histology_training_create", { p_input: input });
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось создать сессию", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось создать сессию", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    const { data, error } = await supabase.rpc("histology_training_get", { p_training_id: id });
    if (error) {
      const { body, status } = fail("NOT_FOUND", "Сессия не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Сессия недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.post("/:id/answer", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  let payload: { order?: number; user_answer?: string; is_skipped?: boolean } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await supabase.rpc("histology_training_answer", {
      p_training_id: id,
      p_order: payload.order,
      p_user_answer: payload.user_answer ?? null,
      p_is_skipped: Boolean(payload.is_skipped),
    });
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.post("/:id/complete", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    const { data, error } = await supabase.rpc("histology_training_complete", { p_training_id: id });
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось завершить", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось завершить", 503, rid);
    return c.json(body, status as 503);
  }
});

trainings.post("/:id/cancel", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    const { data, error } = await supabase.rpc("histology_training_cancel", { p_training_id: id });
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отменить", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отменить", 503, rid);
    return c.json(body, status as 503);
  }
});

export default trainings;
