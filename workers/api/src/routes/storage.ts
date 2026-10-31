import { Hono } from "hono";
import { BlobError } from "@upstash/blob";
import { getStorageBackend } from "../lib/b2";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const storage = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
// Аватар — маленькая картинка, которую грузят с телефона: отдельный лимит,
// чтобы нельзя было залить 12 МБ в профиль и замедлить ленту сообщества.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

// B2 (если настроен) → Upstash → null. Единая поверхность put/get/del/signedReadUrl.
function getBucket(env: Env) {
  return getStorageBackend(env);
}

function safeKey(value: string | null): string | null {
  if (!value || value.length > 500) return null;
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === "." || part === "..")) return null;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return null;
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
    const { body, status } = fail("NOT_CONFIGURED", "Файловое хранилище не настроено", 503, rid);
    return c.json(body, status as 503);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    const { body, status } = fail("VALIDATION", "Ожидается multipart/form-data с полем file", 400, rid);
    return c.json(body, status as 400);
  }
  const fileValue: unknown = form.get("file");
  if (
    !fileValue ||
    typeof fileValue !== "object" ||
    !("size" in fileValue) ||
    !("type" in fileValue) ||
    !("name" in fileValue) ||
    !("arrayBuffer" in fileValue)
  ) {
    const { body, status } = fail("VALIDATION", "Файл не передан", 400, rid);
    return c.json(body, status as 400);
  }
  const file = fileValue as File;
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
    await bucket.put(key, file, { contentType: file.type, cache: "no-store" });
    const signed = await bucket.signedReadUrl(key);
    return c.json(ok({ key, url: signed.url, expires_at: signed.expiresAt, name: file.name, size: file.size, content_type: file.type }, rid), 201);
  } catch (error) {
    console.error("[storage:upload]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось загрузить файл", 502, rid);
    return c.json(body, status as 502);
  }
});

storage.post("/histology-import", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const bucket = getBucket(c.env);
  if (!bucket) return c.json(fail("NOT_CONFIGURED", "Файловое хранилище не настроено", 503, rid).body, 503);

  // Import is deliberately restricted to administrators; never trust a client-supplied path alone.
  const { data: roleRows, error: roleError } = await db.from("user_roles")
    .select("roles(code)").eq("user_id", user.id).limit(20);
  if (roleError) return c.json(fail("ROLE_CHECK_UNAVAILABLE", "Не удалось проверить права", 503, rid).body, 503);
  const roles = (roleRows || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "");
  });
  if (!roles.includes("admin")) return c.json(fail("FORBIDDEN", "Импорт доступен только администратору", 403, rid).body, 403);

  let form: FormData;
  try { form = await c.req.formData(); }
  catch { return c.json(fail("VALIDATION", "Ожидается multipart/form-data", 400, rid).body, 400); }
  const fileValue: any = form.get("file");
  const key = safeKey(String(form.get("key") || ""));
  const overwrite = String(form.get("overwrite") || "") === "1";
  if (!key || !key.startsWith("histology/") || key.length > 1024) {
    return c.json(fail("INVALID_KEY", "Разрешены только ключи histology/", 400, rid).body, 400);
  }
  if (!fileValue || typeof fileValue !== "object" || typeof fileValue.arrayBuffer !== "function" || typeof fileValue.size !== "number") {
    return c.json(fail("VALIDATION", "Файл не передан", 400, rid).body, 400);
  }
  if (fileValue.size < 1 || fileValue.size > 25 * 1024 * 1024) {
    return c.json(fail("FILE_SIZE", "Размер файла должен быть до 25 МБ", 413, rid).body, 413);
  }
  const allowedExt = /\.(?:jpe?g|png|gif|webp|bmp|pdf|docx?|txt|md|json)$/i;
  if (!allowedExt.test(key)) return c.json(fail("FILE_TYPE", "Тип файла не разрешён", 415, rid).body, 415);
  try {
    if (!overwrite) {
      try {
        const existing = await bucket.get(key);
        if (existing) return c.json(ok({ key, status: "already_exists", size: fileValue.size }, rid));
      } catch (error) {
        if (!(BlobError.is(error) && error.code === "not_found")) throw error;
      }
    }
    const contentType = String(fileValue.type || "application/octet-stream").slice(0, 120);
    await bucket.put(key, fileValue, { contentType, cache: "no-store" });
    return c.json(ok({ key, status: "uploaded", size: fileValue.size, content_type: contentType }, rid), 201);
  } catch (error) {
    console.error("[storage:histology-import]", error);
    return c.json(fail("STORAGE_ERROR", "Не удалось импортировать файл в Upstash Blob", 502, rid).body, 502);
  }
});

storage.get("/signed-url", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  const key = safeKey(c.req.query("key") ?? null);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Файловое хранилище не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  if (!key || !canReadKey(key, c.get("user").id)) {
    const { body, status } = fail("INVALID_KEY", "Недопустимый ключ файла", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const signed = await bucket.signedReadUrl(key);
    return c.json(ok({ key, url: signed.url, expires_at: signed.expiresAt }, rid));
  } catch (error) {
    console.error("[storage:signed-url]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось получить ссылку на файл", 502, rid);
    return c.json(body, status as 502);
  }
});


