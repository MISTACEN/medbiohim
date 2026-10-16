import { BlobError, Bucket } from "@upstash/blob";
import { Hono } from "hono";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const files = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain",
]);

function getBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token }) : null;
}

function cleanName(name: string): string {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-100) || "upload.bin";
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hasSpecialtyAccess(supabase: any, userId: string, specialty: string): Promise<boolean> {
  if (!specialty) return true;
  const { data: groups, error: groupsError } = await supabase
    .from("groups").select("id").eq("specialty_slug", specialty).eq("is_active", true);
  if (groupsError) throw groupsError;
  const ids = (groups || []).map((group: { id: string }) => group.id).filter(Boolean);
  if (!ids.length) return false;
  const { data: memberships, error: membershipError } = await supabase
    .from("group_memberships").select("group_id")
    .eq("user_id", userId).eq("is_active", true).in("group_id", ids).limit(1);
  if (membershipError) throw membershipError;
  return Array.isArray(memberships) && memberships.length > 0;
}

async function readAccessibleFile(c: any, id: string) {
  const rid = requestId();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    const { body, status } = fail("NOT_FOUND", "Файл не найден", 404, rid);
    return { response: c.json(body, status as 404), file: null };
  }
  const supabase = c.get("supabase");
  const user = c.get("user");
  const { data: file, error } = await supabase.from("files").select("*").eq("id", id).eq("status", "active").maybeSingle();
  if (error) {
    console.error("[files:metadata]", { code: error.code, message: error.message, requestId: rid });
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось получить метаданные файла", 503, rid);
    return { response: c.json(body, status as 503), file: null };
  }
  if (!file) {
    const { body, status } = fail("NOT_FOUND", "Файл не найден", 404, rid);
    return { response: c.json(body, status as 404), file: null };
  }
  const rawSpecialty = String(file.specialty_slug || "").trim();
  const requiredSpecialty = rawSpecialty === "histology" || rawSpecialty === "mbh" ? "mbh" : rawSpecialty;
  try {
    if (!(await hasSpecialtyAccess(supabase, user.id, requiredSpecialty))) {
      const { body, status } = fail("FORBIDDEN", "Этот файл недоступен для вашей специальности", 403, rid);
      return { response: c.json(body, status as 403), file: null };
    }
  } catch (specialtyError) {
    console.error("[files:specialty]", { error: String(specialtyError), requestId: rid });
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось проверить доступ к файлу", 503, rid);
    return { response: c.json(body, status as 503), file: null };
  }
  return { response: null, file };
}

