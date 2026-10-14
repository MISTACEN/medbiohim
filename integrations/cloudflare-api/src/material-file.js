import { authenticateSupabaseRequest } from "./supabase-auth.js";
import { createB2DownloadUrl } from "./b2-download.js";
import { getFileStorage } from "./blob-storage.js";

const TIMEOUT_MS = 5_000;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

export async function getSupabaseMaterialFileUrl(request, env, materialId, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const id = String(materialId || "").trim();
  if (!id || id.length > 128 || /[\/?#\u0000-\u001f]/.test(id)) {
    return failure(422, "VALIDATION_ERROR", "Invalid material id");
  }

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "DB_NOT_CONFIGURED", "Хранилище материалов временно недоступно");
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
    if (!response.ok) throw new Error("Database read failed");
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid database response");
    return payload;
  }

  try {
    const materials = await rows("materials", {
      select: "id,subject_id,file_id,source_key,is_published",
      id: "eq." + id,
      is_published: "eq.true",
      limit: "1",
    });
    const material = materials[0];
    if (!material) return failure(404, "NOT_FOUND", "Material not found");

    const subjects = await rows("subjects", {
      select: "id,slug,specialty_slug,is_active",
      id: "eq." + String(material.subject_id || ""),
      limit: "1",
    });
    const subject = subjects[0];
    if (!subject || subject.is_active !== true) return failure(404, "NOT_FOUND", "Material not found");

    const subjectSlug = String(subject.slug || "");
    const specialty = String(subject.specialty_slug || "").trim();
    const requiredSpecialty = subjectSlug === "histology" || specialty === "mbh" ? "mbh" : specialty;

    let file = null;
    if (material.file_id) {
      const files = await rows("files", {
        select: "id,object_key,group_id,status",
        id: "eq." + String(material.file_id),
        status: "eq.active",
        limit: "1",
      });
      file = files[0] || null;
    }

    const candidateKeys = [];
    const addCandidate = (value) => {
      const key = String(value || "").trim();
      if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f]/.test(key)) return;
      const parts = key.split("/");
      if (parts.some((part) => !part || part === "." || part === "..")) return;
      if (!candidateKeys.includes(key)) candidateKeys.push(key);
    };
    addCandidate(file?.object_key);

    // Resolve historical Histology source paths to private Blob object keys.
    // Fetch the source row with the caller JWT so its RLS policies stay in force.
    if (!candidateKeys.length && requiredSpecialty === "mbh" && material.source_key) {
      const sourceRows = await rows("content_sources", {
        select: "id,source_path,file_id,mime_type",
        id: "eq." + String(material.source_key),
        limit: "1",
      });
      const source = sourceRows[0] || null;
      if (source?.file_id) {
        const files = await rows("files", {
          select: "id,object_key,group_id,status",
          id: "eq." + String(source.file_id),
          status: "eq.active",
          limit: "1",
        });
        file = files[0] || file;
        addCandidate(file?.object_key);
      }
      const sourcePath = String(source?.source_path || "").trim();
      addCandidate(sourcePath);
      if (sourcePath.startsWith("photos/")) addCandidate(sourcePath.slice("photos/".length));
      if (sourcePath.startsWith("content/histology/")) addCandidate(sourcePath.slice("content/histology/".length));
      if (sourcePath && !sourcePath.startsWith("source-materials/") &&
          !sourcePath.startsWith("electronograms/") && !sourcePath.startsWith("em/") &&
          !sourcePath.startsWith("5_Фотографии препаратов/") && !sourcePath.startsWith("photos/")) {
        addCandidate("source-materials/" + sourcePath);
      }
    }

    if (!candidateKeys.length) {
      return failure(503, "FILE_UNAVAILABLE", "Физический файл материала ещё не подключён к приватному хранилищу");
    }

    if (requiredSpecialty || file?.group_id) {
      const memberships = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
      const eligible = memberships.filter((membership) => {
        const group = related(membership?.groups);
        return Boolean(group) && group.is_active === true;
      });
      if (file?.group_id && !eligible.some((membership) => String(membership.group_id) === String(file.group_id))) {
        return failure(403, "FORBIDDEN", "Этот файл недоступен вашей учебной группе");
      }
      if (requiredSpecialty && !eligible.some((membership) => {
        const group = related(membership?.groups);
        return String(group?.specialty_slug || "").trim() === requiredSpecialty;
      })) {
        return failure(403, "FORBIDDEN", "Этот материал недоступен для вашей специальности");
      }
    }

    const storage = await getFileStorage(env);
    if (storage && typeof storage.head === "function" && typeof storage.signedReadUrl === "function") {
      try {
        for (const key of candidateKeys) {
          const info = await storage.head(key);
          if (!info) continue;
          const signed = await storage.signedReadUrl(key, { expiresIn: "5m" });
          if (signed?.url) {
            return {
              ok: true,
              data: { url: signed.url, mode: "upstash-blob", expires_in: 300, material_id: id },
            };
          }
        }
      } catch {
        // B2 remains a fallback while the private Blob binding is rolled out.
      }
    }

    for (const key of candidateKeys) {
      const signed = await createB2DownloadUrl(env, key, 600, fetcher);
      if (signed.ok) {
        return {
          ok: true,
          data: {
            url: signed.url,
            mode: "presigned",
            expires_in: signed.expires_in,
            material_id: id,
          },
        };
      }
    }
    return failure(503, "FILE_UNAVAILABLE", "Файл материала не найден в подключённых приватных хранилищах");
  } catch {
    return failure(503, "FILE_URL_UNAVAILABLE", "Не удалось проверить доступ к файлу материала");
  }
}
