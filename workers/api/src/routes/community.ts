import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const community = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

community.get("/posts", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("community_posts")
      .select("id,title,body,author_id,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Сообщество недоступно", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Сообщество недоступно", 503, rid);
    return c.json(body, status as 503);
  }
});

community.post("/posts", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: { title?: string; body?: string } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await supabase
      .from("community_posts")
      .insert({
        author_id: user.id,
        title: String(payload.title || "").slice(0, 200),
        body: String(payload.body || "").slice(0, 10000),
      })
      .select("id,title,created_at")
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось опубликовать", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось опубликовать", 503, rid);
    return c.json(body, status as 503);
  }
});

export default community;
