import type { Env } from "../../env";
import { createServiceClient } from "../../lib/supabase";
import { BlobError, Bucket } from "@upstash/blob";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getBlobBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token, enableTelemetry: false, cache: "no-store" }) : null;
}

export function safeObjectKey(value: unknown): string {
  const key = String(value || "").trim().replace(/\\/g, "/");
  if (!key || key.length > 1024 || key.startsWith("/") || /[?#\u0000-\u001f]/.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

export function cleanLegacyPath(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^content\/histology\//, "")
    .replace(/^histology\//, "");
}

export function withHistologyPrefixes(relativeOrAbsolute: string): string[] {
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
export function materialSourceCandidateKeys(sourcePath = "", fileObjectKey: string | null = null): string[] {
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

export async function readMaterial(db: any, id: string) {
  return db
    .from("materials")
    .select(
      "id,subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,created_at,updated_at,source_key,subjects(name,slug,course_number,semester,specialty_slug),files(id,original_name,mime_type,size_bytes,object_key,visibility,status,storage_provider,processing_status)",
    )
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
}

export async function resolveSourceMeta(db: any, env: Env, sourceKey: string | null | undefined) {
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

export async function attachSource(db: any, rows: any[]) {
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

export async function fetchBlobObject(bucket: Bucket, candidates: string[]) {
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
