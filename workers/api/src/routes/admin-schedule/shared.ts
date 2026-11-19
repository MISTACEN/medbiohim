
import { getCallerRoles } from "../../lib/caller-roles";

export { getCallerRoles };

export async function isAdmin(c: any): Promise<boolean> {
  const db = c.get("supabase");
  const user = c.get("user");
  const roles = await getCallerRoles(db, user.id);
  return roles.includes("admin");
}

export async function canResolveCohort(c: any): Promise<boolean> {
  const db = c.get("supabase");
  const user = c.get("user");
  const roles = await getCallerRoles(db, user.id);
  if (["teacher", "moderator", "admin"].some((r) => roles.includes(r))) return true;
  const { data, error } = await db
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("role_in_group", "starosta")
    .eq("is_active", true)
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
