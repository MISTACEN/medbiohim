import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const settings = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

settings.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      return c.json(ok({ preferences: {} }, rid));
    }
    return c.json(ok(data || { preferences: {} }, rid));
  } catch {
    return c.json(ok({ preferences: {} }, rid));
  }
});

settings.patch("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: Record<string, unknown> = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .upsert(
        {
          user_id: user.id,
          preferences: payload.preferences ?? payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить настройки", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить настройки", 503, rid);
    return c.json(body, status as 503);
  }
});

export default settings;
