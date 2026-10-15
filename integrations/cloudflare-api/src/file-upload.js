import { authenticateSupabaseRequest } from "./supabase-auth.js";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "pdf", "doc", "docx",
  "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "zip",
]);

function failure(status, code, message) { return { ok: false, status, code, message }; }
function safeName(value) {
  const base = String(value || "upload.bin").replace(/\\/g, "/").split("/").pop()
    .replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const normalized = base.replace(/[^\p{L}\p{N}._() -]/gu, "_").replace(/^\.+/, "").slice(0, 180);
  return normalized || "upload.bin";
}
function validHttpsUrl(value, allowedHosts) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !allowedHosts(url.hostname)) return null;
    return url;
  } catch { return null; }
}
async function jsonResponse(fetcher, url, init) {
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || !payload || typeof payload !== "object") throw new Error("Storage request failed");
  return payload;
}
async function authorizeB2(env, fetcher) {
  const keyId = String(env.B2_KEY_ID || "").trim();
  const appKey = String(env.B2_APPLICATION_KEY || "").trim();
  const bucketName = String(env.B2_BUCKET || "").trim();
  if (!keyId || !appKey || !bucketName) return null;
  const auth = await jsonResponse(fetcher, "https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    method: "GET",
    headers: { authorization: "Basic " + btoa(keyId + ":" + appKey), accept: "application/json" },
  });
  const apiUrl = validHttpsUrl(auth.apiUrl, (host) => /^api[0-9]+[.]backblazeb2[.]com$/.test(host));
  if (!apiUrl || !auth.authorizationToken || !auth.accountId) throw new Error("Invalid B2 authorization response");
  let bucketId = String(env.B2_BUCKET_ID || "").trim();
  if (!bucketId) {
    const buckets = await jsonResponse(fetcher, new URL("/b2api/v2/b2_list_buckets", apiUrl).toString(), {
      method: "POST",
      headers: { authorization: String(auth.authorizationToken), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ accountId: String(auth.accountId), bucketName }),
    });
    bucketId = String(buckets.buckets?.find((item) => item.bucketName === bucketName)?.bucketId || "");
  }
  if (!bucketId) throw new Error("B2 bucket not found");
  return { apiUrl, authorizationToken: String(auth.authorizationToken), bucketId, bucketName };
}
async function deleteUploadedObject(storage, fileId, fileName, fetcher) {
  if (!fileId || !storage) return;
  try {
    await jsonResponse(fetcher, new URL("/b2api/v2/b2_delete_file_version", storage.apiUrl).toString(), {
      method: "POST",
      headers: { authorization: storage.authorizationToken, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ fileId, fileName }),
    });
  } catch {
    // Best-effort cleanup. The caller still receives a failure and no metadata is exposed.
  }
}
async function uploadToB2(storage, objectKey, bytes, mimeType, sha256, fetcher) {
  const info = await jsonResponse(fetcher, new URL("/b2api/v2/b2_get_upload_url", storage.apiUrl).toString(), {
    method: "POST",
    headers: { authorization: storage.authorizationToken, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ bucketId: storage.bucketId }),
  });
  const uploadUrl = validHttpsUrl(info.uploadUrl, (host) => host.endsWith(".backblaze.com") || host.endsWith(".backblazeb2.com"));
  if (!uploadUrl || !info.authorizationToken) throw new Error("Invalid B2 upload endpoint");
  const response = await fetcher(uploadUrl.toString(), {
    method: "POST",
    headers: {
      authorization: String(info.authorizationToken),
      "x-bz-file-name": encodeURIComponent(objectKey),
      "content-type": mimeType,
      "x-bz-content-sha1": sha256,
    },
    body: bytes,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || typeof payload?.fileId !== "string" || typeof payload?.fileName !== "string") {
    throw new Error("B2 upload failed");
  }
  return { fileId: payload.fileId, fileName: payload.fileName };
}

