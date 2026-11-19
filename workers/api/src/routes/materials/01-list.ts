import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, attachSource } from "./shared";

import type { MaterialsRouter } from "./types";

export function registerListRoutes(materials: MaterialsRouter) {
materials.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const subjectId = c.req.query("subject_id") || c.req.query("subject") || c.req.query("subject_slug") || c.req.query("subjectSlug");
  const type = c.req.query("type");
  const searchQuery = String(c.req.query("q") || c.req.query("search") || "").trim().slice(0, 120);
  try {
    let query = db
      .from("materials")
      .select(
        "id,subject_id,module_id,topic_id,type,title,file_id,external_url,content_html,order_index,is_published,created_at,updated_at,source_key,subjects(name,slug,course_number,semester,specialty_slug),files(id,original_name,mime_type,size_bytes,object_key,visibility,status,storage_provider,processing_status)",
      )
      .eq("is_published", true)
      .order("order_index", { ascending: true })
      .limit(500);
    if (subjectId) {
      if (UUID.test(subjectId)) query = query.eq("subject_id", subjectId);
      else {
        // Subject slugs are not unique in the legacy catalog. Resolve every
        // matching row instead of maybeSingle(), which silently produced an
        // empty materials list when Supabase returned multiple subject IDs.
        const { data: subjects, error: subjectError } = await db
          .from("subjects")
          .select("id")
          .eq("slug", subjectId);
        if (subjectError) {
          console.error("[materials:subject-scope]", subjectError.message);
          const { body, status } = fail("DB_UNAVAILABLE", "Не удалось определить предмет материалов", 503, rid);
          return c.json(body, status as 503);
        }
        const subjectIds = [...new Set((subjects || [])
          .map((subject: { id?: unknown }) => String(subject.id || ""))
          .filter((id: string) => UUID.test(id)))];
        if (!subjectIds.length) return c.json(ok({ items: [] }, rid));
        query = query.in("subject_id", subjectIds);
      }
    }
    if (type) query = query.eq("type", type);
    if (searchQuery) {
      query = query.ilike("title", "%" + searchQuery + "%");
    }
    const { data, error } = await query;
    if (error) {
      console.error("[materials:list]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const items = await attachSource(db, data || []);
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[materials:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});
}
