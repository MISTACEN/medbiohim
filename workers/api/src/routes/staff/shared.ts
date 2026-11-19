import { FIX_TABLES, isUuid } from "../../lib/quickfix";
import type { FixTarget } from "../../lib/quickfix";

import { fail } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MANAGERS = ["moderator", "admin"];

type MembershipSummary = {
  group_id: string;
  group_name: string | null;
  course_number: number | null;
  semester: number | null;
  stream: string | null;
  role_in_group: string;
  subgroup: string | null;
};

export function dbFor(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

export async function rolesOf(c: any): Promise<string[]> {
  const { data, error } = await c.get("supabase")
    .from("user_roles").select("roles(code)").eq("user_id", c.get("user").id).limit(20);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "").toLowerCase();
  }).filter(Boolean);
}

export async function membershipsOf(c: any): Promise<MembershipSummary[]> {
  const { data } = await dbFor(c).from("group_memberships")
    .select("group_id,role_in_group,subgroup,groups(id,name,course_number,semester,stream,is_active)")
    .eq("user_id", c.get("user").id).eq("is_active", true).limit(50);
  return (data || []).map((row: any) => {
    const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
    return {
      group_id: row.group_id,
      group_name: group?.name ?? null,
      course_number: group?.course_number ?? null,
      semester: group?.semester ?? null,
      stream: group?.stream ?? null,
      role_in_group: row.role_in_group || "student",
      subgroup: row.subgroup || null,
    };
  });
}

export async function isStarostaOf(c: any, groupId: string): Promise<boolean> {
  const db = dbFor(c);
  const { data } = await db.from("group_memberships").select("role_in_group")
    .eq("group_id", groupId).eq("user_id", c.get("user").id).eq("is_active", true).maybeSingle();
  if (String(data?.role_in_group || "") === "starosta") return true;
  return (await rolesOf(c)).includes("admin");
}

export function error(c: any, rid: string, status: number, code: string, message: string, details?: unknown) {
  const { body, status: responseStatus } = fail(code, message, status, rid, details as any);
  return c.json(body, responseStatus as any);
}

export async function notifyUser(c: any, userId: string, kind: string, title: string, body: string, href?: string) {
  try {
    await dbFor(c).from("notifications").insert({
      user_id: userId, kind, title, body: body.slice(0, 1000), href: href || null,
    });
  } catch (notificationError) {
    console.error("[staff:notify]", notificationError);
  }
}

export async function adminIds(c: any): Promise<string[]> {
  try {
    const db = dbFor(c);
    const { data: roleRows } = await db.from("roles").select("id,code").in("code", MANAGERS);
    const ids = (roleRows || []).map((role: any) => role.id);
    if (!ids.length) return [];
    const { data: people } = await db.from("user_roles").select("user_id").in("role_id", ids).limit(1000);
    const found: string[] = [...new Set<string>(((people || []) as any[]).map((row: any) => String(row.user_id)))];
    return found.filter((id) => id !== String(c.get("user").id));
  } catch {
    return [];
  }
}

export async function notifyManagers(c: any, title: string, body: string, href: string) {
  for (const userId of await adminIds(c)) await notifyUser(c, userId, "moderation", title, body, href);
}

export async function readTarget(c: any, target: FixTarget, id: string) {
  if (!isUuid(id)) return { row: null, error: "Некорректный идентификатор" };
  const table = FIX_TABLES[target];
  const { data, error: readError } = await dbFor(c).from(table).select("*").eq("id", id).maybeSingle();
  if (readError) throw readError;
  return { row: data, error: data ? null : "Запись не найдена" };
}

export async function recordContentVersion(c: any, table: string, id: string, data: any, actorId: string, source: string) {
  if (!["questions", "tests", "materials"].includes(table)) return;
  const db = dbFor(c);
  const { data: rows } = await db.from("content_versions").select("version_no")
    .eq("table_name", table).eq("row_key", JSON.stringify({ id }))
    .order("version_no", { ascending: false }).limit(1);
  const versionNo = Number(rows?.[0]?.version_no || 0) + 1;
  await db.from("content_versions").insert({
    table_name: table, row_key: { id }, version_no: versionNo, data, source, actor_user_id: actorId,
  });
}
