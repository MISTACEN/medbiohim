import { Hono } from "hono";
import { BlobError, Bucket } from "@upstash/blob";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const materials = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBlobBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token, enableTelemetry: false, cache: "no-store" }) : null;
}

function safeObjectKey(value: unknown): string {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f]/.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

function storageCandidates(objectKey: unknown, sourcePath: unknown): string[] {
  const primary = safeObjectKey(objectKey);
  const source = safeObjectKey(sourcePath);
  return [...new Set([
    primary,
    source,
    source ? "content/histology/" + source : "",
    source ? "histology/" + source : "",
  ].map(safeObjectKey).filter(Boolean))];
}

async function readMaterial(db: any, id: string) {
  return db.from("materials")
    .select("id,subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,created_at,updated_at,source_key,subjects(name,slug,course_number,semester,specialty_slug),files(id,original_name,mime_type,size_bytes,object_key,visibility,status,storage_provider,processing_status)")
    .eq("id", id).eq("is_published", true).maybeSingle();
}

async function attachSource(db: any, rows: any[]) {
  const keys = [...new Set(rows.map((row) => String(row.source_key || "")).filter(Boolean))];
  const sourcesById = new Map<string, any>();
  if (keys.length) {
    const { data, error } = await db.from("content_sources")
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
      subject_name: subject?.name || "",
      subject_slug: subject?.slug || null,
      course_number: subject?.course_number ?? null,
      semester: subject?.semester ?? null,
      subjects: undefined,
      files: undefined,
      source: source ? {
        id: source.id,
        name: source.title || file?.original_name || "",
        mime_type: source.mime_type || source.original_format || file?.mime_type || null,
        source_path: source.source_path || null,
        source_archive: source.source_archive || null,
        file_id: source.file_id || row.file_id || file?.id || null,
        download_url: null,
      } : file ? {
        id: file.id, name: file.original_name || row.title,
        mime_type: file.mime_type || null, source_path: null,
        file_id: file.id, download_url: null,
      } : null,
      file_name: file?.original_name || null,
      file_mime_type: file?.mime_type || null,
      object_key: file?.object_key || null,
    };
  });
}

materials.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const subjectId = String(c.req.query("subject_id") || "").trim();
  const subjectSlug = String(c.req.query("subject_slug") || "").trim().toLowerCase();
  const search = String(c.req.query("q") || "").trim().slice(0, 120);
  if (subjectId && !UUID.test(subjectId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID предмета", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    let resolvedSubjectIds: string[] | null = null;
    if (subjectSlug) {
      const { data: subjects, error } = await db.from("subjects").select("id")
        .eq("slug", subjectSlug).eq("is_active", true).limit(100);
      if (error) throw error;
      resolvedSubjectIds = (subjects || []).map((subject: { id: string }) => String(subject.id)).filter(Boolean);
      if (!resolvedSubjectIds.length) return c.json(ok({ items: [] }, rid));
    }
    let query = db.from("materials")
      .select("id,subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,created_at,updated_at,source_key,subjects(name,slug,course_number,semester,specialty_slug),files(id,original_name,mime_type,size_bytes,object_key,visibility,status,storage_provider,processing_status)")
      .eq("is_published", true)
      .order("order_index", { ascending: true }).order("created_at", { ascending: false }).limit(300);
    if (resolvedSubjectIds) query = query.in("subject_id", resolvedSubjectIds);
    else if (subjectId) query = query.eq("subject_id", subjectId);
    if (search) query = query.ilike("title", `%${search.replace(/[%_]/g, "\\$&")}%`);
    const { data, error } = await query;
    if (error) throw error;
    return c.json(ok({ items: await attachSource(db, data || []) }, rid));
  } catch (error) {
    console.error("[materials:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

materials.get("/:id/file-url", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
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
    let sourcePath: string | null = null;
    if (data.source_key) {
      const { data: source } = await db.from("content_sources").select("source_path,file_id")
        .eq("id", data.source_key).maybeSingle();
      sourcePath = source?.source_path || null;
    }
    const key = storageCandidates(file?.object_key, sourcePath)[0] || "";
    return c.json(ok({
      url: null,
      mode: "proxy",
      object_key: key || null,
      mime_type: file?.mime_type || null,
      file_name: file?.original_name || data.title,
      subject_slug: subject?.slug || null,
      available: Boolean(key),
    }, rid));
  } catch (error) {
    console.error("[materials:file-url]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Файл недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

materials.get("/:id/file", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
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
    let sourcePath: string | null = null;
    if (data.source_key) {
      const { data: source } = await db.from("content_sources").select("source_path,file_id")
        .eq("id", data.source_key).maybeSingle();
      sourcePath = source?.source_path || null;
    }
    const candidates = storageCandidates(file?.object_key, sourcePath);
    if (!candidates.length) {
      const { body, status } = fail("FILE_NOT_LINKED", "У материала пока нет проверенной ссылки на файл", 404, rid);
      return c.json(body, status as 404);
    }
    const bucket = getBlobBucket(c.env);
    if (!bucket) {
      const { body, status } = fail("SOURCE_STORAGE_NOT_CONFIGURED", "Приватное хранилище файлов не настроено", 503, rid);
      return c.json(body, status as 503);
    }
    let object: any = null;
    let key = "";
    for (const candidate of candidates) {
      try {
        object = await bucket.get(candidate);
        if (object) { key = candidate; break; }
      } catch (e) {
        if (!(e instanceof BlobError && (e as { status?: number }).status === 404)) throw e;
      }
    }
    if (!object) {
      const { body, status } = fail("FILE_NOT_FOUND", "Файл не найден в подключённом хранилище", 404, rid);
      return c.json(body, status as 404);
    }
    const name = String(file?.original_name || data.title || "material").replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_");
    return new Response(object.body, { status: 200, headers: {
      "content-type": file?.mime_type || object.contentType || "application/octet-stream",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, max-age=300",
      "x-request-id": rid,
      "x-mbh-blob-key": key,
    }});
  } catch (error) {
    console.error("[materials:file]", error);
    const { body, status } = fail("FILE_UNAVAILABLE", "Не удалось загрузить файл материала", 503, rid);
    return c.json(body, status as 503);
  }
});

materials.get("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
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
    return c.json(ok(item, rid));
  } catch (error) {
    console.error("[materials:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Материал недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default materials;
