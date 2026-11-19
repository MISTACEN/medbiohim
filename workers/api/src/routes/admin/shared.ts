import type { Hono } from "hono";
import { fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";

import { bodyJson } from "../../lib/request-body";

export { bodyJson };

export type AdminApp = Hono<{ Bindings: Env; Variables: AuthVariables }>;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Преподаватель не получает админские инструменты: его рабочее место —
// /teacher/*. Общие контентные операции остаются за админом и модератором.
export const MANAGERS = ["admin", "moderator"];
export const STRICT_ADMINS = ["admin"];
// Банк экзаменационных вопросов и банк вопросов — общий контент: преподаватель
// ведёт личные вопросы через /my-questions, а не через админский редактор.
export const CONTENT_MODERATORS = ["admin", "moderator"];
export const LECTURE_FIELDS = ["title","subject","subject_id","subject_slug","topic","lesson_type","body_md","body_html","summary","media","sources","attachments","related_learning","curriculum","generation"];
export const QUESTION_FIELDS = ["subject","subject_name","subject_slug","topic","type","text","answer","is_published","kind","for_exam","for_ticket"];
export const IMPORT_TABLES = new Set(["questions","tests","test_questions","materials","content_sources","trainer_feed_cards"]);

export function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}
export async function hasRole(c: any, allowed: string[]) {
  const user = c.get("user");
  const db = c.get("supabase");
  const { data, error: queryError } = await db.from("user_roles").select("roles(code)").eq("user_id", user.id).limit(20);
  if (queryError) throw queryError;
  const codes = (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "");
  });
  return codes.some((role: string) => allowed.includes(role));
}
export async function gate(c: any, allowed = MANAGERS) {
  try {
    if (await hasRole(c, allowed)) return true;
    c.res = error(c, requestId(), 403, "FORBIDDEN", "Недостаточно прав для административной операции");
    return false;
  } catch {
    c.res = error(c, requestId(), 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
    return false;
  }
}
export function pick(input: any, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(input || {}, key)) out[key] = input[key];
  return out;
}
export function validText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
// The route has already enforced the strict admin role before these helpers run.
// Use the user's RLS client first; use the service client only if that scoped call
// fails, so an RLS policy rollout cannot strand the admin dashboard.
export async function readAnnouncements(c: any) {
  const read = (db: any) => db.from("site_content").select("payload").eq("key", "announcements").maybeSingle();
  let result = await read(c.get("supabase"));
  if (result.error) {
    const service = createServiceClient(c.env);
    if (service) result = await read(service);
  }
  if (result.error) throw result.error;
  return result.data?.payload;
}
export async function writeAnnouncements(c: any, payload: unknown, updatedAt: string) {
  const write = (db: any) => db.from("site_content")
    .upsert({ key: "announcements", payload, updated_at: updatedAt }, { onConflict: "key" });
  let result = await write(c.get("supabase"));
  if (result.error) {
    const service = createServiceClient(c.env);
    if (service) result = await write(service);
  }
  if (result.error) throw result.error;
}
