import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const sessions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

sessions.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Сессии недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Сессии недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

sessions.post("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: { kind?: string; subject_id?: string; meta?: unknown } = {};
  try {
    payload = await c.req.json();
  } catch {}
  try {
    const { data, error } = await supabase
      .from("study_sessions")
      .insert({
        user_id: user.id,
        kind: payload.kind || "study",
        subject_id: payload.subject_id || null,
        meta: payload.meta || null,
        status: "active",
        started_at: new Date().toISOString(),
      })
      .select("*")
      .maybeSingle();
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

export default sessions;
