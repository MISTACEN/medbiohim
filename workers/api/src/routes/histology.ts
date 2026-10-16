import { Hono } from "hono";
import { BlobError, Bucket } from "@upstash/blob";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/**
 * Histology private textbooks (Учебники) via Upstash Blob.
 * Contract aligned with artifacts histology-source-materials + frontend fetchHistologySourceFile.
 */
const histology = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const FOLDER = "Учебники";
const PREFIXES = [
  "source-materials/Учебники/",
  "histology/source-materials/Учебники/",
  "content/histology/source-materials/Учебники/",
  "histology/Учебники/",
  "Учебники/",
];

function getBlobBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token, enableTelemetry: false, cache: "no-store" }) : null;
}

function validPdfName(value: string): string {
  const name = String(value || "").trim();
  if (!name || name.length > 255 || name.includes("/") || name.includes("\\") || /[\u0000-\u001f]/.test(name)) return "";
  return name.toLocaleLowerCase().endsWith(".pdf") ? name : "";
}

function safeKey(value: string): string {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f]/.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

function allowedPath(supplied: string, leaf: string): boolean {
  const legacy = FOLDER + "/" + leaf;
  if (supplied === legacy) return true;
  return PREFIXES.some((prefix) => supplied.startsWith(prefix) && supplied.slice(prefix.length) === leaf);
}

async function listPdfs(bucket: Bucket) {
  const items: Array<{ name: string; path: string; size_bytes: number | null; updated_at: string | null }> = [];
  const seen = new Set<string>();
  for (const prefix of PREFIXES) {
    try {
      const listed = await bucket.list({ prefix, limit: 200 });
      for (const blob of listed.blobs || []) {
        const path = String((blob as { pathname?: string }).pathname || "");
        const name = path.split("/").pop() || "";
        if (!name.toLocaleLowerCase().endsWith(".pdf")) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        items.push({
          name,
          path: path.startsWith(prefix) ? path : prefix + name,
          size_bytes: typeof (blob as { size?: number }).size === "number" ? (blob as { size: number }).size : null,
          updated_at: (() => { const u = (blob as { uploadedAt?: unknown }).uploadedAt; if (u == null) return null; if (u instanceof Date) return u.toISOString(); return String(u); })(),
        });
      }
    } catch (e) {
      console.warn("[histology] list prefix failed", prefix, e);
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return items;
}

async function getPdf(bucket: Bucket, leaf: string, preferred?: string) {
  const candidates = [
    preferred,
    ...PREFIXES.map((p) => p + leaf),
    FOLDER + "/" + leaf,
  ].filter(Boolean) as string[];
  for (const key of [...new Set(candidates)]) {
    try {
      const obj = await bucket.get(key);
      if (obj) return { obj, key };
    } catch (e) {
      if (e instanceof BlobError && (e as { status?: number }).status === 404) continue;
      throw e;
    }
  }
  return null;
}

histology.get("/source-materials", requireAuth, async (c) => {
  const rid = requestId();
  const folder = String(c.req.query("folder") || FOLDER).trim();
  if (folder !== FOLDER) {
    const { body, status } = fail("BAD_REQUEST", "Разрешён только каталог Учебники", 400, rid);
    return c.json(body, status as 400);
  }
  const bucket = getBlobBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("SOURCE_STORAGE_NOT_CONFIGURED", "Приватное хранилище учебников не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const files = await listPdfs(bucket);
    return c.json(ok({
      items: files.map(({ name, path, size_bytes, updated_at }) => ({
        name, path, mime_type: "application/pdf", size_bytes, updated_at,
      })),
      folder: FOLDER,
      source: "upstash-blob",
      status: "ready",
    }, rid));
  } catch (e) {
    console.error("[histology/source-materials]", e);
    const { body, status } = fail("SOURCE_STORAGE_UNAVAILABLE", "Не удалось получить список учебников", 503, rid);
    return c.json(body, status as 503);
  }
});

histology.get("/source-file", requireAuth, async (c) => {
  const rid = requestId();
  const supplied = safeKey(String(c.req.query("path") || ""));
  const leaf = validPdfName(supplied ? supplied.split("/").at(-1) || "" : "");
  if (!supplied || !leaf || !allowedPath(supplied, leaf)) {
    const { body, status } = fail("BAD_REQUEST", "Доступны только PDF из каталога Учебники", 400, rid);
    return c.json(body, status as 400);
  }
  const bucket = getBlobBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("SOURCE_STORAGE_NOT_CONFIGURED", "Приватное хранилище учебников не настроено", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const hit = await getPdf(bucket, leaf, supplied);
    if (!hit) {
      const { body, status } = fail("NOT_FOUND", "Учебник не найден в подключённом хранилище", 404, rid);
      return c.json(body, status as 404);
    }
    const asciiFilename = leaf.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_");
    return new Response(hit.obj.body, {
      status: 200,
      headers: {
        "content-type": hit.obj.contentType || "application/pdf",
        "content-disposition": `inline; filename="${asciiFilename}"`,
        "cache-control": "private, max-age=300",
        "x-request-id": rid,
        "x-mbh-blob-key": hit.key,
      },
    });
  } catch (e) {
    console.error("[histology/source-file]", e);
    const { body, status } = fail("SOURCE_FILE_UNAVAILABLE", "Не удалось загрузить учебник", 503, rid);
    return c.json(body, status as 503);
  }
});

export default histology;
