import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { MISSING_RELATION, labsQuery } from "./shared";

import type { LabsRouter } from "./types";

export function registerTemplateRoutes(labs: LabsRouter) {
labs.get("/templates", requireAuth, async (c) => {
  const rid = requestId();
  
  try {
    const subject = c.req.query("subject");
    const difficulty = c.req.query("difficulty");
    
    if (difficulty && !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      return c.json(fail("VALIDATION_ERROR", "Некорректный уровень сложности", 422, rid), 422);
    }
    
    const { data, error } = await labsQuery(c, (client) => {
      let query = client.from("lab_templates").select("*").eq("is_published", true);
      if (subject) query = query.eq("subject_area", subject);
      if (difficulty) query = query.eq("difficulty_level", difficulty);
      return query.order("created_at", { ascending: false }).limit(50);
    });
    
    if (error) {
      const code = String((error as { code?: unknown }).code || "");
      console.error("[labs:templates]", code);
      // Схема labs не опубликована в PostgREST и public-вьюх ещё нет
      // (миграция 20261107150000). Это не сбой запроса — раздел готовится:
      // отдаём пустой каталог, чтобы страница не падала в 503.
      if (MISSING_RELATION.has(code)) {
        return c.json(ok({
          items: [],
          available: false,
          note: "Раздел лабораторных готовится: каталог шаблонов ещё не опубликован.",
        }, rid));
      }
      return c.json(fail("DB_UNAVAILABLE", "Шаблоны лабораторных недоступны", 503, rid), 503);
    }
    
    return c.json(ok({ items: data || [], available: true }, rid));
  } catch (error) {
    console.error("[labs:templates]", error);
    return c.json(fail("LABS_UNAVAILABLE", "Интерактивные лаборатории временно недоступны", 503, rid), 503);
  }
});
}
