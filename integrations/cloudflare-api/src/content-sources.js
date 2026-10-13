import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

/**
 * Read source metadata with the caller JWT only.
 * Histology sources always require an active MBH group membership.
 * The binary download stays unavailable until private storage signing is configured.
 */
export async function getSupabaseContentSource(request, env, sourceId, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const id = String(sourceId || "").trim();
  if (!id || id.length > 200 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return failure(422, "VALIDATION_ERROR", "Invalid content source id");
  }

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, query) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== "" && value !== null && value !== undefined) endpoint.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new Error("Supabase REST read failed");
    }
    if (response.status >= 300 && response.status < 400) throw new Error("Supabase REST redirect refused");
    if (!response.ok) throw new Error("Supabase REST read failed");
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Supabase REST returned an invalid collection");
    return payload;
  }

  let source;
  try {
    const sources = await rows("content_sources", {
      select: "id,title,source_path,mime_type,original_format,source_archive,note,file_id,created_at",
      id: "eq." + id,
      limit: "1",
    });
    source = sources[0];
  } catch {
    return failure(503, "CONTENT_SOURCE_UNAVAILABLE", "Метаданные первоисточника временно недоступны");
  }
  if (!source) return failure(404, "NOT_FOUND", "Content source not found");

  const normalizedPath = String(source.source_path || "").replace(/\\/g, "/").trim();
  const normalizedId = String(source.id || id).toLowerCase();
  const pathIsHistology = /(?:^|\/)(?:content|features)\/histology(?:-content)?\//i.test(normalizedPath);
  let requiresMbh = normalizedId === "histology" ||
    normalizedId.startsWith("histology-") ||
    pathIsHistology;

  try {
    const linkedMaterials = await rows("materials", {
      select: "subject_id,subjects!inner(slug,specialty_slug,is_active)",
      source_key: "eq." + id,
    });
    if (linkedMaterials.some((item) => {
      const subject = related(item.subjects);
      return String(subject?.slug || "").trim() === "histology" ||
        String(subject?.specialty_slug || "").trim() === "mbh";
    })) {
      requiresMbh = true;
    }
  } catch {
    // Do not expose potentially specialty-scoped source metadata when the linked
    // material scope cannot be established. An ID/path heuristic is not enough.
    return failure(503, "CONTENT_SOURCE_UNAVAILABLE", "Доступ к первоисточнику не удалось проверить");
  }

  if (requiresMbh) {
    let memberships;
    try {
      memberships = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к первоисточнику не удалось проверить");
    }
    const hasMbhMembership = memberships.some((membership) => {
      const group = related(membership?.groups);
      return Boolean(group) && group.is_active === true &&
        String(group.specialty_slug || "").trim() === "mbh";
    });
    if (!hasMbhMembership) {
      return failure(403, "FORBIDDEN", "Этот материал доступен только специальности МБХ");
    }
  }

  return {
    ok: true,
    data: {
      source: {
        id: source.id,
        title: source.title ?? null,
        source_path: source.source_path ?? null,
        mime_type: source.mime_type ?? null,
        original_format: source.original_format ?? null,
        source_archive: source.source_archive ?? null,
        note: source.note ?? null,
        file_id: source.file_id ?? null,
        created_at: source.created_at ?? null,
      },
      // The Worker currently has no B2 signing binding. Never return a guessed URL.
      download: null,
    },
  };
}
