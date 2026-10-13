const TIMEOUT_MS = 5_000;

function safeB2Url(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !url.hostname.endsWith(".backblazeb2.com")) return null;
    return url;
  } catch {
    return null;
  }
}

function encodeObjectKey(key) {
  return String(key).split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function b2Json(fetcher, url, init) {
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body || typeof body !== "object") throw new Error("B2 request failed");
  return body;
}

/**
 * Generate a short-lived Backblaze B2 download authorization URL.
 * Secrets must be configured as Worker secrets; never accept object keys from users.
 */
export async function createB2DownloadUrl(env, objectKey, validSeconds = 600, fetcher = fetch) {
  const keyId = String(env.B2_KEY_ID || "").trim();
  const appKey = String(env.B2_APPLICATION_KEY || "").trim();
  const bucket = String(env.B2_BUCKET || "").trim();
  const bucketIdEnv = String(env.B2_BUCKET_ID || "").trim();
  const key = String(objectKey || "").trim();
  if (!keyId || !appKey || !bucket) return { ok: false, status: 503, code: "FILE_STORAGE_NOT_CONFIGURED", message: "Приватное хранилище файлов не настроено" };
  if (!key || key.length > 1024 || key.startsWith("/") || key.split("/").some((part) => part === "." || part === "..") || /[\u0000-\u001f]/.test(key)) {
    return { ok: false, status: 422, code: "INVALID_OBJECT_KEY", message: "Некорректный ключ файла" };
  }

  try {
    const basic = btoa(keyId + ":" + appKey);
    const auth = await b2Json(fetcher, "https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      method: "GET",
      headers: { authorization: "Basic " + basic, accept: "application/json" },
    });
    const apiUrl = safeB2Url(auth.apiUrl);
    const downloadUrl = safeB2Url(auth.downloadUrl);
    if (!apiUrl || !downloadUrl || !auth.authorizationToken || !auth.accountId) throw new Error("Invalid B2 authorization response");

    let bucketId = bucketIdEnv;
    if (!bucketId) {
      const buckets = await b2Json(fetcher, new URL("/b2api/v2/b2_list_buckets", apiUrl).toString(), {
        method: "POST",
        headers: { authorization: String(auth.authorizationToken), "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ accountId: String(auth.accountId), bucketName: bucket }),
      });
      bucketId = String(buckets.buckets?.find((item) => item.bucketName === bucket)?.bucketId || "");
    }
    if (!bucketId) throw new Error("B2 bucket not found");

    const seconds = Math.max(60, Math.min(3600, Math.trunc(Number(validSeconds) || 600)));
    const authResult = await b2Json(fetcher, new URL("/b2api/v2/b2_get_download_authorization", apiUrl).toString(), {
      method: "POST",
      headers: { authorization: String(auth.authorizationToken), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ bucketId, fileNamePrefix: key, validDurationInSeconds: seconds }),
    });
    const downloadToken = String(authResult.authorizationToken || auth.authorizationToken);
    const url = new URL("/file/" + encodeURIComponent(bucket) + "/" + encodeObjectKey(key), downloadUrl);
    url.searchParams.set("Authorization", downloadToken);
    return { ok: true, url: url.toString(), expires_in: seconds };
  } catch {
    return { ok: false, status: 503, code: "FILE_STORAGE_UNAVAILABLE", message: "Приватный файл временно недоступен" };
  }
}
