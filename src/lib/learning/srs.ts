/**
 * Интервальное повторение (SM-2, оценки 1–4).
 *
 * Математика обязана совпадать с Worker (`workers/api/src/routes/srs.ts`),
 * иначе карточки на сайте и в Telegram разъедутся. Здесь та же формула,
 * но с явной датой отсчёта — так её можно проверить тестом, а не «сегодня»:
 *
 * 1 «Снова»  → reps 0, интервал 1 день, ease −0.2 (мин. 1.3)
 * 2 «Трудно» → интервал ×1.4, ease −0.05 (мин. 1.3)
 * 3 «Хорошо» → интервал ×ease
 * 4 «Легко»  → интервал ×ease×1.3, ease +0.15 (макс. 3.2)
 */

import type { KnowledgeLevel } from "./types";

export type ReviewRating = 1 | 2 | 3 | 4;

export const REVIEW_RATING_LABELS: Record<ReviewRating, string> = {
  1: "Снова",
  2: "Трудно",
  3: "Хорошо",
  4: "Легко",
};

export type SrsCardState = {
  ease?: number | string | null;
  interval?: number | string | null;
  reps?: number | string | null;
};

export type NextReviewState = {
  ease: number;
  interval: number;
  reps: number;
  due_at: string;
};

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.2;
export const DEFAULT_EASE = 2.5;
const DAY_MS = 86_400_000;

export function isReviewRating(value: unknown): value is ReviewRating {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function toNumber(value: number | string | null | undefined, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

/** Следующее состояние карточки. `now` передаётся явно ради воспроизводимости. */
export function nextReviewState(
  card: SrsCardState,
  rating: ReviewRating,
  now: Date = new Date(),
): NextReviewState {
  let ease = toNumber(card.ease, DEFAULT_EASE);
  let interval = Math.max(0, Math.round(toNumber(card.interval, 0)));
  let reps = Math.max(0, Math.round(toNumber(card.reps, 0)));

  if (rating === 1) {
    reps = 0;
    interval = 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else if (rating === 2) {
    reps += 1;
    interval = Math.max(1, Math.ceil(Math.max(1, interval) * 1.4));
    ease = Math.max(MIN_EASE, ease - 0.05);
  } else if (rating === 3) {
    reps += 1;
    interval = interval > 0 ? Math.max(1, Math.ceil(interval * ease)) : 1;
  } else {
    reps += 1;
    interval = interval > 0 ? Math.max(1, Math.ceil(interval * ease * 1.3)) : 2;
    ease = Math.min(MAX_EASE, ease + 0.15);
  }

  return {
    ease: Number(ease.toFixed(2)),
    interval,
    reps,
    due_at: new Date(now.getTime() + interval * DAY_MS).toISOString(),
  };
}

/** Просрочена ли карточка: сравнение по времени, без округления суток. */
export function isDue(dueAt: string | null | undefined, now: Date = new Date()): boolean {
  const parsed = Date.parse(String(dueAt ?? ""));
  return Number.isFinite(parsed) ? parsed <= now.getTime() : true;
}

/**
 * Простое объяснение, зачем карточка попала в повторение. Нужно интерфейсу:
 * студент должен видеть причину, а не «магическое» число.
 */
export function reviewReason(input: {
  level: KnowledgeLevel | null;
  lastScorePercent: number | null;
  reps: number;
}): string {
  if (input.lastScorePercent !== null && input.lastScorePercent < 60) {
    return "Ошибка в проверке: тема возвращается чаще.";
  }
  if (input.reps === 0) {
    return input.level === 3
      ? "Новый материал уровня «Применение»: сначала короткие интервалы."
      : "Новая карточка: первый интервал — 1 день.";
  }
  return "Интервал растёт по вашим оценкам (SM-2).";
}
