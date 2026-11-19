import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { latexToUnicode } from "../../lib/latex-unicode";
import { stableHash, isoDate, parseTelegramUserId, loadActiveChallenges, shuffleOrder, challengeStats, guardInternal } from "./shared";

import type { ChallengeRow } from "./shared";

import type { TrainerRouter } from "./types";

export function registerChallengeRoutes(telegramTrainer: TrainerRouter) {
telegramTrainer.get("/internal/trainer/challenge", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const telegramUserId = parseTelegramUserId(c.req.query("telegram_user_id"));
  const mode = String(c.req.query("mode") || "daily") === "random" ? "random" : "daily";
  const requestedId = String(c.req.query("id") || "").trim();
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
    // Режим by-id нужен боту для кнопки «Пройти челлендж» из утренней рассылки.
    if (requestedId) {
      if (!/^[0-9a-f-]{36}$/i.test(requestedId)) {
        const { body, status } = fail("VALIDATION_ERROR", "Некорректный id челленджа", 422, rid);
        return c.json(body, status as 422);
      }
      const { data, error } = await supabase
        .from("bot_chem_challenges")
        .select("id,kind,prompt,equation,variants,correct_index,explanation,formula,subject_name,topic")
        .eq("id", requestedId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return c.json(ok({ challenge: null }, rid));
      const row = data as ChallengeRow;
      const date = isoDate(new Date());
      const order = shuffleOrder(row, `${row.id}:${telegramUserId}:${date}`);
      return c.json(
        ok(
          {
            challenge: {
              id: row.id,
              kind: row.kind,
              prompt: row.prompt,
              equation: row.equation,
              variants: order.map((originalIndex) => String((row.variants[originalIndex] as any)?.label || `Вариант ${originalIndex + 1}`)),
              subject_name: row.subject_name || "",
              topic: row.topic || "",
            },
          },
          rid,
        ),
      );
    }

    const challenges = await loadActiveChallenges(supabase);
    if (!challenges.length) return c.json(ok({ challenge: null }, rid));
    const date = isoDate(new Date());
    const seed = mode === "daily" ? `${date}` : `${telegramUserId}:${date}:${Date.now()}`;
    const challenge = challenges[stableHash(seed) % challenges.length];
    const order = shuffleOrder(challenge, `${challenge.id}:${telegramUserId}:${date}`);
    return c.json(
      ok(
        {
          challenge: {
            id: challenge.id,
            kind: challenge.kind,
            prompt: challenge.prompt,
            equation: challenge.equation,
            variants: order.map((originalIndex) => String((challenge.variants[originalIndex] as any)?.label || `Вариант ${originalIndex + 1}`)),
            subject_name: challenge.subject_name || "",
            topic: challenge.topic || "",
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:challenge]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Челлендж временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.post("/internal/trainer/challenge/check", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const telegramUserId = parseTelegramUserId(payload?.telegram_user_id);
  const challengeId = String(payload?.challenge_id || "").trim();
  const choice = Number(payload?.choice_index);
  if (!telegramUserId || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны telegram_user_id и challenge_id", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data: challenge, error: readError } = await supabase
      .from("bot_chem_challenges")
      .select("id,kind,prompt,equation,variants,correct_index,explanation,formula,subject_name,topic")
      .eq("id", challengeId)
      .eq("is_active", true)
      .maybeSingle();
    if (readError) throw readError;
    if (!challenge) return c.json(ok({ challenge: null }, rid));
    const row = challenge as ChallengeRow;

    const date = isoDate(new Date());
    const order = shuffleOrder(row, `${row.id}:${telegramUserId}:${date}`);
    const labels = row.variants.map((variant, index) => String(variant?.label || `Вариант ${index + 1}`));
    if (!Number.isSafeInteger(choice) || choice < 0 || choice >= order.length) {
      const { body, status } = fail("VALIDATION_ERROR", "Некорректный вариант", 422, rid);
      return c.json(body, status as 422);
    }
    const chosenOriginalIndex = order[choice];
    const isCorrect = chosenOriginalIndex === row.correct_index;

    // Попытка фиксируется для серии; сбой записи не ломает ответ студенту.
    try {
      await supabase.from("bot_challenge_attempts").insert({
        telegram_user_id: telegramUserId,
        challenge_id: row.id,
        chosen_label: labels[chosenOriginalIndex],
        is_correct: isCorrect,
      });
    } catch (attemptError) {
      console.error("[trainer:attempt]", attemptError);
    }

    const stats = await challengeStats(supabase, telegramUserId);
    return c.json(
      ok(
        {
          correct: isCorrect,
          chosen_label: labels[chosenOriginalIndex],
          correct_label: labels[row.correct_index],
          explanation: String(row.explanation || ""),
          formula: String(row.formula || ""),
          formula_unicode: latexToUnicode(String(row.formula || "")),
          equation: row.equation,
          subject_name: row.subject_name || "",
          topic: row.topic || "",
          stats,
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:challenge-check]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Проверка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});
}
