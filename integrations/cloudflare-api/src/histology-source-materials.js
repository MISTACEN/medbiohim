import { authenticateSupabaseRequest } from "./supabase-auth.js";
import { createB2DownloadUrl } from "./b2-download.js";
import { getFileStorage } from "./blob-storage.js";

const TIMEOUT_MS = 8000;
const FOLDER = "Учебники";
const PREFIXES = [
  "source-materials/Учебники/",
  "histology/source-materials/Учебники/",
  "content/histology/source-materials/Учебники/",
  "Учебники/",
];

const failure = (status, code, message) => ({ ok: false, status, code, message });
const bearer = (request) => /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";

function validPdfName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 255 || name.includes("/") || name.includes("\\") || /[\u0000-\u001f]/.test(name)) return "";
  return name.toLocaleLowerCase().endsWith(".pdf") ? name : "";
}

function safeKey(value) {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f]/.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

function safeB2Url(value, kind) {
  try {
    const url = new URL(String(value || ""));
    const pattern = kind === "api" ? /^api[0-9]+[.]backblazeb2[.]com$/ : /^f[0-9]+[.]backblazeb2[.]com$/;
    return url.protocol === "https:" && pattern.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

async function b2Json(fetcher, url, init) {
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object") {
    const error = new Error("B2_REQUEST_FAILED");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function b2Auth(env, fetcher) {
  const keyId = String(env.B2_KEY_ID || "").trim();
  const key = String(env.B2_APPLICATION_KEY || "").trim();
  const bucketName = String(env.B2_BUCKET || "").trim();
  if (!keyId || !key || !bucketName) return failure(503, "SOURCE_STORAGE_NOT_CONFIGURED", "Приватное хранилище учебников не настроено");
  try {
    const auth = await b2Json(fetcher, "https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      method: "GET",
      headers: { authorization: "Basic " + btoa(keyId + ":" + key), accept: "application/json" },
    });
    const apiUrl = safeB2Url(auth.apiUrl, "api");
    if (!apiUrl || !auth.authorizationToken || !auth.accountId) throw new Error("B2_AUTH_INVALID");
    let bucketId = String(env.B2_BUCKET_ID || "").trim();
    if (!bucketId) {
      const found = await b2Json(fetcher, new URL("/b2api/v2/b2_list_buckets", apiUrl).toString(), {
        method: "POST",
        headers: { authorization: String(auth.authorizationToken), "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ accountId: String(auth.accountId), bucketName }),
      });
      bucketId = String(found.buckets?.find((item) => item.bucketName === bucketName)?.bucketId || "");
    }
    if (!bucketId) return failure(503, "SOURCE_STORAGE_NOT_CONFIGURED", "Не найдено приватное хранилище учебников");
    return { ok: true, apiUrl, bucketId, authorizationToken: String(auth.authorizationToken) };
  } catch (error) {
    console.error("MEDBIOHIM_HISTOLOGY_B2_AUTH_FAILED", JSON.stringify({
      category: error?.status === 401 || error?.status === 403 ? "credentials_or_bucket_scope" : error?.name === "TimeoutError" ? "timeout" : "upstream",
      status: Number.isFinite(error?.status) ? error.status : null,
    }));
    return failure(503, "SOURCE_STORAGE_UNAVAILABLE", "Не удалось подключиться к хранилищу учебников");
  }
}

async function listPdfPrefix(auth, prefix, fetcher) {
  const result = await b2Json(fetcher, new URL("/b2api/v2/b2_list_file_names", auth.apiUrl).toString(), {
    method: "POST",
    headers: { authorization: auth.authorizationToken, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ bucketId: auth.bucketId, prefix, maxFileCount: 1000 }),
  });
  return (Array.isArray(result.files) ? result.files : []).flatMap((file) => {
    const key = safeKey(file?.fileName);
    if (!key || !key.startsWith(prefix)) return [];
    const name = key.slice(prefix.length);
    if (!validPdfName(name) || name.includes("/")) return [];
    return [{
      name,
      path: key,
      mime_type: "application/pdf",
      size_bytes: Math.max(0, Number(file.contentLength ?? file.size ?? 0) || 0),
      updated_at: Number.isFinite(Number(file.uploadTimestamp)) ? new Date(Number(file.uploadTimestamp)).toISOString() : null,
    }];
  });
}

async function listBlobPdfPrefix(storage, prefix) {
  const files = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = await storage.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const blob of Array.isArray(page?.blobs) ? page.blobs : []) {
      const key = safeKey(blob?.path);
      if (!key || !key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      if (!validPdfName(name) || name.includes("/")) continue;
      files.push({
        name,
        path: key,
        mime_type: "application/pdf",
        size_bytes: Math.max(0, Number(blob.size) || 0),
        updated_at: blob.uploadedAt ? new Date(blob.uploadedAt).toISOString() : null,
      });
    }
    cursor = page?.cursor || null;
    pages += 1;
  } while (cursor && pages < 10);
  return files;
}

async function authorizeMbh(request, env, fetcher) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    endpoint = new URL("/rest/v1/group_memberships", baseUrl);
    if (endpoint.protocol !== "https:" || !anonKey || !token) return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }
  endpoint.searchParams.set("select", "group_id,groups(specialty_slug,is_active)");
  endpoint.searchParams.set("user_id", "eq." + identity.user.id);
  endpoint.searchParams.set("is_active", "eq.true");
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return failure(503, "MEMBERSHIP_CHECK_FAILED", "Не удалось проверить доступ к учебникам");
  }
  if (response.status === 401 || response.status === 403) return failure(401, "UNAUTHORIZED", "Недействительная сессия");
  if (!response.ok) return failure(503, "MEMBERSHIP_CHECK_FAILED", "Не удалось проверить доступ к учебникам");
  const memberships = await response.json().catch(() => null);
  if (!Array.isArray(memberships)) return failure(503, "MEMBERSHIP_CHECK_FAILED", "Некорректный ответ проверки доступа");
  const allowed = memberships.some((membership) => {
    const group = Array.isArray(membership?.groups) ? membership.groups[0] : membership?.groups;
    return group?.is_active === true && String(group?.specialty_slug || "").trim() === "mbh";
  });
  return allowed ? { ok: true } : failure(403, "FORBIDDEN", "Учебники доступны только специальности МБХ");
}

