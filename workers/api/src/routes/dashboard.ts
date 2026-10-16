import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const dashboard = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

dashboard.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");

  try {
    // Minimal dashboard: profile + groups. Expand as tables are confirmed under RLS.
    const [profileRes, groupsRes] = await Promise.all([
      supabase.from("users").select("id,email,full_name,display_name,avatar_url").eq("id", user.id).maybeSingle(),
      supabase
        .from("group_memberships")
        .select("group_id, groups(id,name,specialty_slug,course,semester)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(20),
    ]);

    return c.json(
      ok(
        {
          profile: profileRes.data || { id: user.id, email: user.email },
          groups: (groupsRes.data || []).map((r: any) => r.groups).filter(Boolean),
          generated_at: new Date().toISOString(),
        },
        rid
      )
    );
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Данные временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

export default dashboard;
