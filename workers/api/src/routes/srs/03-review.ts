import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { logActivity } from "../../lib/activity";
import { nextReviewState } from "./fsrs";

import { UUID, CARD_FIELDS, formatCard, subjectNames, loadCards, summarize, countNewQuestions } from "./shared";

import type { SrsRow } from "./shared";

import type { SrsRouter } from "./types";

export function registerReviewRoutes(srs: SrsRouter) {
async function reviewCard(c: any, cardId: string, rating: number) {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  if (!UUID.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID карточки", 422, rid);
    return c.json(body, status as 422);
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 4) {
    const { body, status } = fail("VALIDATION_ERROR", "Оценка должна быть от 1 до 4", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: current, error: readError } = await supabase
      .from("srs_cards")
      .select(CARD_FIELDS)
      .eq("id", cardId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }

    const next = nextReviewState(current as SrsRow, rating);

    const now = new Date();
    const dueAt = next.due_at;
    const { data: updated, error: writeError } = await supabase
      .from("srs_cards")
      .update({
        ease: next.ease,
        interval: next.interval,
        reps: next.reps,
        due_at: dueAt,
        reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
        stability: next.stability,
        difficulty: next.difficulty,
        state: next.state,
        lapses: next.lapses,
      })
      .eq("id", cardId)
      .eq("user_id", user.id)
      .select(CARD_FIELDS)
      .maybeSingle();
    if (writeError) throw writeError;

    const [names, cards] = await Promise.all([subjectNames(supabase), loadCards(supabase, user.id, 2000)]);
    const newAvailable = await countNewQuestions(supabase, cards);
    return c.json(
      ok(
        {
          card: formatCard((updated || current) as SrsRow, names, Math.round(now.getTime() / 1000)),
          summary: summarize(cards, names, newAvailable),
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[srs:review]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить повтор", 503, rid);
    return c.json(body, status as 503);
  }
}

srs.post("/review", requireAuth, async (c) => {
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const cardId = String(payload?.card_id || payload?.id || "").trim();
  const rating = Number(payload?.rating ?? 0);
  const response = await reviewCard(c, cardId, rating);
  if (response.status < 400) {
    // Фаза 5: повторение карточки — событие ленты.
    await logActivity(c.env, {
      userId: c.get("user").id,
      kind: "srs_review",
      refId: cardId,
      payload: { rating },
    });
  }
  return response;
});

srs.post("/:id/review", requireAuth, async (c) => {
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const rating = Number(payload?.rating ?? payload?.quality ?? 3);
  const cardId = String(c.req.param("id") || "");
  const response = await reviewCard(c, cardId, rating);
  if (response.status < 400) {
    await logActivity(c.env, { userId: c.get("user").id, kind: "srs_review", refId: cardId, payload: { rating } });
  }
  return response;
});
}
