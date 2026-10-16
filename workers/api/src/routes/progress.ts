import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const progress = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

progress.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", user.id)
      .limit(200);
    if (error) {
      const alt = await supabase
        .from("progress")
        .select("*")
        .eq("user_id", user.id)
        .limit(200);
      if (alt.error) {
        const { body, status } = fail("DB_UNAVAILABLE", "Прогресс недоступен", 503, rid);
        return c.json(body, status as 503);
      }
      return c.json(ok({ items: alt.data || [] }, rid));
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Прогресс недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default progress;
