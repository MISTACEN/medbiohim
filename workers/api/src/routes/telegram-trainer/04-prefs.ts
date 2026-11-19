import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { parseTelegramUserId, guardInternal } from "./shared";

import type { TrainerRouter } from "./types";

export function registerPrefsRoutes(telegramTrainer: TrainerRouter) {
telegramTrainer.get("/internal/trainer/prefs", async (c) => {
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
    const { data, error } = await supabase
      .from("bot_daily_prefs")
      .select("drill_enabled,challenge_enabled")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (error) throw error;
    return c.json(
      ok(
        {
          prefs: {
            drill_enabled: (data as any)?.drill_enabled !== false,
            challenge_enabled: (data as any)?.challenge_enabled !== false,
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:prefs-read]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Подписка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.post("/internal/trainer/prefs", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const telegramUserId = parseTelegramUserId(payload?.telegram_user_id);
  if (!telegramUserId) {
    const { body, status } = fail("VALIDATION_ERROR", "telegram_user_id обязателен", 422, rid);
    return c.json(body, status as 422);
  }
  const drillEnabled = payload?.drill_enabled === undefined ? true : payload.drill_enabled === true;
  const challengeEnabled = payload?.challenge_enabled === undefined ? true : payload.challenge_enabled === true;
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await supabase
      .from("bot_daily_prefs")
      .upsert(
        { telegram_user_id: telegramUserId, drill_enabled: drillEnabled, challenge_enabled: challengeEnabled, updated_at: new Date().toISOString() },
        { onConflict: "telegram_user_id" },
      )
      .select("telegram_user_id,drill_enabled,challenge_enabled")
      .maybeSingle();
    if (error) throw error;
    return c.json(ok({ saved: true, prefs: data || null }, rid));
  } catch (error) {
    console.error("[trainer:prefs]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить подписку", 503, rid);
    return c.json(body, status as 503);
  }
});
}
