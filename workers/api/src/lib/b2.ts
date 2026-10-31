/**
 * Backblaze B2 storage backend (S3-compatible API, AWS SigV4 через WebCrypto).
 *
 * Реализует ту же поверхность, что Upstash Bucket (put/get/del/signedReadUrl),
 * и бросает настоящие BlobError — существующие вызовы в storage.ts/files.ts
 * работают без правок обработки ошибок.
 *
 * Приоритет задаётся getStorageBackend(): B2 (если настроен) → Upstash → null.
 * B2 secrets: B2_ENDPOINT, B2_REGION, B2_BUCKET, B2_KEY_ID, B2_APPLICATION_KEY.
 */
import { BlobError, Bucket } from "@upstash/blob";
import type { Env } from "../env";

export type StorageBackend = {
  provider: "b2" | "upstash";
  put(key: string, body: Blob | ArrayBuffer, options: { contentType: string; cache?: string }): Promise<void>;
  get(key: string): Promise<{ body: ArrayBuffer; contentType: string | null }>;
  del(key: string): Promise<void>;
  signedReadUrl(key: string): Promise<{ url: string; expiresAt: string }>;
};

const HEX = "0123456789abcdef";

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  return out;
}

async function hmac(key: BufferSource, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

async function sha256Hex(payload: BufferSource): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", payload));
}

function amzDate(now = new Date()): { amzdate: string; datestamp: string } {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzdate: iso, datestamp: iso.slice(0, 8) };
}

/** Кодирование ключа: посегментно, слэши сохраняются. */
function encodeKey(key: string): string {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

async function signingKey(secret: string, datestamp: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), datestamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function b2Config(env: Env): { endpoint: string; bucket: string; region: string; keyId: string; appKey: string } | null {
  const endpoint = env.B2_ENDPOINT?.trim();
  const bucket = env.B2_BUCKET?.trim();
  const region = env.B2_REGION?.trim();
  const keyId = env.B2_KEY_ID?.trim();
  const appKey = env.B2_APPLICATION_KEY?.trim();
  if (!endpoint || !bucket || !region || !keyId || !appKey) return null;
  return { endpoint: endpoint.replace(/^https?:\/\//, "").replace(/\/$/, ""), bucket, region, keyId, appKey };
}

/** Подписанные заголовки SigV4 (content-type не подписывается — он добавляется вызовом). */
async function sigv4Headers(config: { endpoint: string; keyId: string; appKey: string; region: string }, method: string, encodedPath: string, payloadHash: string): Promise<Headers> {
  const { amzdate, datestamp } = amzDate(new Date());
  const headers = new Headers({
    host: config.endpoint,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzdate,
  });
  const signedHeaders = [...headers.keys()].sort().join(";");
  const canonicalHeaders = [...headers.keys()].sort().map((name) => `${name}:${headers.get(name)}\n`).join("");
  const canonicalRequest = [method, encodedPath, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${datestamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzdate, scope, await sha256Hex(new TextEncoder().encode(canonicalRequest))].join("\n");
  const signingKeyBytes = await signingKey(config.appKey, datestamp, config.region);
  const cryptoKey = await crypto.subtle.importKey("raw", signingKeyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(stringToSign)));
  headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${config.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
  return headers;
}

function b2Backend(env: Env): StorageBackend | null {
  const config = b2Config(env);
  if (!config) return null;
  const objectUrl = (key: string) => `https://${config.endpoint}/${config.bucket}/${encodeKey(key)}`;

  return {
    provider: "b2",
    async put(key: string, body: Blob | ArrayBuffer, options: { contentType: string; cache?: string }): Promise<void> {
      const payload = body instanceof Blob ? await body.arrayBuffer() : body;
      const payloadHash = await sha256Hex(payload);
      const path = `/${config.bucket}/${encodeKey(key)}`;
      const headers = await sigv4Headers(config, "PUT", path, payloadHash);
      headers.set("content-type", options.contentType);
      const response = await fetch(objectUrl(key), { method: "PUT", headers, body: payload });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new BlobError(response.status === 404 ? "not_found" : "request_failed", `B2 put failed: HTTP ${response.status} ${detail.slice(0, 120)}`);
      }
    },
    async get(key: string): Promise<{ body: ArrayBuffer; contentType: string | null }> {
      const path = `/${config.bucket}/${encodeKey(key)}`;
      const headers = await sigv4Headers(config, "GET", path, await sha256Hex(new ArrayBuffer(0)));
      const response = await fetch(objectUrl(key), { method: "GET", headers });
      if (response.status === 404) throw new BlobError("not_found", "B2 object not found");
      if (!response.ok) throw new BlobError("request_failed", `B2 get failed: HTTP ${response.status}`);
      return { body: await response.arrayBuffer(), contentType: response.headers.get("content-type") };
    },
    async del(key: string): Promise<void> {
      const path = `/${config.bucket}/${encodeKey(key)}`;
      const headers = await sigv4Headers(config, "DELETE", path, await sha256Hex(new ArrayBuffer(0)));
      const response = await fetch(objectUrl(key), { method: "DELETE", headers });
      if (!response.ok && response.status !== 404) {
        throw new BlobError("request_failed", `B2 delete failed: HTTP ${response.status}`);
      }
    },
    async signedReadUrl(key: string): Promise<{ url: string; expiresAt: string }> {
      const expires = 3600;
      const { amzdate, datestamp } = amzDate(new Date());
      const path = `/${config.bucket}/${encodeKey(key)}`;
      const credential = `${config.keyId}/${datestamp}/${config.region}/s3/aws4_request`;
      const query = [
        "X-Amz-Algorithm=AWS4-HMAC-SHA256",
        `X-Amz-Credential=${encodeURIComponent(credential)}`,
        `X-Amz-Date=${amzdate}`,
        `X-Amz-Expires=${expires}`,
        "X-Amz-SignedHeaders=host",
      ].join("&");
      const canonicalRequest = ["GET", path, query, `host:${config.endpoint}`, "host", "UNSIGNED-PAYLOAD"].join("\n");
      const scope = `${datestamp}/${config.region}/s3/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", amzdate, scope, await sha256Hex(new TextEncoder().encode(canonicalRequest))].join("\n");
      const signingKeyBytes = await signingKey(config.appKey, datestamp, config.region);
      const cryptoKey = await crypto.subtle.importKey("raw", signingKeyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(stringToSign)));
      return {
        url: `${objectUrl(key)}?${query}&X-Amz-Signature=${signature}`,
        expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
      };
    },
  };
}

function upstashBackend(env: Env): StorageBackend | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  if (!token) return null;
  const impl = new Bucket({ token });
  return {
    provider: "upstash",
    put: async (key, body, options) => { await impl.put(key, body, options); },
    get: async (key) => {
      // Upstash get отдаёт ReadableStream-тело — стягиваем в ArrayBuffer.
      const object = (await impl.get(key)) as { body: ReadableStream<Uint8Array> | ArrayBuffer; contentType: string | null };
      const body = object.body instanceof ReadableStream
        ? await new Response(object.body).arrayBuffer()
        : object.body;
      return { body: body as ArrayBuffer, contentType: object.contentType };
    },
    del: async (key) => { await impl.del(key); },
    signedReadUrl: async (key) => {
      const signed = await impl.signedReadUrl(key);
      return { url: signed.url, expiresAt: signed.expiresAt instanceof Date ? signed.expiresAt.toISOString() : String(signed.expiresAt) };
    },
  };
}

/** B2 если настроен, иначе Upstash, иначе null. */
export function getStorageBackend(env: Env): StorageBackend | null {
  return b2Backend(env) ?? upstashBackend(env);
}
