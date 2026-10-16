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
        .select("group_id, role, groups(id,name,specialty_slug,course,semester)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(50),
    ]);

    const roles = (rolesRes.data || []).flatMap((row: any) => {
      const r = row?.roles;
      const list = Array.isArray(r) ? r : r ? [r] : [];
      return list.map((x: any) => String(x?.code || "")).filter(Boolean);
    });

    const groups = (groupsRes.data || []).map((row: any) => ({
      id: row.groups?.id ?? row.group_id,
      name: row.groups?.name,
      specialty_slug: row.groups?.specialty_slug,
      course: row.groups?.course,
      semester: row.groups?.semester,
      membership_role: row.role,
    }));

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
