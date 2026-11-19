import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, MAX_TITLE, normalizeItems, filterAllowedImageFiles, insertItems, err } from "./shared";

import type { CardPacksRouter } from "./types";

export function registerCrudRoutes(cardPacks: CardPacksRouter) {
cardPacks.post("/", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const title = String(input?.title || "").trim();
  if (!title || title.length > MAX_TITLE) return err(c, rid, 422, "VALIDATION_ERROR", "Нужен заголовок пака (до 200 символов)");
  const description = String(input?.description || "").trim().slice(0, 1000);
  const subjectSlug = String(input?.subject_slug || "").trim().slice(0, 64) || null;
  const source = input?.source === "ai" ? "ai" : "user";
  const isPublished = input?.is_published === true;
    const items = normalizeItems(input?.items);
    if (!items || !items.length) return err(c, rid, 422, "VALIDATION_ERROR", "Нужны карточки (front/back), до 100 на пак");

    const db = c.get("supabase");
    try {
      const allowedItems = await filterAllowedImageFiles(db, c.get("user").id, items);
      const { data: pack, error: packError } = await db
      .from("card_packs")
      .insert({
        owner_id: c.get("user").id,
        title,
        description,
        subject_slug: subjectSlug,
        source,
        is_published: isPublished,
        published_at: isPublished ? new Date().toISOString() : null,
      })
      .select("id,title,subject_slug,source,is_published")
      .single();
    if (packError) throw packError;
    await insertItems(db, pack.id, allowedItems);
    return c.json(ok({ pack, card_count: allowedItems.length }, rid), 201);
  } catch (createError) {
    console.error("[card-packs:create]", createError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить пак");
  }
});

cardPacks.patch("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input?.title === "string" && input.title.trim()) patch.title = input.title.trim().slice(0, MAX_TITLE);
  if (typeof input?.description === "string") patch.description = input.description.trim().slice(0, 1000);
  if (input?.is_published === true || input?.is_published === false) {
    patch.is_published = input.is_published;
    patch.published_at = input.is_published ? new Date().toISOString() : null;
  }
  const db = c.get("supabase");
  try {
    const { data, error } = await db
      .from("card_packs")
      .update(patch)
      .eq("id", id).eq("owner_id", c.get("user").id)
      .select("id,is_published")
      .maybeSingle();
    if (error) throw error;
    if (!data) return err(c, rid, 404, "NOT_FOUND", "Пак не найден или не ваш");
    return c.json(ok({ pack: data }, rid));
  } catch (patchError) {
    console.error("[card-packs:patch]", patchError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить пак");
  }
});

cardPacks.delete("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  const db = c.get("supabase");
  try {
    const { data, error } = await db
      .from("card_packs")
      .delete()
      .eq("id", id).eq("owner_id", c.get("user").id)
      .select("id").maybeSingle();
    if (error) throw error;
    if (!data) return err(c, rid, 404, "NOT_FOUND", "Пак не найден или не ваш");
    return c.json(ok({ deleted: true }, rid));
  } catch (deleteError) {
    console.error("[card-packs:delete]", deleteError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить пак");
  }
});
}
