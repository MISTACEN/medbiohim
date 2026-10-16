import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const my = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

my.get("/attempts", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("test_attempts")
      .select("id,test_id,status,score,started_at,finished_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Попытки недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Попытки недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

export default my;
