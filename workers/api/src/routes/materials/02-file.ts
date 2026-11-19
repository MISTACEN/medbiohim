import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, getBlobBucket, materialSourceCandidateKeys, readMaterial, resolveSourceMeta, fetchBlobObject } from "./shared";

import type { MaterialsRouter } from "./types";

export function registerFileRoutes(materials: MaterialsRouter) {
materials.get("/:id/file-url", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID материала", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await readMaterial(db, id);
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Опубликованный материал не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const file = Array.isArray(data.files) ? data.files[0] : data.files;
    const subject = Array.isArray(data.subjects) ? data.subjects[0] : data.subjects;
    const meta = await resolveSourceMeta(db, c.env, data.source_key);
    const candidates = materialSourceCandidateKeys(meta.sourcePath || "", file?.object_key || null);
    return c.json(
      ok(
        {
          url: null,
          mode: "proxy",
          proxy_path: `/api/v1/materials/${id}/file`,
          object_key: candidates[0] || null,
          candidates_count: candidates.length,
          mime_type: file?.mime_type || meta.mime || null,
          file_name: file?.original_name || meta.title || data.title,
          subject_slug: subject?.slug || null,
          available: candidates.length > 0,
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[materials:file-url]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Файл недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

materials.get("/:id/file", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID материала", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await readMaterial(db, id);
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Опубликованный материал не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const file = Array.isArray(data.files) ? data.files[0] : data.files;
    const meta = await resolveSourceMeta(db, c.env, data.source_key);
    const candidates = materialSourceCandidateKeys(meta.sourcePath || "", file?.object_key || null);
    if (!candidates.length) {
      const { body, status } = fail("FILE_NOT_LINKED", "У материала пока нет проверенной ссылки на файл", 404, rid);
      return c.json(body, status as 404);
    }
    const name = String(file?.original_name || meta.title || data.title || "material")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\;]/g, "_");
    const publicBlobBase = (c.env.UPSTASH_BLOB_PUBLIC_BASE_URL || "https://b8a4f9f853fa.blob.upstash.io")
      .trim()
      .replace(/\/+$/, "");

    // Public Blob is the primary read path. The endpoint remains authenticated
    // and the material is checked in Supabase before any object bytes are proxied.
    // Encode each path segment separately so Cyrillic filenames stay valid.
    for (const candidate of candidates) {
      const publicUrl = `${publicBlobBase}/${candidate.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
      try {
        const publicResponse = await fetch(publicUrl, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        });
        if (publicResponse.ok && publicResponse.body) {
          const upstreamType = publicResponse.headers.get("content-type") || "";
          const declaredType = String(file?.mime_type || meta.mime || "").trim();
          const contentType = !upstreamType || upstreamType === "application/octet-stream"
            ? declaredType || upstreamType || "application/octet-stream"
            : upstreamType;
          return new Response(publicResponse.body, {
            status: 200,
            headers: {
              "content-type": contentType,
              "content-disposition": `inline; filename="${name}"`,
              "cache-control": "private, max-age=300",
              "x-content-type-options": "nosniff",
              "x-request-id": rid,
              "x-mbh-blob-key": candidate,
              "x-mbh-file-resolver": "materials-public-v1",
            },
          });
        }
      } catch (publicError) {
        console.warn("[materials:file:public-blob]", {
          key: candidate,
          error: publicError instanceof Error ? publicError.message : String(publicError),
        });
      }
    }

    // Legacy private SDK fallback is optional; public object reads must work
    // even when the bucket token is absent or has expired.
    const bucket = getBlobBucket(c.env);
    const hit = bucket ? await fetchBlobObject(bucket, candidates) : null;
    if (!hit) {
      const { body, status } = fail(
        "FILE_NOT_FOUND",
        "Файл не найден по проверенным ключам публичного Upstash Blob.",
        404,
        rid,
      );
      return c.json(body, status as 404);
    }
    return new Response(hit.object.body, {
      status: 200,
      headers: {
        "content-type": file?.mime_type || meta.mime || hit.object.contentType || "application/octet-stream",
        "content-disposition": `inline; filename="${name}"`,
        "cache-control": "private, max-age=300",
        "x-request-id": rid,
        "x-mbh-blob-key": hit.key,
        "x-mbh-file-resolver": "materials-v2",
      },
    });
  } catch (error) {
    console.error("[materials:file]", error);
    const { body, status } = fail("FILE_UNAVAILABLE", "Не удалось загрузить файл материала", 503, rid);
    return c.json(body, status as 503);
  }
});
}
