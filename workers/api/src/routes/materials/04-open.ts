import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID } from "./shared";

import type { MaterialsRouter } from "./types";

export function registerOpenRoutes(materials: MaterialsRouter) {
materials.post("/:id/open", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID материала", 400, rid);
    return c.json(body, status as 400);
  }
  const { data: material, error: readError } = await db
    .from("materials").select("id").eq("id", id).eq("is_published", true).maybeSingle();
  if (readError) {
    const { body, status } = fail("DB_UNAVAILABLE", "Материал недоступен", 503, rid);
    return c.json(body, status as 503);
  }
  if (!material) {
    const { body, status } = fail("NOT_FOUND", "Опубликованный материал не найден", 404, rid);
    return c.json(body, status as 404);
  }
  const { error } = await db.from("material_views").upsert(
    { user_id: user.id, material_id: id, opened_at: new Date().toISOString() },
    { onConflict: "user_id,material_id" }
  );
  if (error) {
    console.error("[materials:open]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить отметку", 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok({ material_id: id, opened: true }, rid));
});
}