files.post("/upload", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("STORAGE_NOT_CONFIGURED", "Хранилище Upstash Blob не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  let form: FormData;
  try { form = await c.req.formData(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Ожидается multipart/form-data с полем file", 400, rid);
    return c.json(body, status as 400);
  }
  const value = form.get("file");
  if (!value || typeof value !== "object" || !("size" in value) || !("arrayBuffer" in value) || !("name" in value) || !("type" in value)) {
    const { body, status } = fail("VALIDATION_ERROR", "Файл не передан", 422, rid);
    return c.json(body, status as 422);
  }
  const file = value as File;
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    const { body, status } = fail("FILE_SIZE", "Размер файла должен быть от 1 байта до 12 МБ", 413, rid);
    return c.json(body, status as 413);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    const { body, status } = fail("FILE_TYPE", "Этот тип файла не разрешён", 415, rid);
    return c.json(body, status as 415);
  }

  const user = c.get("user");
  const supabase = c.get("supabase");
  const originalName = String(form.get("original_name") || file.name).trim().slice(0, 255) || "upload.bin";
  const groupIdValue = String(form.get("group_id") || "").trim();
  const groupId = groupIdValue || null;
  const visibility = String(form.get("visibility") || "group").trim();
  const specialtySlug = String(form.get("specialty_slug") || "").trim().toLowerCase();
  if (!["group", "public"].includes(visibility) || specialtySlug.length > 64 || (specialtySlug && !/^[a-z0-9-]+$/.test(specialtySlug))) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректная видимость или специальность файла", 422, rid);
    return c.json(body, status as 422);
  }
  if (groupId) {
    const { data: group, error: groupError } = await supabase.from("groups").select("id,is_active").eq("id", groupId).maybeSingle();
    if (groupError) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось проверить учебную группу", 503, rid);
      return c.json(body, status as 503);
    }
    if (!group || group.is_active !== true) {
      const { body, status } = fail("GROUP_NOT_FOUND", "Учебная группа не найдена или неактивна", 422, rid);
      return c.json(body, status as 422);
    }
    const { data: membership, error: membershipError } = await supabase.from("group_memberships")
      .select("group_id").eq("group_id", groupId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (membershipError) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось проверить членство в группе", 503, rid);
      return c.json(body, status as 503);
    }
    const { data: profile, error: profileError } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    if (profileError) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось проверить роль пользователя", 503, rid);
      return c.json(body, status as 503);
    }
    const isStaff = ["teacher", "moderator", "admin"].includes(String(profile?.role || ""));
    if (!membership && !isStaff) {
      const { body, status } = fail("FORBIDDEN", "Вы не состоите в указанной учебной группе", 403, rid);
      return c.json(body, status as 403);
    }
  }

  const key = `users/${user.id}/${crypto.randomUUID()}-${cleanName(originalName)}`;
  try {
    const digest = await sha256Hex(file);
    await bucket.put(key, file, { contentType: file.type, cache: "no-store" });
    const { data: meta, error: insertError } = await supabase.from("files").insert({
      original_name: originalName,
      mime_type: file.type,
      size_bytes: file.size,
      object_key: key,
      uploaded_by: user.id,
      group_id: groupId,
      visibility,
      specialty_slug: specialtySlug || null,
      sha256: digest,
      storage_provider: "upstash_blob",
      processing_status: "ready",
      status: "active",
    }).select("*").single();
    if (insertError || !meta) {
      try { await bucket.del(key); } catch { /* best-effort rollback of the binary object */ }
      console.error("[files:upload-metadata]", { code: insertError?.code, message: insertError?.message, requestId: rid });
      const { body, status } = fail("DB_UNAVAILABLE", "Файл загружен не был сохранён в каталоге", 503, rid);
      return c.json(body, status as 503);
    }
    const signed = await bucket.signedReadUrl(key);
    return c.json(ok({ file: meta, download: { status: "ready", url: signed.url, expires_in: 3600 } }, rid), 201);
  } catch (error) {
    console.error("[files:upload]", { error: String(error), requestId: rid });
    const { body, status } = fail("UPLOAD_FAILED", "Не удалось сохранить файл", 502, rid);
    return c.json(body, status as 502);
  }
});

files.get("/:id/download", requireAuth, async (c) => {
  const rid = requestId();
  const access = await readAccessibleFile(c, c.req.param("id") || "");
  if (access.response) return access.response;
  const file = access.file;
  const key = typeof file.object_key === "string" ? file.object_key : "";
  if (!key.startsWith(`users/${c.get("user").id}/`) && !key.startsWith("histology/")) {
    const { body, status } = fail("FILE_UNAVAILABLE", "Этот файл хранится в неподключённом архивном хранилище", 503, rid);
    return c.json(body, status as 503);
  }
  const bucket = getBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("STORAGE_NOT_CONFIGURED", "Хранилище Upstash Blob не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const signed = await bucket.signedReadUrl(key);
    return c.redirect(signed.url, 302);
  } catch (error) {
    if (BlobError.is(error) && error.code === "not_found") {
      const { body, status } = fail("NOT_FOUND", "Файл не найден", 404, rid);
      return c.json(body, status as 404);
    }
    console.error("[files:download]", { error: String(error), requestId: rid });
    const { body, status } = fail("STORAGE_ERROR", "Не удалось открыть файл", 502, rid);
    return c.json(body, status as 502);
  }
});

files.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const access = await readAccessibleFile(c, c.req.param("id"));
  if (access.response) return access.response;
  const file = { ...access.file };
  delete file.b2_file_id;
  const key = typeof file.object_key === "string" ? file.object_key : "";
  let download: Record<string, unknown> = { status: "unavailable", url: null, expires_in: null };
  if (key.startsWith(`users/${c.get("user").id}/`) || key.startsWith("histology/")) {
    const bucket = getBucket(c.env);
    if (bucket) {
      try {
        const signed = await bucket.signedReadUrl(key);
        download = { status: "ready", url: signed.url, expires_in: 3600 };
      } catch {
        download = { status: "unavailable", url: null, expires_in: null };
      }
    }
  }
  return c.json(ok({ file, download }, rid));
});

export default files;
