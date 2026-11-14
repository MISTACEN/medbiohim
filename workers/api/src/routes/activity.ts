/**
 * GET /activity?limit=10 — лента учебных событий студента (Фаза 5).
 *
 * Только свои события: RLS owner-select плюс явный фильтр по user_id.
 * Строки пишет служебный клиент (lib/activity.ts), клиент их не создаёт.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const activity = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

activity.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const requested = Number(c.req.query("limit"));
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.trunc(requested))) : 10;
  try {
    const { data, error } = await db
      .from("activity_events")
      .select("id,kind,subject_slug,ref_id,payload,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return c.json(ok({ items: data || [], count: (data || []).length }, rid));
  } catch (error) {
    console.error("[activity:list]", error);
    const missing = String((error as any)?.code || "") === "42P01" || String((error as any)?.code || "") === "PGRST205";
    const { body, status } = fail(
      missing ? "ACTIVITY_NOT_MIGRATED" : "DB_UNAVAILABLE",
      missing ? "Лента появится после применения миграции activity_events" : "Не удалось загрузить ленту",
      missing ? 503 : 503,
      rid,
    );
    return c.json(body, status as 503);
  }
});

export default activity;
