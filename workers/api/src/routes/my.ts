import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/** Personal cabinet secondary endpoints under /api/v1/my */
const my = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const relation = (value: any) => (Array.isArray(value) ? value[0] : value);

my.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const [profileRes, rolesRes, groupsRes, attemptsCount] = await Promise.all([
      supabase.from("users").select("id,email,full_name,display_name,avatar_url,course_number,semester").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("roles(code,name)").eq("user_id", user.id).limit(25),
      supabase
        .from("group_memberships")
        .select("group_id,role_in_group,groups(id,name,specialty_slug,course_number,is_active)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(50),
      supabase
        .from("test_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);
    const roles = (rolesRes.data || []).flatMap((row: any) => {
      const r = row?.roles;
      const list = Array.isArray(r) ? r : r ? [r] : [];
      return list.map((x: any) => String(x?.code || "")).filter(Boolean);
    });
    const groups = (groupsRes.data || [])
      .map((row: any) => {
        const g = relation(row.groups);
        if (!g || g.is_active === false) return null;
        return {
          id: g.id,
          name: g.name,
          specialty_slug: g.specialty_slug,
          course: g.course_number ?? null,
          course_number: g.course_number ?? null,
          semester: profileRes.data?.semester ?? null,
          membership_role: row.role_in_group,
        };
      })
      .filter(Boolean);
    return c.json(
      ok(
        {
          user: { id: user.id, email: user.email, ...(profileRes.data || {}) },
          roles,
          groups,
          current_group: groups[0] || null,
          attempts_count: attemptsCount.count || 0,
        },
        rid
      )
    );
  } catch {
    return c.json(
      ok(
        {
          user: { id: user.id, email: user.email },
          roles: [],
          groups: [],
          current_group: null,
          attempts_count: 0,
        },
        rid
      )
    );
  }
});

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
