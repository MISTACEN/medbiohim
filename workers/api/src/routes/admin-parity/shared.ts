import type { Hono } from "hono";
import type { Env } from "../../env";
import { fail, requestId } from "../../lib/response";
import type { AuthVariables } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";

export type ParityApp = Hono<{ Bindings: Env; Variables: AuthVariables }>;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// teacher исключён намеренно: админские CMS-операции — только admin/moderator.
export const MANAGERS = ["admin", "moderator"];
export const ADMIN_ONLY = ["admin"];
export const CONTENT_MODERATORS = ["admin", "moderator"];
export const VERSION_FIELDS: Record<string, string[]> = {
  questions: ["subject_id", "module_id", "topic_id", "type", "text", "answer", "options", "difficulty", "is_published", "archived_at", "source_key"],
  tests: ["subject_id", "module_id", "topic_id", "title", "time_limit_sec", "max_attempts", "is_published", "archived_at", "source_key", "order_index"],
  materials: ["subject_id", "module_id", "topic_id", "type", "title", "file_id", "external_url", "content_html", "order_index", "is_published", "source_key"],
};

export function responseError(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

export function dbFor(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

export async function roleCodes(c: any): Promise<string[]> {
  const user = c.get("user");
  const { data, error } = await c.get("supabase").from("user_roles").select("roles(code)").eq("user_id", user.id).limit(20);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "").toLowerCase();
  }).filter(Boolean);
}

export async function gate(c: any, allowed: string[] = ADMIN_ONLY): Promise<boolean> {
  try {
    if ((await roleCodes(c)).some((role) => allowed.includes(role))) return true;
    c.res = responseError(c, requestId(), 403, "FORBIDDEN", "Недостаточно прав для административной операции");
  } catch {
    c.res = responseError(c, requestId(), 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
  }
  return false;
}

export async function jsonBody(c: any): Promise<any | null> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export async function recordVersion(db: any, table: string, id: string, data: any, actorId: string, source = "admin_ui") {
  const { data: rows, error: readError } = await db.from("content_versions").select("version_no")
    .eq("table_name", table).eq("row_key", JSON.stringify({ id }))
    .order("version_no", { ascending: false }).limit(1);
  if (readError) throw readError;
  const versionNo = Number(rows?.[0]?.version_no || 0) + 1;
  const { error: insertError } = await db.from("content_versions").insert({
    table_name: table, row_key: { id }, version_no: versionNo, data, source, actor_user_id: actorId,
  });
  if (insertError) throw insertError;
}

export async function countRows(db: any, table: string, column: string, value: string): Promise<number> {
  const { count, error } = await db.from(table).select(column, { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count || 0;
}
