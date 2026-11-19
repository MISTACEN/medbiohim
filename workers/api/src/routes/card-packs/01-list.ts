import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, MAX_PACK_ITEMS, relation, err } from "./shared";

import type { CardPacksRouter } from "./types";

export function registerListRoutes(cardPacks: CardPacksRouter) {
cardPacks.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const scope = String(c.req.query("scope") || "mine").trim();
  const subjectSlug = String(c.req.query("subject_slug") || "").trim() || null;
  try {
    let query = db
      .from("card_packs")
      .select("id,owner_id,title,description,subject_slug,source,is_published,created_at,updated_at,users!card_packs_owner_id_fkey(full_name,display_name),card_pack_items(count)")
      .order("updated_at", { ascending: false })
      .limit(100);
    query = scope === "shared" ? query.eq("is_published", true) : query.eq("owner_id", c.get("user").id);
    if (subjectSlug) query = query.eq("subject_slug", subjectSlug);
    const { data, error } = await query;
    if (error) throw error;
    const items = (data || []).map((row: any) => {
      const owner = relation(row.users);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        subject_slug: row.subject_slug,
        source: row.source,
        is_published: row.is_published,
        mine: row.owner_id === c.get("user").id,
        owner_name: owner?.full_name || owner?.display_name || null,
        card_count: Array.isArray(row.card_pack_items) ? (row.card_pack_items[0]?.count ?? 0) : 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
    return c.json(ok({ items }, rid));
  } catch (listError) {
    console.error("[card-packs:list]", listError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Паки недоступны");
  }
});

cardPacks.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  try {
    const { data: pack, error: packError } = await db
      .from("card_packs")
      .select("id,owner_id,title,description,subject_slug,source,is_published,created_at,updated_at,users!card_packs_owner_id_fkey(full_name,display_name)")
      .eq("id", id).maybeSingle();
    if (packError) throw packError;
    if (!pack) return err(c, rid, 404, "NOT_FOUND", "Пак не найден");
    const { data: items, error: itemsError } = await db
      .from("card_pack_items")
      .select("id,front,back,image_file_id,order_index")
      .eq("pack_id", id).order("order_index", { ascending: true }).limit(MAX_PACK_ITEMS);
    if (itemsError) throw itemsError;
    const owner = relation(pack.users);
    return c.json(ok({
      pack: {
        id: pack.id,
        title: pack.title,
        description: pack.description,
        subject_slug: pack.subject_slug,
        source: pack.source,
        is_published: pack.is_published,
        mine: pack.owner_id === c.get("user").id,
        owner_name: owner?.full_name || owner?.display_name || null,
        created_at: pack.created_at,
      },
      items: (items || []).map((item: any) => ({ id: item.id, front: item.front, back: item.back, image_file_id: item.image_file_id || null, order_index: item.order_index })),
    }, rid));
  } catch (readError) {
    console.error("[card-packs:get]", readError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Пак недоступен");
  }
});
}