storage.get("/object", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  const key = safeKey(c.req.query("key") ?? null);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Файловое хранилище не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  if (!key || !canReadKey(key, c.get("user").id)) {
    const { body, status } = fail("INVALID_KEY", "Недопустимый ключ файла", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const object = await bucket.get(key);
    return new Response(object.body, {
      headers: {
        "content-type": object.contentType || "application/octet-stream",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (BlobError.is(error) && error.code === "not_found") {
      const { body, status } = fail("NOT_FOUND", "Файл не найден", 404, rid);
      return c.json(body, status as 404);
    }
    console.error("[storage:get]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось прочитать файл", 502, rid);
    return c.json(body, status as 502);
  }
});

storage.delete("/object", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  const key = safeKey(c.req.query("key") ?? null);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Файловое хранилище не настроено", 503, rid);
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

// --- SA3: аватар профиля -------------------------------------------------
// Файл кладётся по уникальному ключу (uuid в имени), поэтому старую картинку
// можно удалить сразу, а новая ссылка не столкнётся с кэшем браузера.

type AvatarRow = { avatar_key: string | null };

async function readAvatarKey(supabase: any, userId: string): Promise<{ key: string | null; error: unknown }> {
  const { data, error } = await supabase
    .from("users")
    .select("avatar_key")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { key: null, error };
  return { key: (data as AvatarRow | null)?.avatar_key ?? null, error: null };
}

storage.post("/avatar", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Хранилище для аватара не настроено", 503, rid);
    return c.json(body, status as 503);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    const { body, status } = fail("VALIDATION", "Ожидается multipart/form-data с полем file", 400, rid);
    return c.json(body, status as 400);
  }
  const fileValue: unknown = form.get("file");
  if (
    !fileValue ||
    typeof fileValue !== "object" ||
    !("size" in fileValue) ||
    !("type" in fileValue) ||
    !("arrayBuffer" in fileValue)
  ) {
    const { body, status } = fail("VALIDATION", "Файл не передан", 400, rid);
    return c.json(body, status as 400);
  }
  const file = fileValue as File;
  const ext = AVATAR_TYPES.get(file.type);
  if (!ext) {
    const { body, status } = fail("FILE_TYPE", "Аватар может быть только JPEG, PNG или WebP", 415, rid);
    return c.json(body, status as 415);
  }
  if (file.size < 1 || file.size > MAX_AVATAR_BYTES) {
    const { body, status } = fail("FILE_SIZE", "Размер аватара должен быть от 1 байта до 2 МБ", 413, rid);
    return c.json(body, status as 413);
  }

  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const previous = await readAvatarKey(supabase, user.id);
    if (previous.error) throw previous.error;

    const key = `users/${user.id}/avatars/${crypto.randomUUID()}.${ext}`;
    // Upstash Blob принимает только Duration | 'immutable' | 'revalidate' | 'no-store'
    // в cache — сырая строка Cache-Control роняет put. Час достаточно: ссылка на
    // файл отдаётся через приватный прокси и меняется вместе с uuid ключа.
    await bucket.put(key, file, { contentType: file.type, cache: "1h" });

    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_key: key })
      .eq("id", user.id);
    if (updateError) {
      // Файл уже в хранилище, но профиль не обновлён — убираем сироту.
      try { await bucket.del(key); } catch { /* best effort */ }
      throw updateError;
    }

    if (previous.key && previous.key !== key) {
      try { await bucket.del(previous.key); } catch (cleanupError) {
        // Не роняем успешную загрузку из-за неудачной уборки старого файла.
        console.error("[storage:avatar:cleanup]", cleanupError);
      }
    }

    return c.json(ok({ avatar_key: key, avatar_url: `/api/v1/storage/avatar/${encodeURIComponent(user.id)}` }, rid), 201);
  } catch (error) {
    console.error("[storage:avatar:upload]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось сохранить аватар", 502, rid);
    return c.json(body, status as 502);
  }
});

storage.get("/avatar/:userId", requireAuth, async (c) => {
  const rid = requestId();
  const bucket = getBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Хранилище для аватара не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  const userId = String(c.req.param("userId") || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    const { body, status } = fail("VALIDATION", "Некорректный идентификатор пользователя", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    const { key, error } = await readAvatarKey(c.get("supabase"), userId);
    if (error) throw error;
    if (!key) {
      const { body, status } = fail("NOT_FOUND", "У пользователя нет загруженного аватара", 404, rid);
      return c.json(body, status as 404);
    }
    const object = await bucket.get(key);
    return new Response(object.body, {
      headers: {
        "content-type": object.contentType || "application/octet-stream",
        // Ключ уникален для каждой загрузки, поэтому кэш безопасен.
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (BlobError.is(error) && error.code === "not_found") {
      // Ключ в профиле есть, объекта нет: показываем честный 404, а не 502.
      const { body, status } = fail("NOT_FOUND", "Файл аватара не найден", 404, rid);
      return c.json(body, status as 404);
    }
    console.error("[storage:avatar:get]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось прочитать аватар", 502, rid);
    return c.json(body, status as 502);
  }
});

storage.delete("/avatar", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const bucket = getBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Хранилище для аватара не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { key, error } = await readAvatarKey(supabase, user.id);
    if (error) throw error;
    if (!key) {
      const { body, status } = fail("NOT_FOUND", "Загруженного аватара нет", 404, rid);
      return c.json(body, status as 404);
    }
    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_key: null })
      .eq("id", user.id);
    if (updateError) throw updateError;
    try { await bucket.del(key); } catch (cleanupError) {
      console.error("[storage:avatar:delete-object]", cleanupError);
    }
    return c.json(ok({ deleted: true }, rid));
  } catch (error) {
    console.error("[storage:avatar:delete]", error);
    const { body, status } = fail("STORAGE_ERROR", "Не удалось удалить аватар", 502, rid);
    return c.json(body, status as 502);
  }
});

export default storage;
