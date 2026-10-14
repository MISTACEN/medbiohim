import { getSupabaseMaterialFileUrl } from "./material-file.js";

const TIMEOUT_MS = 15_000;
const failure = (status, code, message) => ({ ok: false, status, code, message });

/**
 * PHP-compatible authenticated binary route. Authorization and object-key
 * resolution stay in material-file.js; this handler only streams the resolved
 * private B2 or Upstash Blob object. It never accepts a URL or object key from the caller.
 */
export async function streamSupabaseMaterialFile(request, env, materialId, fetcher = fetch) {
  const range = request.headers.get("range") || "";
  if (range && !/^bytes=\d*-\d*$/i.test(range)) {
    return failure(416, "INVALID_RANGE", "Поддерживается один диапазон байтов");
  }

  const signed = await getSupabaseMaterialFileUrl(request, env, materialId, fetcher);
  if (!signed.ok) return signed;

  let target;
  try {
    target = new URL(String(signed.data?.url || ""));
    const allowedB2 = /^f\\d+[.]backblazeb2[.]com$/i.test(target.hostname);
    const allowedBlob = /^[a-f0-9]{32}[.]r2[.]cloudflarestorage[.]com$/i.test(target.hostname);
    if (target.protocol !== "https:" || (!allowedB2 && !allowedBlob)) {
      throw new Error("Unexpected private media download host");
    }
  } catch {
    return failure(503, "FILE_STORAGE_UNAVAILABLE", "Приватный файл временно недоступен");
  }

  let upstream;
  try {
    upstream = await fetcher(target.toString(), {
      method: "GET",
      ...(range ? { headers: { range } } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return failure(503, "FILE_STREAM_UNAVAILABLE", "Не удалось получить содержимое файла");
  }
  if (upstream.status !== 200 && upstream.status !== 206) {
    try { await upstream.body?.cancel(); } catch { /* ignored */ }
    return failure(503, "FILE_STREAM_UNAVAILABLE", "Не удалось получить содержимое файла");
  }
  if (range && upstream.status !== 206) {
    try { await upstream.body?.cancel(); } catch { /* ignored */ }
    return failure(502, "RANGE_NOT_SUPPORTED", "Хранилище не поддержало запрошенный диапазон");
  }

  const headers = new Headers({
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  });
  const contentType = String(upstream.headers.get("content-type") || "application/octet-stream").trim();
  headers.set("content-type", contentType && contentType.length <= 200 ? contentType : "application/octet-stream");
  const contentLength = upstream.headers.get("content-length") || "";
  if (/^\d+$/.test(contentLength)) headers.set("content-length", contentLength);
  const contentRange = upstream.headers.get("content-range") || "";
  if (/^bytes \d+-\d+\/(?:\d+|\*)$/i.test(contentRange)) headers.set("content-range", contentRange);
  headers.set("content-disposition", "inline");

  return {
    ok: true,
    response: new Response(upstream.body, { status: upstream.status, headers }),
  };
}
