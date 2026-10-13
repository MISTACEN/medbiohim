import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

/**
 * Read published subject materials with the caller JWT only.
 * Specialty-scoped subjects require an active group membership in that specialty.
 * No service-role key or legacy HTTP proxy is used.
 */
export async function listSupabaseSubjectMaterials(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

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

  const subjectId = String(filters.subject_id || "").trim();
  const subjectSlug = String(filters.subject_slug || "").trim();
  const materialId = String(filters.material_id || "").trim();
  const type = String(filters.type || "").trim();
  const queryText = String(filters.q || "").trim();
  if ([subjectId, subjectSlug, materialId, type, queryText].some((value) => value.length > 200) ||
      (subjectId && !/^[A-Za-z0-9_-]+$/.test(subjectId)) ||
      (subjectSlug && !/^[A-Za-z0-9_-]+$/.test(subjectSlug)) ||
      (materialId && !/^[A-Za-z0-9_-]+$/.test(materialId)) ||
      (type && !/^[A-Za-z0-9_-]+$/.test(type))) {
    return failure(422, "VALIDATION_ERROR", "Material filters are invalid or too long");
  }

  const materialQuery = {
    select: "id,subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,created_at,updated_at,source_key,subjects!inner(name,slug,specialty_slug,is_active),modules(title),topics(title)",
    is_published: "eq.true",
    "subjects.is_active": "eq.true",
    order: "subject_id.asc,order_index.asc.nullslast,title.asc",
    limit: "500",
  };
  if (subjectId) materialQuery.subject_id = "eq." + subjectId;
  if (materialId) materialQuery.id = "eq." + materialId;
  if (subjectSlug) materialQuery["subjects.slug"] = "eq." + subjectSlug;
  if (type) materialQuery.type = "eq." + type;
  if (queryText) {
    const escaped = queryText.replace(/[^\p{L}\p{N}\s_-]/gu, " ");
    materialQuery.or = "(title.ilike.*" + escaped + "*,content_html.ilike.*" + escaped + "*)";
  }

  let items;
  try {
    items = await rows("materials", materialQuery);
  } catch {
    return failure(503, "MATERIALS_UNAVAILABLE", "Учебные материалы временно недоступны");
  }

  const sourceIds = [...new Set(items.map((item) => String(item.source_key || "")).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))];
  const sourcesById = new Map();
  if (sourceIds.length) {
    try {
      const sourceRows = await rows("content_sources", {
        select: "id,source_path,original_format,mime_type",
        id: "in.(" + sourceIds.join(",") + ")",
      });
      for (const source of sourceRows) sourcesById.set(String(source.id), source);
    } catch {
      return failure(503, "MATERIALS_UNAVAILABLE", "Метаданные файлов временно недоступны");
    }
  }

  const membershipsBySpecialty = new Map();
  const requiredSpecialties = new Set();
  for (const item of items) {
    const subject = related(item.subjects);
    const slug = String(subject?.slug || "").trim();
    const specialty = String(subject?.specialty_slug || "").trim();
    const required = slug === "histology" || specialty === "mbh" ? "mbh" : specialty;
    if (required) requiredSpecialties.add(required);
  }

  if (requiredSpecialties.size) {
    let memberships;
    try {
      memberships = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Доступ к учебным материалам не удалось проверить");
    }
    for (const specialty of requiredSpecialties) {
      membershipsBySpecialty.set(specialty, memberships.some((membership) => {
        const group = related(membership?.groups);
        return Boolean(group) && group.is_active === true &&
          String(group.specialty_slug || "").trim() === specialty;
      }));
    }
  }

  const visible = items.filter((item) => {
    const subject = related(item.subjects);
    const slug = String(subject?.slug || "").trim();
    const specialty = String(subject?.specialty_slug || "").trim();
    const required = slug === "histology" || specialty === "mbh" ? "mbh" : specialty;
    return !required || membershipsBySpecialty.get(required) === true;
  }).map((item) => {
    const subject = related(item.subjects) || {};
    const source = sourcesById.get(String(item.source_key || "")) || {};
    const module = related(item.modules) || {};
    const topic = related(item.topics) || {};
    return {
      id: item.id,
      subject_id: item.subject_id,
      module_id: item.module_id ?? null,
      topic_id: item.topic_id ?? null,
      type: item.type,
      title: item.title,
      file_id: item.file_id ?? null,
      external_url: item.external_url ?? null,
      content_html: item.content_html ?? null,
      order_index: item.order_index ?? null,
      is_published: item.is_published,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
      source_key: item.source_key ?? null,
      subject_name: subject.name ?? null,
      subject_slug: subject.slug ?? null,
      specialty_slug: subject.specialty_slug ?? null,
      source: {
        id: source.id ?? null,
        key: item.source_key ?? null,
        file_id: item.file_id ?? null,
        name: null,
        mime_type: source.mime_type ?? null,
        source_path: source.source_path ?? null,
        original_format: source.original_format ?? null,
        size_bytes: null,
        // Cloudflare Worker currently has no B2 signing binding. Never fabricate a URL.
        download_url: null,
      },
      module_title: module.title ?? null,
      topic_title: topic.title ?? null,
    };
  });

  return { ok: true, data: { items: visible, source: "supabase" } };
}
