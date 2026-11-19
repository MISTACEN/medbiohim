import type { Hono } from "hono";
import { fail } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";

export type WorkshopApp = Hono<{ Bindings: Env; Variables: AuthVariables }>;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const STAFF = ["moderator", "admin"];
export const MAX_FILES = 30;
export const MAX_QUESTIONS = 300;

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

export async function isStaff(c: any): Promise<boolean> {
  try {
    const roles = await rolesOf(c);
    return roles.some((role) => STAFF.includes(role));
  } catch {
    return false;
  }
}

export function error(c: any, rid: string, status: number, code: string, message: string, details?: unknown) {
  const { body, status: responseStatus } = fail(code, message, status, rid, details as any);
  return c.json(body, responseStatus as any);
}

export async function readSettings(c: any): Promise<{ moderation_mode: "open" | "manual"; personal_data_warning: boolean }> {
  const { data } = await dbFor(c).from("workshop_settings").select("moderation_mode,personal_data_warning").eq("id", true).maybeSingle();
  return {
    moderation_mode: data?.moderation_mode === "manual" ? "manual" : "open",
    personal_data_warning: data?.personal_data_warning !== false,
  };
}

export function mapItem(row: any, files: any[] = [], questions: any[] = []) {
  if (!row) return null;
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    personal_data_flags: Array.isArray(row.personal_data_flags) ? row.personal_data_flags : [],
    files: files.map((file) => ({
      id: file.id,
      file_id: file.file_id ?? null,
      name: file.original_name,
      mime: file.mime_type,
      size: Number(file.size_bytes || 0),
      position: Number(file.position || 0),
    })),
    questions: questions.map((question) => ({ id: question.id, text: question.text, topic: question.topic ?? null, options: question.options ?? null, answer: question.answer ?? null, position: question.position })),
  };
}

export async function loadItem(c: any, id: string) {
  const db = dbFor(c);
  const [{ data: item }, { data: files }, { data: questions }] = await Promise.all([
    db.from("workshop_items").select("*").eq("id", id).maybeSingle(),
    db.from("workshop_item_files").select("*").eq("item_id", id).order("position", { ascending: true }),
    db.from("workshop_item_questions").select("*").eq("item_id", id).order("position", { ascending: true }),
  ]);
  return { item, files: files || [], questions: questions || [] };
}

export function snapshotOf(item: any, files: any[], questions: any[]) {
  return {
    title: item.title,
    summary: item.summary,
    kind: item.kind,
    tags: item.tags,
    subject_id: item.subject_id,
    topic: item.topic,
    questions: questions.map((question) => ({ text: question.text, topic: question.topic, position: question.position })),
    files: files.map((file) => ({
      id: file.id,
      file_id: file.file_id,
      object_key: file.object_key,
      original_name: file.original_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      position: file.position,
    })),
  };
}

export async function saveVersion(c: any, item: any, files: any[], questions: any[], actorId: string, note?: string, explicitVersion?: number) {
  const db = dbFor(c);
  const { data: latest } = await db.from("workshop_item_versions")
    .select("version_no").eq("item_id", item.id)
    .order("version_no", { ascending: false }).limit(1);
  const versionNo = explicitVersion ?? Math.max(Number(latest?.[0]?.version_no || 0), Number(item.version_no || 0)) + 1;
  const { error: insertError } = await db.from("workshop_item_versions").insert({
    item_id: item.id,
    version_no: versionNo,
    snapshot: snapshotOf(item, files, questions),
    note: note ? String(note).slice(0, 500) : null,
    created_by: actorId,
  });
  if (insertError) throw insertError;
  return versionNo;
}

export async function notify(c: any, userId: string, title: string, body: string, href?: string, kind = "workshop") {
  try {
    await dbFor(c).from("notifications").insert({ user_id: userId, kind, title, body: body.slice(0, 1000), href: href || null });
  } catch (notificationError) {
    // Уведомление не должно отменять уже сохранённый материал.
    console.error("[workshop:notify]", notificationError);
  }
}

export async function subjectSuggestions(c: any, text: string) {
  const db = dbFor(c);
  const { data } = await db.from("subjects").select("id,name,slug").eq("is_active", true).limit(200);
  const haystack = text.toLowerCase();
  return (data || [])
    .map((subject: any) => {
      const name = String(subject.name || "").toLowerCase();
      const slug = String(subject.slug || "").toLowerCase();
      const stem = name.replace(/(ия|ия|ая|ый|ий)$/u, "").slice(0, 6);
      const match = (name && haystack.includes(name)) || (slug && haystack.includes(slug)) || (stem.length >= 4 && haystack.includes(stem));
      return match ? { id: subject.id, name: subject.name, slug: subject.slug } : null;
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ id: string; name: string; slug: string }>;
}


export async function staffIds(c: any): Promise<string[]> {
  try {
    const db = dbFor(c);
    const { data: roleRows } = await db.from("roles").select("id,code").in("code", STAFF);
    const ids = (roleRows || []).map((role: any) => role.id);
    if (!ids.length) return [];
    const { data: people } = await db.from("user_roles").select("user_id").in("role_id", ids).limit(500);
    const found: string[] = [...new Set<string>(((people || []) as any[]).map((row: any) => String(row.user_id)))];
    return found;
  } catch {
    return [];
  }
}

export async function authorOrStaff(c: any, item: any): Promise<boolean> {
  return String(item?.author_id) === String(c.get("user").id) || await isStaff(c);
}
