import { Hono } from "hono";
import type { Env } from "../env";
import { ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/** Compatibility alias GET /api/v1/me → same as /auth/me */
const me = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

me.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");

  try {
    const [profileRes, rolesRes, groupsRes] = await Promise.all([
      supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("roles(code,name)").eq("user_id", user.id).limit(25),
      supabase
        .from("group_memberships")
        .select("group_id,role_in_group,groups(id,name,specialty_slug,course_number,is_active)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(50),
    ]);

    const roles = (rolesRes.data || []).flatMap((row: any) => {
      const r = row?.roles;
      const list = Array.isArray(r) ? r : r ? [r] : [];
      return list.map((x: any) => String(x?.code || "")).filter(Boolean);
    });

    const groups = (groupsRes.data || []).map((row: any) => {
      const g = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      if (!g || g.is_active === false) return null;
      return {
        id: g.id ?? row.group_id,
        name: g.name,
        specialty_slug: g.specialty_slug,
        course: g.course_number ?? null,
        course_number: g.course_number ?? null,
        semester: profileRes.data?.semester ?? null,
        membership_role: row.role_in_group,
      };
    }).filter(Boolean);

    const current = groups[0] || null;

    return c.json(
      ok(
        {
          user: { id: user.id, email: user.email, ...(profileRes.data || {}) },
          roles,
          groups,
          current_group: current,
          course: current?.course ?? null,
          semester: current?.semester ?? null,
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
          course: null,
          semester: null,
        },
        rid
      )
    );
  }
});

export default me;
