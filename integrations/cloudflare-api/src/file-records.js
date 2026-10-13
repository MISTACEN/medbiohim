import { authenticateSupabaseRequest } from "./supabase-auth.js";
import { createB2DownloadUrl } from "./b2-download.js";

const TIMEOUT_MS = 5_000;
function failure(status, code, message) { return { ok: false, status, code, message }; }
function related(value) { return Array.isArray(value) ? (value[0] || null) : (value || null); }

export async function getSupabaseFileRecord(request, env, fileId, fetcher = fetch) {
  return resolveFile(request, env, fileId, fetcher, false);
}

export async function getSupabaseFileDownload(request, env, fileId, fetcher = fetch) {
  return resolveFile(request, env, fileId, fetcher, true);
}

async function resolveFile(request, env, fileId, fetcher, needDownload) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const id = String(fileId || "").trim();
  if (!id || id.length > 128 || /[\/?#\u0000-\u001f]/.test(id)) return failure(422, "VALIDATION_ERROR", "Invalid file id");

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "DB_NOT_CONFIGURED", "Файлы временно недоступны");
  }
  async function rows(table, params) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
    if (!response.ok) throw new Error("Database read failed");
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid database response");
    return payload;
  }

  try {
    const found = await rows("files", {
      select: "id,original_name,mime_type,size_bytes,object_key,b2_file_id,uploaded_by,group_id,visibility,status,specialty_slug,sha256,storage_provider,processing_status,created_at",
      id: "eq." + id,
      status: "eq.active",
      limit: "1",
    });
    const file = found[0];
    if (!file) return failure(404, "NOT_FOUND", "File not found");

    const isOwner = String(file.uploaded_by || "") === identity.user.id;
    const isPublic = String(file.visibility || "") === "public";
    let memberships = [];
    if (!isOwner && !isPublic && file.group_id) {
      memberships = await rows("group_memberships", {
        select: "group_id,groups(is_active,specialty_slug)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
    }
    const eligible = memberships.filter((membership) => {
      const group = related(membership?.groups);
      return Boolean(group) && group.is_active === true;
    });
    const isGroupMember = Boolean(file.group_id) && eligible.some((membership) => String(membership.group_id) === String(file.group_id));
    if (!isOwner && !isPublic && !isGroupMember) return failure(404, "NOT_FOUND", "File not found");

    let requiredSpecialty = String(file.specialty_slug || "").trim();
    if (requiredSpecialty !== "mbh") {
      const links = await rows("materials", { select: "subject_id", file_id: "eq." + id, limit: "100" });
      const subjectIds = [...new Set(links.map((row) => String(row.subject_id || "")).filter((value) => /^[0-9a-f-]{36}$/i.test(value)))];
      if (subjectIds.length) {
        const subjects = await rows("subjects", { select: "id,slug,specialty_slug", id: "in.(" + subjectIds.join(",") + ")" });
        if (subjects.some((subject) => String(subject.slug || "") === "histology")) requiredSpecialty = "mbh";
      }
    }
    if (requiredSpecialty) {
      if (!memberships.length) {
        memberships = await rows("group_memberships", {
          select: "group_id,groups(is_active,specialty_slug)",
          user_id: "eq." + identity.user.id,
          is_active: "eq.true",
        });
      }
      const hasSpecialty = memberships.some((membership) => {
        const group = related(membership?.groups);
        return Boolean(group) && group.is_active === true && String(group.specialty_slug || "").trim() === requiredSpecialty;
      });
      if (!hasSpecialty) return failure(403, "FORBIDDEN", "Этот файл недоступен для вашей специальности");
    }

    const safeFile = {
      id: file.id,
      original_name: file.original_name ?? null,
      mime_type: file.mime_type ?? null,
      size_bytes: file.size_bytes ?? null,
      uploaded_by: file.uploaded_by ?? null,
      group_id: file.group_id ?? null,
      visibility: file.visibility ?? "group",
      status: file.status,
      specialty_slug: file.specialty_slug ?? null,
      storage_provider: file.storage_provider ?? "unknown",
      processing_status: file.processing_status ?? null,
      created_at: file.created_at ?? null,
    };
    if (!needDownload) {
      const download = { status: "unavailable", url: null, expires_in: null };
      if (String(file.object_key || "").trim() && env.B2_KEY_ID && env.B2_APPLICATION_KEY && env.B2_BUCKET) {
        const signed = await createB2DownloadUrl(env, file.object_key, 600, fetcher);
        if (signed.ok) {
          download.status = "ready";
          download.url = signed.url;
          download.expires_in = signed.expires_in;
        } else {
          download.status = signed.code === "FILE_STORAGE_NOT_CONFIGURED" ? "unavailable" : "error";
        }
      }
      return { ok: true, data: { file: safeFile, download } };
    }

    if (!String(file.object_key || "").trim()) return failure(503, "FILE_UNAVAILABLE", "Физический файл ещё не подключён к приватному хранилищу");
    const signed = await createB2DownloadUrl(env, file.object_key, 600, fetcher);
    if (!signed.ok) return signed;
    return { ok: true, data: { url: signed.url, mode: "presigned", expires_in: signed.expires_in } };
  } catch (error) {
    if (error?.status === 401) return failure(401, "UNAUTHORIZED", "Недействительная или истёкшая сессия");
    return failure(503, "FILE_UNAVAILABLE", "Не удалось проверить доступ к файлу");
  }
}
