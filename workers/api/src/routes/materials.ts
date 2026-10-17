import { Hono } from "hono";
import { BlobError, Bucket } from "@upstash/blob";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

const materials = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBlobBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token, enableTelemetry: false, cache: "no-store" }) : null;
}

function safeObjectKey(value: unknown): string {
  const key = String(value || "").trim().replace(/\\/g, "/");
  if (!key || key.length > 1024 || key.startsWith("/") || /[?#\u0000-\u001f]/.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

function cleanLegacyPath(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^content\/histology\//, "")
    .replace(/^histology\//, "");
}

function withHistologyPrefixes(relativeOrAbsolute: string): string[] {
  const keys: string[] = [];
  const add = (v: string) => {
    const k = safeObjectKey(v);
    if (k && !keys.includes(k)) keys.push(k);
  };
  const raw = String(relativeOrAbsolute || "").trim().replace(/^\/+/, "");
  if (!raw) return keys;
  add(raw);
  const stripped = cleanLegacyPath(raw);
  if (stripped) {
    add(stripped);
    add("histology/" + stripped);
    add("content/histology/" + stripped);
  }
  return keys;
}

/** Port of artifacts materialSourceCandidateKeys — zip schemes, photos, electronogram docx, textbooks. */
function materialSourceCandidateKeys(sourcePath = "", fileObjectKey: string | null = null): string[] {
  const keys: string[] = [];
  const add = (v: string) => {
    for (const k of withHistologyPrefixes(v)) {
      if (!keys.includes(k)) keys.push(k);
    }
  };
  if (fileObjectKey) add(fileObjectKey);
  const path = String(sourcePath || "").trim().replace(/\\/g, "/");
  if (!path) return keys;
  const leaf = path.split("/").pop() || "";
  add(path);
  if (path.startsWith("photos/")) {
    add(path.slice("photos/".length));
    for (const folder of [
      "5_Фотографии препаратов/стом. гистология/",
      "5_Фотографии препаратов/цитология, эмбриология и общая гистология/",
      "5_Фотографии препаратов/частная гистология/",
    ]) {
      add(folder + leaf);
    }
  }
  if (path.startsWith("content/histology/") || path.startsWith("histology/")) {
    add(cleanLegacyPath(path));
  }
  if (path.startsWith("electronograms/docx/") || path.startsWith("1_Экзаменационные электронограммы_")) {
    add("electronograms/docx/" + leaf);
  }
  if (
    path &&
    !path.startsWith("source-materials/") &&
    !path.startsWith("electronograms/") &&
    !path.startsWith("em/") &&
    !path.startsWith("5_Фотографии препаратов/") &&
    !path.startsWith("photos/") &&
    !path.startsWith("histology/") &&
    !path.startsWith("content/histology/") &&
    !path.startsWith("1_Экзаменационные электронограммы_")
  ) {
    add("source-materials/" + path);
    add("histology/source-materials/" + path);
    add("content/histology/source-materials/" + path);
  }
  return keys;
}

async function readMaterial(db: any, id: string) {
  return db
    .from("materials")
    .select(
      "id,subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,created_at,updated_at,source_key,subjects(name,slug,course_number,semester,specialty_slug),files(id,original_name,mime_type,size_bytes,object_key,visibility,status,storage_provider,processing_status)",
    )
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
}

async function resolveSourceMeta(db: any, env: Env, sourceKey: string | null | undefined) {
  const key = String(sourceKey || "").trim();
  if (!key) return { sourcePath: null as string | null, mime: null as string | null, title: null as string | null };

  const looksLikePath = key.includes("/") || /\.(docx?|pdf|pptx?|xlsx?|gif|png|jpe?g|zip)$/i.test(key);

  const loadById = async (client: any) => {
    if (looksLikePath) return null;
    const { data } = await client
      .from("content_sources")
      .select("id,title,source_path,mime_type,file_id")
      .eq("id", key)
      .maybeSingle();
    return data;
  };

  let data = await loadById(db);
  if (!data && !looksLikePath) {
    const service = createServiceClient(env);
    if (service) data = await loadById(service);
  }

  if (data?.source_path) {
    return {
      sourcePath: String(data.source_path),
      mime: data.mime_type ? String(data.mime_type) : null,
      title: data.title ? String(data.title) : null,
    };
  }
  if (looksLikePath) return { sourcePath: key, mime: null, title: null };
  return { sourcePath: key, mime: null, title: null };
}

async function attachSource(db: any, rows: any[]) {
  const keys = [...new Set(rows.map((row) => String(row.source_key || "")).filter(Boolean))];
  const sourcesById = new Map<string, any>();
  if (keys.length) {
    const { data, error } = await db
      .from("content_sources")
      .select("id,title,source_path,mime_type,original_format,source_archive,note,file_id")
      .in("id", keys);
    if (!error) for (const source of data || []) sourcesById.set(String(source.id), source);
  }
  return rows.map((row) => {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    const file = Array.isArray(row.files) ? row.files[0] : row.files;
    const source = sourcesById.get(String(row.source_key || ""));
    return {
      ...row,
      subjects: subject || null,
      files: file || null,
      source: source
        ? {
            id: source.id,
            title: source.title,
            source_path: source.source_path,
            mime_type: source.mime_type,
            original_format: source.original_format,
            source_archive: source.source_archive,
            note: source.note,
            file_id: source.file_id || row.file_id || file?.id || null,
            download_url: null,
          }
        : file
          ? {
              id: file.id,
              title: file.original_name,
              source_path: file.object_key,
              mime_type: file.mime_type,
              file_id: file.id,
              download_url: null,
            }
          : null,
    };
  });
}

async function fetchBlobObject(bucket: Bucket, candidates: string[]) {
  for (const candidate of candidates) {
    try {
      const object = await bucket.get(candidate);
      if (object) return { object, key: candidate };
    } catch (e) {
      if (BlobError.is(e) && ((e as { code?: string }).code === "not_found" || (e as { status?: number }).status === 404)) {
        continue;
      }
      throw e;
    }
  }
  return null;
}

materials.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const subjectId = c.req.query("subject_id") || c.req.query("subject") || c.req.query("subject_slug") || c.req.query("subjectSlug");
  const type = c.req.query("type");
  const searchQuery = String(c.req.query("q") || c.req.query("search") || "").trim().slice(0, 120);
  try {
    let query = db
      .from("materials")
      .select(
        "id,subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,created_at,updated_at,source_key,subjects(name,slug,course_number,semester,specialty_slug),files(id,original_name,mime_type,size_bytes,object_key,visibility,status,storage_provider,processing_status)",
      )
      .eq("is_published", true)
      .order("order_index", { ascending: true })
      .limit(500);
    if (subjectId) {
      if (UUID.test(subjectId)) query = query.eq("subject_id", subjectId);
      else {
        // Subject slugs are not unique in the legacy catalog. Resolve every
        // matching row instead of maybeSingle(), which silently produced an
        // empty materials list when Supabase returned multiple subject IDs.
        const { data: subjects, error: subjectError } = await db
          .from("subjects")
          .select("id")
          .eq("slug", subjectId);
        if (subjectError) {
          console.error("[materials:subject-scope]", subjectError.message);
          const { body, status } = fail("DB_UNAVAILABLE", "Не удалось определить предмет материалов", 503, rid);
          return c.json(body, status as 503);
        }
        const subjectIds = [...new Set((subjects || [])
          .map((subject: { id?: unknown }) => String(subject.id || ""))
          .filter((id: string) => UUID.test(id)))];
        if (!subjectIds.length) return c.json(ok({ items: [] }, rid));
        query = query.in("subject_id", subjectIds);
      }
    }
    if (type) query = query.eq("type", type);
    if (searchQuery) {
      query = query.ilike("title", "%" + searchQuery + "%");
    }
    const { data, error } = await query;");
      query = query.ilike("title", `%${escapedSearch}%`);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[materials:list]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const items = await attachSource(db, data || []);
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[materials:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

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
    const bucket = getBlobBucket(c.env);
    if (!bucket) {
      const { body, status } = fail("SOURCE_STORAGE_NOT_CONFIGURED", "Приватное хранилище файлов не настроено", 503, rid);
      return c.json(body, status as 503);
    }
    const hit = await fetchBlobObject(bucket, candidates);
    if (!hit) {
      const { body, status } = fail(
        "FILE_NOT_FOUND",
        "Файл не найден в Upstash Blob. Нужно загрузить source-materials (docx/pdf) из архива content/histology.",
        404,
        rid,
      );
      return c.json(body, status as 404);
    }
    const name = String(file?.original_name || meta.title || data.title || "material")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\;]/g, "_");
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

materials.get("/:id", requireAuth, async (c) => {
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
    const [item] = await attachSource(db, [data]);
    return c.json(ok({ item }, rid));
  } catch (error) {
    console.error("[materials:get]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Материал недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default materials;
