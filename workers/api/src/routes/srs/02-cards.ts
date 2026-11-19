import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";

import { UUID, CARD_FIELDS, formatCard, subjectNames, loadCards, filterCards } from "./shared";

import type { SrsRow } from "./shared";

import type { SrsRouter } from "./types";

export function registerCardRoutes(srs: SrsRouter) {
srs.get("/cards", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 100) || 100));
  const options = {
    subjectId: c.req.query("subject_id"),
    subjectSlug: c.req.query("subject_slug"),
    scope: c.req.query("scope"),
  };
  try {
    const names = await subjectNames(supabase);
    const now = Math.round(Date.now() / 1000);
    const rows = filterCards(await loadCards(supabase, user.id, 2000), options);
    const items = rows.slice(0, limit).map((row) => formatCard(row, names, now));
    return c.json(ok({ items, count: items.length }, rid));
  } catch (error) {
    console.error("[srs:cards]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

srs.post("/cards", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const front = String(payload?.front || "").trim();
  const back = String(payload?.back || "").trim();
  if (!front) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите лицевую сторону карточки", 422, rid);
    return c.json(body, status as 422);
  }
  let subjectId = String(payload?.subject_id || "").trim();
  const subjectSlug = String(payload?.subject_slug || "").trim();
  try {
    if (!UUID.test(subjectId) && subjectSlug) {
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id")
        .eq("slug", subjectSlug)
        .eq("is_active", true)
        .limit(1);
      subjectId = String(subjects?.[0]?.id || "");
    }
    const { data, error } = await supabase
      .from("srs_cards")
      .insert({
        user_id: user.id,
        source_type: "personal",
        front,
        back,
        subject_id: UUID.test(subjectId) ? subjectId : null,
        subject_slug: subjectSlug || null,
        topic: String(payload?.topic || "").trim() || null,
        ease: 2.5,
        interval: 0,
        reps: 0,
        due_at: new Date().toISOString(),
      })
      .select(CARD_FIELDS)
      .single();
    if (error) throw error;
    const names = await subjectNames(supabase);
    return c.json(ok({ card: formatCard(data as SrsRow, names, Math.round(Date.now() / 1000)) }, rid), 201);
  } catch (error) {
    console.error("[srs:add-card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось добавить карточку", 503, rid);
    return c.json(body, status as 503);
  }
});
}
