import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, MAX_PACK_ITEMS, insertItems, err } from "./shared";

import type { CardPacksRouter } from "./types";

export function registerImportRoutes(cardPacks: CardPacksRouter) {
cardPacks.post("/:id/import", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  const db = c.get("supabase");
  try {
    const { data: source, error: sourceError } = await db
      .from("card_packs")
      .select("id,title,description,subject_slug,source,is_published")
      .eq("id", id).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return err(c, rid, 404, "NOT_FOUND", "Пак не найден");
    if (!source.is_published) return err(c, rid, 403, "FORBIDDEN", "Импортировать можно только опубликованные паки");
    const { data: items, error: itemsError } = await db
      .from("card_pack_items")
      .select("front,back,image_file_id,order_index")
      .eq("pack_id", id).order("order_index", { ascending: true }).limit(MAX_PACK_ITEMS);
    if (itemsError) throw itemsError;
    const { data: copy, error: copyError } = await db
      .from("card_packs")
      .insert({
        owner_id: c.get("user").id,
        title: source.title,
        description: source.description,
        subject_slug: source.subject_slug,
        source: source.source,
        is_published: false,
      })
      .select("id,title")
      .single();
    if (copyError) throw copyError;
    // Картинки опубликованного пака читаемы всеми (visibility=public при
    // загрузке) — при импорте переносим ссылку, бинарник не дублируем.
    await insertItems(db, copy.id, (items || []).map((item: any) => ({ front: String(item.front || ""), back: String(item.back || ""), image_file_id: item.image_file_id || null })));
    return c.json(ok({ pack: copy, card_count: (items || []).length }, rid), 201);
  } catch (importError) {
    console.error("[card-packs:import]", importError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось скопировать пак");
  }
});
}
