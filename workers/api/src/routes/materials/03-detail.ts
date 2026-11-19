import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, readMaterial, attachSource } from "./shared";

import type { MaterialsRouter } from "./types";

export function registerDetailRoutes(materials: MaterialsRouter) {
materials.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID материала", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await readMaterial(db, id);
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Опубликованный материал не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const [item] = await attachSource(db, [data]);
    return c.json(ok({ item }, rid));
  } catch (error) {
    console.error("[materials:get]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Материал недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});
}
