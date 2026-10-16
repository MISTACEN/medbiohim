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
      .from("user_preferences")
      .select("user_id,preferences,created_at,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[settings:read]", { code: error.code, message: error.message, requestId: rid });
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить настройки", 503, rid);
      return c.json(body, status as 503);
    }

    // A missing row means the user has not saved preferences yet, not a DB error.
    return c.json(ok(data || { user_id: user.id, preferences: {}, created_at: null, updated_at: null }, rid));
  } catch (error) {
    console.error("[settings:read]", { error: String(error), requestId: rid });
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить настройки", 503, rid);
    return c.json(body, status as 503);
  }
});

settings.patch("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = await c.req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const { body, status } = fail("VALIDATION_ERROR", "Ожидался объект настроек", 400, rid);
      return c.json(body, status as 400);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }

  const preferences = payload.preferences ?? payload;
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    const { body, status } = fail("VALIDATION_ERROR", "Поле preferences должно быть объектом", 400, rid);
    return c.json(body, status as 400);
  }

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("user_id,preferences,created_at,updated_at")
      .single();

    if (error) {
      console.error("[settings:write]", { code: error.code, message: error.message, requestId: rid });
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить настройки", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch (error) {
    console.error("[settings:write]", { error: String(error), requestId: rid });
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить настройки", 503, rid);
    return c.json(body, status as 503);
  }
});

export default settings;
