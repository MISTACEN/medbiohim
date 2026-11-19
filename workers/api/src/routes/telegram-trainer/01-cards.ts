import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { DUE_CARD_LIMIT, parseTelegramUserId, resolveUserId, loadDueCards, loadDueCount, guardInternal } from "./shared";

import type { TrainerRouter } from "./types";

export function registerCardRoutes(telegramTrainer: TrainerRouter) {
telegramTrainer.get("/internal/trainer/cards", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const telegramUserId = parseTelegramUserId(c.req.query("telegram_user_id"));
  if (!telegramUserId) {
    const { body, status } = fail("VALIDATION_ERROR", "telegram_user_id обязателен", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const userId = await resolveUserId(supabase, telegramUserId);
    if (!userId) return c.json(ok({ linked: false, cards: [], due: 0 }, rid));
    const cards = await loadDueCards(supabase, userId, DUE_CARD_LIMIT);
    const due = await loadDueCount(supabase, userId);
    return c.json(ok({ linked: true, cards, due, total: cards.length }, rid));
  } catch (error) {
    console.error("[trainer:cards]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Тренажёр временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.get("/internal/trainer/card", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const telegramUserId = parseTelegramUserId(c.req.query("telegram_user_id"));
  const cardId = String(c.req.query("card_id") || "").trim();
  if (!telegramUserId || !/^[0-9a-f-]{36}$/i.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны telegram_user_id и card_id", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const userId = await resolveUserId(supabase, telegramUserId);
    if (!userId) return c.json(ok({ linked: false }, rid));
    const { data, error } = await supabase
      .from("srs_cards")
      .select("id,front,back,subject_slug,topic")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json(ok({ card: null }, rid));
    return c.json(
      ok(
        {
          card: {
            id: String((data as any).id),
            front: String((data as any).front || ""),
            back: String((data as any).back || ""),
            subject: String((data as any).subject_slug || ""),
            topic: String((data as any).topic || ""),
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Тренажёр временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});
}
