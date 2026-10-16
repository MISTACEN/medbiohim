import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const schedule = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

schedule.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const groupId = c.req.query("group_id");

  try {
    let q = supabase
      .from("schedule_entries")
      .select("*")
      .order("starts_at", { ascending: true })
      .limit(500);
    if (from) q = q.gte("starts_at", from);
    if (to) q = q.lte("starts_at", to);
    if (groupId) q = q.eq("group_id", groupId);

    const { data, error } = await q;
    if (error) {
      // fallback table name variants
      const alt = await supabase.from("schedule").select("*").limit(500);
      if (alt.error) {
        const { body, status } = fail("DB_UNAVAILABLE", "Расписание недоступно", 503, rid);
        return c.json(body, status as 503);
      }
      return c.json(ok({ items: alt.data || [] }, rid));
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Расписание недоступно", 503, rid);
    return c.json(body, status as 503);
  }
});

schedule.get("/meta", requireAuth, async (c) => {
  const rid = requestId();
  return c.json(
    ok(
      {
        generated_at: new Date().toISOString(),
        timezone: "Europe/Moscow",
      },
      rid
    )
  );
});

export default schedule;
