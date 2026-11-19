import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { nextReviewState } from "../srs";
import { RATING_MIN, RATING_MAX, parseTelegramUserId, resolveUserId, loadDueCount, guardInternal } from "./shared";

import type { TrainerRouter } from "./types";

export function registerReviewRoutes(telegramTrainer: TrainerRouter) {
telegramTrainer.post("/internal/trainer/review", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const telegramUserId = parseTelegramUserId(payload?.telegram_user_id);
  const cardId = String(payload?.card_id || "").trim();
  const rating = Number(payload?.rating);
  if (!telegramUserId || !/^[0-9a-f-]{36}$/i.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны telegram_user_id и card_id", 422, rid);
    return c.json(body, status as 422);
  }
  if (!Number.isFinite(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    const { body, status } = fail("VALIDATION_ERROR", "Оценка должна быть от 1 до 4", 422, rid);
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
    const { data: current, error: readError } = await supabase
      .from("srs_cards")
      .select("id,user_id,ease,interval,reps")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return c.json(ok({ card: null }, rid));

    const next = nextReviewState(current as any, rating);
    const now = new Date();
    const { error: writeError } = await supabase
      .from("srs_cards")
      .update({
        ease: next.ease,
        interval: next.interval,
        reps: next.reps,
        due_at: next.due_at,
        reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", cardId)
      .eq("user_id", userId);
    if (writeError) throw writeError;

    const dueLeft = await loadDueCount(supabase, userId);
    return c.json(ok({ reviewed: true, rating, due_left: dueLeft, next_due_at: next.due_at }, rid));
  } catch (error) {
    console.error("[trainer:review]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить повтор", 503, rid);
    return c.json(body, status as 503);
  }
});
}
