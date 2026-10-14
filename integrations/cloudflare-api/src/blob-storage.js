/**
 * Private Upstash Blob adapter for Workers.
 * File bytes stay in Blob; Supabase owns metadata and authorization.
 */
let cachedToken = "";
let cachedBucket = null;
let cachedBlobError = null;

export async function getFileStorage(env = {}) {
  if (env.FILE_STORAGE && ["put", "get", "head", "signedReadUrl"].some((name) => typeof env.FILE_STORAGE[name] === "function")) {
    return { provider: "upstash_blob", ...env.FILE_STORAGE };
  }
  const token = String(env.UPSTASH_BLOB_TOKEN || "").trim();
  if (!token) return null;
  if (token !== cachedToken || !cachedBucket) {
    const { Bucket, BlobError } = await import("@upstash/blob");
    cachedBucket = new Bucket({ token, enableTelemetry: false, cache: "no-store" });
    cachedBlobError = BlobError;
    cachedToken = token;
  }
  const bucket = cachedBucket;
  const BlobErrorClass = cachedBlobError;
  const notFound = (error) => BlobErrorClass?.is?.(error) && error.code === "not_found";
  return {
    provider: "upstash_blob",
    async put(key, body, options = {}) {
      const contentType = options.httpMetadata?.contentType || options.contentType || "application/octet-stream";
      return bucket.put(String(key), body, {
        contentType,
        cache: "no-store",
        maxSize: options.maxSize || 15 * 1024 * 1024,
        allowOverwrite: false,
      });
    },
    async head(key) {
      try {
        const info = await bucket.info(String(key));
        return { size: info.size, httpMetadata: { contentType: info.contentType || "application/octet-stream" }, customMetadata: info.metadata || {} };
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },
    async get(key) {
      try {
        const object = await bucket.get(String(key));
        return {
          size: object.size,
          httpMetadata: { contentType: object.contentType || "application/octet-stream" },
          customMetadata: object.metadata || {},
          arrayBuffer: () => new Response(object.body).arrayBuffer(),
        };
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },
    async list(options = {}) {
      const page = await bucket.list({
        prefix: String(options.prefix || ""),
        limit: Math.max(1, Math.min(1000, Number(options.limit) || 100)),
        ...(options.cursor ? { cursor: String(options.cursor) } : {}),
      });
      return {
        blobs: (Array.isArray(page.blobs) ? page.blobs : []).map((blob) => ({
          path: String(blob.path || ""),
          size: Number(blob.size) || 0,
          uploadedAt: blob.uploadedAt || null,
        })),
        cursor: page.cursor || null,
      };
    },
    async signedReadUrl(key, options = {}) {
      const result = await bucket.signedReadUrl(String(key), { expiresIn: options.expiresIn || "5m" });
      return { url: result.url, expiresAt: result.expiresAt };
    },
  };
}
