import { authenticateSupabaseRequest } from "./supabase-auth.js";
import { createB2DownloadUrl } from "./b2-download.js";
import { getFileStorage } from "./blob-storage.js";
import { safeHistologyObjectKey, trainerCorpusCandidateKeys, PREPARATION_PHOTO_PREFIXES } from "./histology-key-map.js";

const TIMEOUT_MS = 5_000;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
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
    const cards = await rows("trainer_feed_cards_public", {
      select: "id,subject_slug,specialty_slug,mode_set,source_file_id,source_key,preparation,is_published",
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

    // Uploaded histology files preserve their original relative paths. The database
    // still contains legacy hash keys for preparation photos, so resolve those keys
    // against the source filename without changing the Supabase content rows.
    // A registered user/group file is bound to one exact key. Only published
    // corpus rows without a file reference may use historical path aliases.
    const objectKey = safeHistologyObjectKey(file?.object_key);
    const candidateKeys = objectKey
      ? [objectKey]
      : requiredSpecialty === "mbh" && !card.source_file_id
        ? trainerCorpusCandidateKeys(card)
        : [];
    if (!candidateKeys.length) {
      return failure(503, "MEDIA_NOT_MIGRATED", "Оригинал изображения ещё не подключён к приватному хранилищу");
    }

    const storage = await getFileStorage(env);
    if (storage && typeof storage.head === "function" && typeof storage.signedReadUrl === "function") {
      // Prefer an exact canonical key or a known archive alias before searching
      // by basename; otherwise duplicate filenames in different folders can
      // silently display the wrong micropreparation.
      try {
        for (const candidateKey of candidateKeys) {
          const info = await storage.head(candidateKey);
          if (!info) continue;
          const signed = await storage.signedReadUrl(candidateKey, { expiresIn: "5m" });
          if (signed?.url) {
            return {
              ok: true,
              data: { url: signed.url, mode: "upstash-blob", expires_in: 300, card_id: id },
            };
          }
        }
      } catch {
        // Continue to the archive basename resolver and legacy B2 provider.
      }

      // Basename matching is a last resort and must be unambiguous.
      if (card.mode_set === "preparation" && typeof storage.list === "function") {
        const preparation = card.preparation && typeof card.preparation === "object" ? card.preparation : {};
        const basename = String(preparation.imagePath || preparation.imageUrl || "").replace(/\\/g, "/").split("/").pop() || "";
        if (basename) {
          try {
            const pages = await Promise.all(PREPARATION_PHOTO_PREFIXES.map((prefix) => storage.list({ prefix, limit: 1000 })));
            const matchesByPath = new Map();
            for (let i = 0; i < PREPARATION_PHOTO_PREFIXES.length; i += 1) {
              const prefix = PREPARATION_PHOTO_PREFIXES[i];
              for (const blob of Array.isArray(pages[i]?.blobs) ? pages[i].blobs : []) {
                const key = safeHistologyObjectKey(blob?.path);
                if (key && key.startsWith(prefix) && key.split("/").pop() === basename) matchesByPath.set(key, key);
              }
            }
            const matches = [...matchesByPath.values()];
            if (matches.length === 1) {
              const signed = await storage.signedReadUrl(matches[0], { expiresIn: "5m" });
              if (signed?.url) {
                return {
                  ok: true,
                  data: { url: signed.url, mode: "upstash-blob", expires_in: 300, card_id: id },
                };
              }
            }
          } catch {
            // Fall through to exact-key checks and the legacy B2 provider.
          }
        }
      }
      try {
        for (const candidateKey of candidateKeys) {
          const info = await storage.head(candidateKey);
          if (!info) continue;
          const signed = await storage.signedReadUrl(candidateKey, { expiresIn: "5m" });
          if (signed?.url) {
            return {
              ok: true,
              data: { url: signed.url, mode: "upstash-blob", expires_in: 300, card_id: id },
            };
          }
        }
      } catch {
        // Keep the legacy B2 path available if Blob is not configured or reachable.
      }
    }

    // Keep the historical B2 fallback during migration. The canonical DB key is
    // tried first; if it is a legacy hash, try the imagePath-derived aliases too.
    for (const candidateKey of candidateKeys) {
      const signed = await createB2DownloadUrl(env, candidateKey, 600, fetcher);
      if (signed.ok) {
        return {
          ok: true,
          data: { url: signed.url, mode: "presigned", expires_in: signed.expires_in, card_id: id },
        };
      }
    }
    return failure(503, "MEDIA_NOT_MIGRATED", "Файл пока отсутствует в подключённом приватном хранилище");
  } catch (error) {
    if (error?.status === 401) return failure(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return failure(403, "FORBIDDEN", "Тренажёр недоступен");
    return failure(503, "MEDIA_URL_UNAVAILABLE", "Не удалось проверить доступ к изображению");
  }
}