async function readAuthorizedFiles(request, env, fetcher) {
  const access = await authorizeMbh(request, env, fetcher);
  if (!access.ok) return access;

  const storage = await getFileStorage(env);
  if (storage && typeof storage.list === "function") {
    try {
      const groups = await Promise.all(PREFIXES.map((prefix) => listBlobPdfPrefix(storage, prefix)));
      const seen = new Set();
      const files = [];
      for (const group of groups) {
        for (const file of group) {
          const key = file.path.toLocaleLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          files.push(file);
        }
      }
      files.sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base", numeric: true }));
      if (files.length) return { ok: true, storage: "upstash-blob", files };
    } catch {
      // Keep the legacy B2 listing as a fallback while storage credentials roll out.
    }
  }

  const auth = await b2Auth(env, fetcher);
  if (!auth.ok) return auth;
  try {
    const groups = await Promise.all(PREFIXES.map((prefix) => listPdfPrefix(auth, prefix, fetcher)));
    const seen = new Set();
    const files = [];
    for (const group of groups) {
      for (const file of group) {
        const key = file.path.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        files.push(file);
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base", numeric: true }));
    if (!files.length) return failure(503, "SOURCE_NOT_MIGRATED", "PDF учебников не найдены в подключённом хранилище; каталог SpaceWeb ещё не перенесён");
    return { ok: true, storage: "backblaze-b2", auth, files };
  } catch (error) {
    console.error("MEDBIOHIM_HISTOLOGY_SOURCE_LIST_FAILED", JSON.stringify({
      category: error?.status === 401 || error?.status === 403 ? "credentials_or_bucket_scope" : error?.name === "TimeoutError" ? "timeout" : "upstream",
      status: Number.isFinite(error?.status) ? error.status : null,
    }));
    return failure(503, "SOURCE_LIST_ERROR", "Материалы по гистологии временно недоступны");
  }
}

export async function listSupabaseHistologySourceMaterials(request, env, options = {}, fetcher = fetch) {
  const folder = String(options.folder || FOLDER).trim();
  if (folder !== FOLDER) return failure(400, "BAD_REQUEST", "Разрешён только каталог Учебники");
  const result = await readAuthorizedFiles(request, env, fetcher);
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      items: result.files.map(({ name, path, mime_type, size_bytes, updated_at }) => ({ name, path, mime_type, size_bytes, updated_at })),
      folder: FOLDER,
      source: result.storage,
      status: "ready",
    },
  };
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function getSupabaseHistologySourceFile(request, env, options = {}, fetcher = fetch) {
  const supplied = safeKey(options.path);
  const leaf = validPdfName(supplied ? supplied.split("/").at(-1) : "");
  const legacyPath = "Учебники/" + leaf;
  if (!supplied || !leaf || (supplied !== legacyPath && !PREFIXES.some((prefix) => supplied.startsWith(prefix) && supplied.slice(prefix.length) === leaf))) {
    return jsonError(400, "BAD_REQUEST", "Доступны только PDF из каталога Учебники");
  }

  const result = await readAuthorizedFiles(request, env, fetcher);
  if (!result.ok) return jsonError(result.status, result.code, result.message);
  let item = result.files.find((file) => file.path === supplied);
  if (!item && supplied === legacyPath) item = result.files.find((file) => file.name === leaf);
  if (!item) return jsonError(404, "NOT_FOUND", "Учебник не найден в подключённом хранилище");

  let downloadUrl = "";
  if (result.storage === "upstash-blob") {
    try {
      const storage = await getFileStorage(env);
      const signed = await storage?.signedReadUrl?.(item.path, { expiresIn: "5m" });
      const target = new URL(String(signed?.url || ""));
      if (target.protocol !== "https:" || !/^[a-f0-9]{32}[.]r2[.]cloudflarestorage[.]com$/i.test(target.hostname)) {
        throw new Error("Unexpected private Blob host");
      }
      downloadUrl = target.toString();
    } catch {
      return jsonError(503, "SOURCE_FILE_UNAVAILABLE", "Не удалось подписать приватный файл учебника");
    }
  } else {
    const signed = await createB2DownloadUrl(env, item.path, 600, fetcher);
    if (!signed.ok) return jsonError(signed.status || 503, signed.code || "SOURCE_FILE_UNAVAILABLE", signed.message || "Не удалось загрузить учебник");
    downloadUrl = signed.url;
  }

  try {
    const upstream = await fetcher(downloadUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (upstream.status === 404) return jsonError(404, "NOT_FOUND", "Учебник не найден в хранилище");
    if (!upstream.ok || !upstream.body) return jsonError(503, "SOURCE_FILE_UNAVAILABLE", "Не удалось загрузить учебник");
    const filename = leaf.replace(/["\\\r\n]/g, "");
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_");
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "inline; filename=\"" + asciiFilename + "\"; filename*=UTF-8''" + encodeURIComponent(filename),
        "cache-control": "private, max-age=900",
        "x-content-type-options": "nosniff",
        ...(upstream.headers.get("content-length") ? { "content-length": upstream.headers.get("content-length") } : {}),
      },
    });
  } catch (error) {
    console.error("MEDBIOHIM_HISTOLOGY_SOURCE_DOWNLOAD_FAILED", JSON.stringify({ category: error?.name === "TimeoutError" ? "timeout" : "upstream" }));
    return jsonError(503, "SOURCE_FILE_UNAVAILABLE", "Не удалось загрузить учебник");
  }
}
