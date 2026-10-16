import { Hono } from "hono";
import { Bucket } from "@upstash/blob";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const storage = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function getBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token }) : null;
}

function safeKey(value: string | null): string | null {
  if (!value || value.length > 500) return null;
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === "." || part === "..")) return null;
  if (!/^[a-zA-Z0-9/_ .-]+$/.test(value)) return null;
  return value;
}

function canReadKey(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/`) || key.startsWith("histology/");
}

function canDeleteKey(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/`);
}

storage.post("/upload", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Хранилище Upstash Blob не настроено", 503, rid);
    return c.json(body, status as 503);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    const { body, status } = fail("VALIDATION", "Ожидается multipart/form-data с полем file", 400, rid);
    return c.json(body, status as 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    const { body, status } = fail("VALIDATION", "Файл не передан", 400, rid);
    return c.json(body, status as 400);
  }
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    const { body, status } = fail("FILE_SIZE", "Размер файла должен быть от 1 байта до 12 МБ", 413, rid);
    return c.json(body, status as 413);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    const { body, status } = fail("FILE_TYPE", "Этот тип файла не разрешён", 415, rid);
    return c.json(body, status as 415);
  }

  const user = c.get("user");
  const cleanName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-100) || "upload.bin";
  const key = `users/${user.id}/${crypto.randomUUID()}-${cleanName}`;
  try {
    await bucket.put(key, file);
    const url = await bucket.signedReadUrl(key);
    return c.json(ok({ key, url, name: file.name, size: file.size, content_type: file.type }, rid), 201);
  } catch (error) {
    console.error("[storage:upload]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось загрузить файл", 502, rid);
    return c.json(body, status as 502);
  }
});

storage.get("/signed-url", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  const key = safeKey(c.req.query("key") ?? null);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Хранилище Upstash Blob не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  if (!key || !canReadKey(key, c.get("user").id)) {
    const { body, status } = fail("INVALID_KEY", "Недопустимый ключ файла", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const url = await bucket.signedReadUrl(key);
    return c.json(ok({ key, url }, rid));
  } catch (error) {
    console.error("[storage:signed-url]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось получить ссылку на файл", 502, rid);
    return c.json(body, status as 502);
  }
});

storage.delete("/object", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  const key = safeKey(c.req.query("key") ?? null);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Хранилище Upstash Blob не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  if (!key || !canDeleteKey(key, c.get("user").id)) {
    const { body, status } = fail("INVALID_KEY", "Удалять можно только собственные загруженные файлы", 403, rid);
    return c.json(body, status as 403);
  }
  try {
    await bucket.del(key);
    return c.json(ok({ deleted: true, key }, rid));
  } catch (error) {
    console.error("[storage:delete]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось удалить файл", 502, rid);
    return c.json(body, status as 502);
  }
});

export default storage;
