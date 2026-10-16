import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const groups = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

groups.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("group_memberships")
      .select("group_id, role, is_active, groups(id,name,specialty_slug,course,semester)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(50);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Группы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((row: any) => ({
      ...(row.groups || {}),
      membership_role: row.role,
    }));
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Группы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

groups.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    const { data, error } = await supabase
      .from("groups")
      .select("id,name,specialty_slug,course,semester")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Группа недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Группа не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Группа недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default groups;
