import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";

import { UUID } from "./shared";

import type { SrsRouter } from "./types";

export function registerDeleteRoutes(srs: SrsRouter) {
srs.delete("/cards/:id", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID карточки", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("srs_cards")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    if (!data || !data.length) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ deleted: true, id }, rid));
  } catch (error) {
    console.error("[srs:delete-card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить карточку", 503, rid);
    return c.json(body, status as 503);
  }
});
}
