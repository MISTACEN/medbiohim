import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const trainers = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

trainers.get("/feed", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const limit = Math.min(Number(c.req.query("limit") || 30), 100);
  const topic = c.req.query("topic");
  try {
    let q = supabase
      .from("trainer_feed_cards")
      .select("id,title,topic,kind,order_index,has_image")
      .order("order_index", { ascending: true })
      .limit(limit);
    if (topic) q = q.eq("topic", topic);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.get("/feed/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    // Hide answer until submitted
    const { data, error } = await supabase
      .from("trainer_feed_cards")
      .select("id,title,topic,kind,prompt,options,has_image,order_index")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Карточка недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.post("/feed/answer", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: { card_id?: string; answer?: string } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!payload.card_id) {
    const { body, status } = fail("VALIDATION", "Нужен card_id", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    // Prefer scoring RPC if exists
    const { data, error } = await supabase.rpc("trainer_feed_submit_answer", {
      p_card_id: payload.card_id,
      p_answer: payload.answer ?? null,
    });
    if (!error && data) return c.json(ok(data, rid));

    const { data: inserted, error: insErr } = await supabase
      .from("trainer_feed_answers")
      .insert({
        card_id: payload.card_id,
        user_id: user.id,
        answer: payload.answer ?? null,
      })
      .select("id,card_id,is_correct,explanation")
      .maybeSingle();
    if (insErr) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(inserted, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.get("/feed/:id/image", requireAuth, async (c) => {
  const rid = requestId();
  // Binary images require Upstash Blob / R2 binding — placeholder
  const { body, status } = fail(
    "NOT_CONFIGURED",
    "Изображения тренажёра требуют object storage (UPSTASH_BLOB_TOKEN / R2)",
    501,
    rid
  );
  return c.json(body, status as 501);
});

export default trainers;
