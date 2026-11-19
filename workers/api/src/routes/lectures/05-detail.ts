import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { logActivity } from "../../lib/activity";
import { loadPersonalLecture } from "./shared";

import type { LecturesRouter } from "./types";

export function registerDetailRoutes(lectures: LecturesRouter) {
lectures.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id") || "";
  try {
    const { data, error } = await supabase
      .from("histology_lectures")
      .select("id,subject_slug,specialty_scope,title,kind,prep_names,linked_prep_ids,body_markdown,description_algorithm_ref,is_published,created_at,updated_at")
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) {
      console.error("[lectures:detail]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      // Личная лекция автора: открываем по тому же адресу (импорт конспекта
      // и Мастерская ведут на /lectures/<id>).
      const personal = await loadPersonalLecture(supabase, id, c.get("user").id);
      if (!personal) {
        const { body, status } = fail("NOT_FOUND", "Лекция не найдена", 404, rid);
        return c.json(body, status as 404);
      }
      await logActivity(c.env, {
        userId: c.get("user").id,
        kind: "lecture_opened",
        subjectSlug: personal.subject_slug || null,
        refId: personal.id,
      });
      return c.json(ok(personal, rid));
    }
    // Фаза 5: открытие лекции — событие ленты.
    await logActivity(c.env, {
      userId: c.get("user").id,
      kind: "lecture_opened",
      subjectSlug: (data as any).subject_slug ?? null,
      refId: String((data as any).id || id),
    });
    return c.json(ok(data, rid));
  } catch (error) {
    console.error("[lectures:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});
}
