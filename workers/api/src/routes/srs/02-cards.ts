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

/**
 * POST /srs/trainer — добавить микропрепараты в повторение.
 *
 * Карточка строится из методички: на лицевой стороне диагностические признаки,
 * на обороте — название препарата и структуры. Ключ идемпотентности — `key`
 * гида в `source_key`: повторный вызов не создаёт дублей.
 */
srs.post("/trainer", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const count = Math.max(1, Math.min(50, Number(payload?.count ?? 10) || 10));
  // Точечное добавление: `keys` — конкретные препараты (например, ошибка в
  // диагностикуме). Без `keys` сохраняется прежний режим «набрать колоду».
  const requestedKeys: string[] = Array.isArray(payload?.keys)
    ? Array.from(
        new Set(
          (payload.keys as unknown[])
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      ).slice(0, 20)
    : [];
  const limitRows = requestedKeys.length ? requestedKeys.length : count;
  try {
    const { data: guides, error: guidesError } = await supabase
      .from("preparation_guides")
      .select("key,name,section,features,structures")
      .order("section", { ascending: true })
      .limit(500);
    if (guidesError) throw guidesError;

    const { data: existing, error: existingError } = await supabase
      .from("srs_cards")
      .select("source_key")
      .eq("user_id", user.id)
      .eq("source_type", "trainer_card");
    if (existingError) throw existingError;
    const covered = new Set((existing || []).map((row: any) => String(row.source_key || "")));

    const rows: Record<string, unknown>[] = [];
    const pool = requestedKeys.length
      ? ((guides || []) as any[]).filter((row) => requestedKeys.includes(String(row.key || "")))
      : ((guides || []) as any[]);
    for (const guide of pool) {
      if (rows.length >= limitRows) break;
      const key = String(guide.key || "");
      const name = String(guide.name || "").trim();
      const features = Array.isArray(guide.features)
        ? guide.features.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : [];
      // Без признаков лицевая сторона бессмысленна: это была бы угадайка по названию.
      if (!key || !name || !features.length || covered.has(key)) continue;
      covered.add(key);
      const structures = Array.isArray(guide.structures)
        ? guide.structures.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : [];
      rows.push({
        user_id: user.id,
        source_type: "trainer_card",
        source_key: key,
        front: `Определи препарат: ${features.slice(0, 2).join("; ")}`,
        back: structures.length ? `${name} · структуры: ${structures.join(", ")}` : name,
        subject_slug: "histology",
        topic: String(guide.section || "").trim() || null,
        ease: 2.5,
        interval: 0,
        reps: 0,
        due_at: new Date().toISOString(),
      });
    }

    if (!rows.length) return c.json(ok({ added: 0, requested: requestedKeys.length }, rid));
    const { error: insertError } = await supabase.from("srs_cards").insert(rows);
    if (insertError) throw insertError;
    return c.json(ok({ added: rows.length, requested: requestedKeys.length }, rid));
  } catch (error) {
    console.error("[srs:trainer]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось добавить микропрепараты", 503, rid);
    return c.json(body, status as 503);
  }
});
}
