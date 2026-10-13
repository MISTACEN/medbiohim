import { authenticateSupabaseRequest } from "./supabase-auth.js";
import { createB2DownloadUrl } from "./b2-download.js";

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
    if (!file || !String(file.object_key || "").trim()) {
      // This Worker has no SpaceWeb filesystem binding; never fabricate a URL.
      return failure(503, "FILE_UNAVAILABLE", "Физический файл материала ещё не подключён к приватному хранилищу");
    }

    if (requiredSpecialty || file.group_id) {
      const memberships = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
      const eligible = memberships.filter((membership) => {
        const group = related(membership?.groups);
        return Boolean(group) && group.is_active === true;
      });
      if (file.group_id && !eligible.some((membership) => String(membership.group_id) === String(file.group_id))) {
        return failure(403, "FORBIDDEN", "Этот файл недоступен вашей учебной группе");
      }
      if (requiredSpecialty && !eligible.some((membership) => {
        const group = related(membership?.groups);
        return String(group?.specialty_slug || "").trim() === requiredSpecialty;
      })) {
        return failure(403, "FORBIDDEN", "Этот материал недоступен для вашей специальности");
      }
    }

    const signed = await createB2DownloadUrl(env, file.object_key, 600, fetcher);
    if (!signed.ok) return signed;
    return {
      ok: true,
      data: {
        url: signed.url,
        mode: "presigned",
        expires_in: signed.expires_in,
        material_id: id,
      },
    };
  } catch {
    return failure(503, "FILE_URL_UNAVAILABLE", "Не удалось проверить доступ к файлу материала");
  }
}