export async function uploadSupabaseFile(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data;")) return failure(415, "UNSUPPORTED_MEDIA_TYPE", "Загрузите файл через multipart/form-data");
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_FILE_BYTES + 128 * 1024) return failure(413, "PAYLOAD_TOO_LARGE", "Максимальный размер файла — 15 МБ");

  let form;
  try { form = await request.formData(); }
  catch { return failure(422, "VALIDATION_ERROR", "Некорректная multipart-загрузка"); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) return failure(422, "VALIDATION_ERROR", "Необходимо приложить файл в поле file");
  if (file.size > MAX_FILE_BYTES) return failure(413, "PAYLOAD_TOO_LARGE", "Максимальный размер файла — 15 МБ");

  const name = safeName(form.get("original_name") || file.name);
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) return failure(415, "FILE_TYPE_NOT_ALLOWED", "Этот тип файла не поддерживается");
  const mimeType = String(file.type || "application/octet-stream").slice(0, 160);
  const groupId = String(form.get("group_id") || "").trim();
  const specialtySlug = String(form.get("specialty_slug") || "").trim();
  if (groupId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) {
    return failure(422, "VALIDATION_ERROR", "Некорректный идентификатор группы");
  }
  if (specialtySlug && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(specialtySlug)) {
    return failure(422, "VALIDATION_ERROR", "Некорректный код специальности");
  }
  const visibility = String(form.get("visibility") || "group");
  if (!["group", "public"].includes(visibility)) return failure(422, "VALIDATION_ERROR", "Недопустимый режим доступа к файлу");
  if (visibility === "public") return failure(403, "FORBIDDEN", "Публичная публикация файлов через этот маршрут не разрешена");

  const storageConfigPresent = env.B2_KEY_ID && env.B2_APPLICATION_KEY && env.B2_BUCKET;
  if (!storageConfigPresent) return failure(503, "FILE_STORAGE_NOT_CONFIGURED", "Приватное хранилище загрузок не настроено");
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) return failure(503, "DB_NOT_CONFIGURED", "Хранилище метаданных не настроено");

  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:") throw new Error("protocol");
  } catch { return failure(503, "DB_NOT_CONFIGURED", "Некорректный адрес хранилища метаданных"); }

  let storage = null;
  let uploaded = null;
  let objectKey = "";
  try {
    storage = await authorizeB2(env, fetcher);
    if (!storage) return failure(503, "FILE_STORAGE_NOT_CONFIGURED", "Приватное хранилище загрузок не настроено");
    const bytes = await file.arrayBuffer();
    const [sha256Digest, sha1Digest] = await Promise.all([
      crypto.subtle.digest("SHA-256", bytes),
      crypto.subtle.digest("SHA-1", bytes),
    ]);
    const toHex = (digest) => [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
    const sha256 = toHex(sha256Digest);
    const sha1 = toHex(sha1Digest);
    objectKey = "uploads/" + identity.user.id + "/" + crypto.randomUUID() + "/" + name;
    uploaded = await uploadToB2(storage, objectKey, bytes, mimeType, sha1, fetcher);

    const endpoint = new URL("/rest/v1/rpc/medbiohim_create_file_record", base);
    const rpcResponse = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: request.headers.get("authorization") || "",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        p_original_name: name,
        p_mime_type: mimeType,
        p_size_bytes: file.size,
        p_object_key: objectKey,
        p_b2_file_id: uploaded.fileId,
        p_group_id: groupId || null,
        p_visibility: visibility,
        p_specialty_slug: specialtySlug || null,
        p_sha256: sha256,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let record = null;
    try { record = await rpcResponse.json(); } catch {}
    if (!rpcResponse.ok || !record || typeof record !== "object" || !record.id) {
      await deleteUploadedObject(storage, uploaded.fileId, uploaded.fileName, fetcher);
      if (rpcResponse.status === 401 || rpcResponse.status === 403) return failure(403, "FORBIDDEN", "Недостаточно прав для сохранения файла");
      if (rpcResponse.status === 400 || rpcResponse.status === 404) return failure(503, "FILE_METADATA_RPC_NOT_READY", "Не применена миграция безопасного сохранения файлов");
      return failure(503, "FILE_METADATA_UNAVAILABLE", "Не удалось сохранить сведения о файле");
    }
    return {
      ok: true,
      status: 201,
      data: {
        file: {
          id: record.id,
          original_name: record.original_name,
          mime_type: record.mime_type,
          size_bytes: record.size_bytes,
          uploaded_by: record.uploaded_by,
          group_id: record.group_id,
          visibility: record.visibility,
          status: record.status,
          specialty_slug: record.specialty_slug,
          storage_provider: record.storage_provider,
          processing_status: record.processing_status,
          created_at: record.created_at,
        },
      },
    };
  } catch {
    if (uploaded && storage) await deleteUploadedObject(storage, uploaded.fileId, uploaded.fileName, fetcher);
    return failure(503, "FILE_UPLOAD_FAILED", "Не удалось безопасно загрузить файл");
  }
}
