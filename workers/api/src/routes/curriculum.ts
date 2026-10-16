import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const curriculum = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

curriculum.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("curriculum_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .limit(1000);
    if (error) {
      const alt = await supabase.from("site_content").select("*").eq("type", "curriculum").limit(100);
      if (alt.error) {
        const { body, status } = fail("DB_UNAVAILABLE", "Учебный план недоступен", 503, rid);
        return c.json(body, status as 503);
      }
      return c.json(ok({ items: alt.data || [] }, rid));
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Учебный план недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default curriculum;
