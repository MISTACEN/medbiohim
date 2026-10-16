import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const srs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

srs.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("srs_cards")
      .select("*")
      .eq("user_id", user.id)
      .order("due_at", { ascending: true })
      .limit(100);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

srs.get("/due", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from("srs_cards")
      .select("*")
      .eq("user_id", user.id)
      .lte("due_at", now)
      .order("due_at", { ascending: true })
      .limit(50);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

srs.post("/:id/review", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  let payload: { quality?: number } = {};
  try {
    payload = await c.req.json();
  } catch {}
  const quality = Math.max(0, Math.min(5, Number(payload.quality ?? 3)));
  try {
    const { data, error } = await supabase
      .from("srs_reviews")
      .insert({ card_id: id, user_id: user.id, quality })
      .select("*")
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить повтор", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить повтор", 503, rid);
    return c.json(body, status as 503);
  }
});

export default srs;
