const TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_B2_AUTHORIZATIONS = 6;

function safeB2Url(value, kind) {
  try {
    const url = new URL(String(value || ""));
    const hostPattern = kind === "api" ? /^api[0-9]+[.]backblazeb2[.]com$/ : /^f[0-9]+[.]backblazeb2[.]com$/;
    if (url.protocol !== "https:" || !hostPattern.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function encodeObjectKey(key) {
  return String(key).split("/").map((part) => encodeURIComponent(part)).join("/");
}

function validObjectKey(value) {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.split("/").some((part) => part === "." || part === "..") || /[\u0000-\u001f]/.test(key)) return null;
  return key;
}

async function b2Json(fetcher, url, init) {
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body || typeof body !== "object") throw new Error("B2 request failed");
  return body;
}

async function authorizeBucket(env, fetcher, keyId, appKey, bucket) {
  const basic = btoa(keyId + ":" + appKey);
  const auth = await b2Json(fetcher, "https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    method: "GET",
    headers: { authorization: "Basic " + basic, accept: "application/json" },
  });
  const apiUrl = safeB2Url(auth.apiUrl, "api");
  const downloadUrl = safeB2Url(auth.downloadUrl, "download");
  if (!apiUrl || !downloadUrl || !auth.authorizationToken || !auth.accountId) throw new Error("Invalid B2 authorization response");

  let bucketId = String(env.B2_BUCKET_ID || "").trim();
  if (!bucketId) {
    const buckets = await b2Json(fetcher, new URL("/b2api/v2/b2_list_buckets", apiUrl).toString(), {
      method: "POST",
      headers: { authorization: String(auth.authorizationToken), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ accountId: String(auth.accountId), bucketName: bucket }),
    });
    bucketId = String(buckets.buckets?.find((item) => item.bucketName === bucket)?.bucketId || "");
  }
  if (!bucketId) throw new Error("B2 bucket not found");
  return { apiUrl, downloadUrl, authorizationToken: String(auth.authorizationToken), bucketId, bucket };
}

/**
 * Create several short-lived B2 download URLs while authenticating the account
 * once per Worker request. Each URL is still restricted to its exact object-key
 * prefix. All credentials remain server-side.
 */
export async function createB2DownloadUrls(env, objectKeys, validSeconds = 600, fetcher = fetch) {
  const keyId = String(env.B2_KEY_ID || "").trim();
  const appKey = String(env.B2_APPLICATION_KEY || "").trim();
  const bucket = String(env.B2_BUCKET || "").trim();
  const bucketIdEnv = String(env.B2_BUCKET_ID || "").trim();
  if (!keyId || !appKey || !bucket) {
    return { ok: false, status: 503, code: "FILE_STORAGE_NOT_CONFIGURED", message: "Приватное хранилище файлов не настроено" };
  }
  if (!Array.isArray(objectKeys)) return { ok: false, status: 422, code: "INVALID_OBJECT_KEY", message: "Ожидался список ключей файлов" };

  const keys = [...new Set(objectKeys.map(validObjectKey).filter(Boolean))];
  if (!keys.length) return { ok: true, urls: Object.create(null), expires_in: Math.max(60, Math.min(3600, Math.trunc(Number(validSeconds) || 600))) };

  try {
    const authorized = await authorizeBucket({ ...env, B2_BUCKET_ID: bucketIdEnv }, fetcher, keyId, appKey, bucket);
    const seconds = Math.max(60, Math.min(3600, Math.trunc(Number(validSeconds) || 600)));
    const urls = Object.create(null);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_B2_AUTHORIZATIONS, keys.length) }, async () => {
      while (cursor < keys.length) {
        const index = cursor++;
        const key = keys[index];
        try {
          const authResult = await b2Json(fetcher, new URL("/b2api/v2/b2_get_download_authorization", authorized.apiUrl).toString(), {
            method: "POST",
            headers: { authorization: authorized.authorizationToken, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ bucketId: authorized.bucketId, fileNamePrefix: key, validDurationInSeconds: seconds }),
          });
          const downloadToken = String(authResult.authorizationToken || authorized.authorizationToken);
          const url = new URL("/file/" + encodeURIComponent(bucket) + "/" + encodeObjectKey(key), authorized.downloadUrl);
          url.searchParams.set("Authorization", downloadToken);
          urls[key] = url.toString();
        } catch {
          // One failed file must not prevent the rest of a planner page rendering.
        }
      }
    });
    await Promise.all(workers);
    return { ok: true, urls, expires_in: seconds };
  } catch {
    return { ok: false, status: 503, code: "FILE_STORAGE_UNAVAILABLE", message: "Приватный файл временно недоступен" };
  }
}

/**
 * Generate one short-lived Backblaze B2 download authorization URL.
 * Secrets must be configured as Worker secrets; never accept object keys from users.
 */
export async function createB2DownloadUrl(env, objectKey, validSeconds = 600, fetcher = fetch) {
  const key = validObjectKey(objectKey);
  if (!key) return { ok: false, status: 422, code: "INVALID_OBJECT_KEY", message: "Некорректный ключ файла" };
  const result = await createB2DownloadUrls(env, [key], validSeconds, fetcher);
  if (!result.ok) return result;
  const url = result.urls[key];
  if (!url) return { ok: false, status: 503, code: "FILE_STORAGE_UNAVAILABLE", message: "Приватный файл временно недоступен" };
  return { ok: true, url, expires_in: result.expires_in };
}
