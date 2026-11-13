// Метаданные первоисточников контента (content_sources): страница
// /materials/source открывает их по id. Таблица content_sources не имеет RLS,
// поэтому доступ к потенциально специальностным (МБХ) источникам проверяется
// явно — логика перенесена из legacy-воркера (integrations/cloudflare-api).
// Бинарная загрузка здесь не отдаётся: подпись приватного storage не настроена,
// download всегда null.

import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

type Variables = AuthVariables;

const contentSources = new Hono<{ Bindings: Env; Variables: Variables }>();

function related(value: any) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

contentSources.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const user = c.get("user");
  const sourceId = String(c.req.param("id") || "").trim();

  if (!sourceId || sourceId.length > 200 || !/^[A-Za-z0-9_-]+$/.test(sourceId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Invalid content source id", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    const { data: sources, error: sourceError } = await supabase
      .from("content_sources")
      .select("id,title,source_path,mime_type,original_format,source_archive,note,file_id,created_at")
      .eq("id", sourceId)
      .limit(1);
    if (sourceError) throw sourceError;
    const source = (sources || [])[0];
    if (!source) {
      const { body, status } = fail("NOT_FOUND", "Content source not found", 404, rid);
      return c.json(body, status as 404);
    }

    const normalizedPath = String(source.source_path || "").replace(/\\/g, "/").trim();
    const normalizedId = String(source.id || sourceId).toLowerCase();
    const pathIsHistology = /(?:^|\/)(?:content|features)\/histology(?:-content)?\//i.test(normalizedPath);
    let requiresMbh =
      normalizedId === "histology" ||
      normalizedId.startsWith("histology-") ||
      pathIsHistology;

    // Специальностные источники определяются и по связанным материалам:
    // если source_key ведёт на материал гистологии или МБХ — доступ проверяем.
    const { data: linkedMaterials, error: linkedError } = await supabase
      .from("materials")
      .select("subject_id,subjects!inner(slug,specialty_slug,is_active)")
      .eq("source_key", sourceId);
    if (linkedError) {
      // Не раскрываем метаданные, когда область связанного материала
      // установить не удалось: эвристики по id/пути недостаточно.
      const { body, status } = fail("DB_UNAVAILABLE", "Доступ к первоисточнику не удалось проверить", 503, rid);
      return c.json(body, status as 503);
    }
    if ((linkedMaterials || []).some((item: any) => {
      const subject = related(item.subjects);
      return String(subject?.slug || "").trim() === "histology" ||
        String(subject?.specialty_slug || "").trim() === "mbh";
    })) {
      requiresMbh = true;
    }

    if (requiresMbh) {
      const { data: memberships, error: membershipError } = await supabase
        .from("group_memberships")
        .select("group_id,groups(specialty_slug,is_active)")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (membershipError) {
        const { body, status } = fail("DB_UNAVAILABLE", "Доступ к первоисточнику не удалось проверить", 503, rid);
        return c.json(body, status as 503);
      }
      const hasMbhMembership = (memberships || []).some((membership: any) => {
        const group = related(membership?.groups);
        return Boolean(group) && group.is_active === true &&
          String(group.specialty_slug || "").trim() === "mbh";
      });
      if (!hasMbhMembership) {
        const { body, status } = fail("FORBIDDEN", "Этот материал доступен только специальности МБХ", 403, rid);
        return c.json(body, status as 403);
      }
    }

    return c.json(ok({
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
      // Подпись приватного storage в этом воркере не настроена — guessed URL
      // никогда не возвращаем.
      download: null,
    }, rid));
  } catch (error) {
    console.error("[content-sources:get]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Метаданные первоисточника временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

export default contentSources;
