import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import {
  normalizeClientId,
  readIdempotent,
  writeIdempotent,
} from "../../lib/idempotency";

/** Пространство ключей идемпотентности именно для ответов тренажёров. */
const IDEMPOTENCY_SCOPE = "trainer-answer";

import type { TrainersRouter } from "./types";

export function registerAnswerRoutes(trainers: TrainersRouter) {
trainers.post("/feed/answer", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: {
    card_id?: string;
    answer?: string;
    option_id?: string;
    answer_text?: string;
    is_skipped?: boolean;
    time_ms?: number;
    /** Отметка офлайн-очереди: сюда попадают только собственные ответы. */
    origin?: string;
    /** Ключ повтора: один и тот же ответ не должен записаться дважды. */
    client_id?: string;
  } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!payload.card_id) {
    const { body, status } = fail("VALIDATION", "Нужен card_id", 400, rid);
    return c.json(body, status as 400);
  }
  // Происхождение записи: офлайн-очередь всегда отправляет origin: "user".
  // Клиент не может выдать свой ответ за импорт/синхронизацию.
  if (payload.origin && payload.origin !== "user") {
    const { body, status } = fail(
      "VALIDATION_ERROR",
      "origin может быть только user",
      422,
      rid,
    );
    return c.json(body, status as 422);
  }

  // Повторно доставленная запись возвращает тот же результат, а не второй ответ.
  const clientId = normalizeClientId(payload.client_id);
  if (clientId) {
    const cached = await readIdempotent<Record<string, unknown>>(
      c.env,
      IDEMPOTENCY_SCOPE,
      user.id,
      clientId,
    );
    if (cached) return c.json(ok({ ...cached, replayed: true }, rid));
  }

  try {
    // Штатный путь — SECURITY DEFINER-функция: она сама считает is_correct и
    // не доверяет клиенту. Прямого доступа к таблицам у пользователя нет.
    const { data, error } = await supabase.rpc("submit_trainer_feed_answer", {
      p_card_id: payload.card_id,
      p_option_id: payload.option_id ?? null,
      p_answer_text: payload.answer_text ?? payload.answer ?? null,
      p_is_skipped: payload.is_skipped === true,
      p_time_ms: Number.isFinite(payload.time_ms) ? Math.max(0, Math.min(3600000, Number(payload.time_ms))) : null,
    });
    if (!error && data) {
      if (clientId) {
        await writeIdempotent(c.env, IDEMPOTENCY_SCOPE, user.id, clientId, data);
      }
      return c.json(ok(data, rid));
    }
    if (error) console.error("[trainers:answer:rpc]", error.message);

    // Резервный серверный путь для ответов старого формата.
    const service = createServiceClient(c.env);
    if (!service) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    const { data: card, error: cardError } = await service
      .from("trainer_feed_cards")
      .select("question")
      .eq("id", payload.card_id)
      .eq("is_published", true)
      .maybeSingle();
    if (cardError || !card) {
      const { body, status } = fail("NOT_FOUND", "Карточка тренажёра не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    const answerValue = String(payload.option_id || payload.answer || payload.answer_text || "").trim();
    const question = (card.question || {}) as { options?: unknown };
    const options = Array.isArray(question.options) ? question.options as { id?: unknown; label?: unknown; correct?: unknown }[] : [];
    const selected = options.find((option) =>
      String(option.id ?? "") === answerValue || String(option.label ?? "").trim().toLocaleLowerCase() === answerValue.toLocaleLowerCase()
    );
    const isSkipped = payload.is_skipped === true || !answerValue;
    const { data: inserted, error: insErr } = await service
      .from("trainer_feed_answers")
      .insert({
        card_id: payload.card_id,
        user_id: user.id,
        option_id: selected ? String(selected.id ?? "") : null,
        answer_text: selected ? null : (answerValue || null),
        is_skipped: isSkipped,
        is_correct: isSkipped ? null : (selected ? Boolean(selected.correct) : false),
        time_ms: Number.isFinite(payload.time_ms) ? Math.max(0, Math.min(3600000, Number(payload.time_ms))) : null,
      })
      .select("id,card_id,option_id,answer_text,is_correct,is_skipped,time_ms,created_at")
      .maybeSingle();
    if (insErr) {
      console.error("[trainers:answer]", insErr.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    if (clientId) {
      await writeIdempotent(c.env, IDEMPOTENCY_SCOPE, user.id, clientId, inserted);
    }
    return c.json(ok(inserted, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});
}
