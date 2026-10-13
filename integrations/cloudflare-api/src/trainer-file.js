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

function safeObjectKey(value) {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f]/.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

export async function getSupabaseTrainerImageUrl(request, env, cardId, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const id = String(cardId || "").trim();
  if (!id || id.length > 200 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return failure(422, "VALIDATION_ERROR", "Invalid trainer card id");
  }

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "DB_NOT_CONFIGURED", "Медиа тренажёра временно недоступны");
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
    if (!response.ok) {
      const error = new Error("Database read failed");
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid database response");
    return payload;
  }

  try {
    // Query the base table with the caller JWT so its RLS policies remain in force.
    // source_key is the legacy canonical object path and permits staged migration
    // without inventing fake public.files rows for files that have not been copied.
    const cards = await rows("trainer_feed_cards", {
      select: "id,subject_slug,specialty_slug,source_file_id,source_key,is_published",
      id: "eq." + id,
      is_published: "eq.true",
      limit: "1",
    });
    const card = cards[0];
    if (!card) return failure(404, "NOT_FOUND", "Trainer image not found");

    const subjectSlug = String(card.subject_slug || "");
    const specialty = String(card.specialty_slug || "").trim();
    const requiredSpecialty = subjectSlug === "histology" || specialty === "mbh" ? "mbh" : specialty;
    let file = null;
    if (card.source_file_id) {
      const files = await rows("files", {
        select: "id,object_key,group_id,status",
        id: "eq." + String(card.source_file_id),
        status: "eq.active",
        limit: "1",
      });
      file = files[0] || null;
      if (!file || !String(file.object_key || "").trim()) {
        return failure(404, "NOT_FOUND", "Trainer image not found");
      }
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
        return failure(403, "FORBIDDEN", "Это изображение недоступно вашей учебной группе");
      }
      if (requiredSpecialty && !eligible.some((membership) => {
        const group = related(membership?.groups);
        return String(group?.specialty_slug || "").trim() === requiredSpecialty;
      })) {
        return failure(403, "FORBIDDEN", "Это изображение доступно только специальности МБХ");
      }
    }

    // Existing histology cards already carry a canonical source_key. Use it only
    // for the published MBH corpus, never for arbitrary non-member/group files.
    let objectKey = safeObjectKey(file?.object_key);
    if (!objectKey && requiredSpecialty === "mbh" && !card.source_file_id) {
      objectKey = safeObjectKey(card.source_key);
    }
    if (!objectKey) {
      return failure(503, "MEDIA_NOT_MIGRATED", "Оригинал изображения ещё не подключён к приватному хранилищу");
    }

    const storage = await getFileStorage(env);
    if (storage && typeof storage.head === "function" && typeof storage.signedReadUrl === "function") {
      try {
        const info = await storage.head(objectKey);
        if (info) {
          const signed = await storage.signedReadUrl(objectKey, { expiresIn: "5m" });
          if (signed?.url) {
            return {
              ok: true,
              data: { url: signed.url, mode: "upstash-blob", expires_in: 300, card_id: id },
            };
          }
        }
      } catch {
        // Keep the old B2 path available during the controlled storage migration.
      }
    }

    const signed = await createB2DownloadUrl(env, objectKey, 600, fetcher);
    if (!signed.ok) {
      return failure(503, "MEDIA_NOT_MIGRATED", "Файл пока отсутствует в подключённом приватном хранилище");
    }
    return {
      ok: true,
      data: { url: signed.url, mode: "presigned", expires_in: signed.expires_in, card_id: id },
    };
  } catch (error) {
    if (error?.status === 401) return failure(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return failure(403, "FORBIDDEN", "Тренажёр недоступен");
    return failure(503, "MEDIA_URL_UNAVAILABLE", "Не удалось проверить доступ к изображению");
  }
}
