
export const FSRS_W = [
  0.5701, 1.4436, 4.1386, 10.9355, 5.1443, 1.2006, 0.8627, 0.0362, 1.629,
  0.1342, 1.0166, 2.1174, 0.0839, 0.3204, 1.4676, 0.219, 2.8237,
];
export const FSRS_RETENTION = 0.9;
export const FSRS_MAX_STABILITY = 36500;

export function fsrsIntervalDays(stability: number): number {
  // Дни, за которые удержание падает до FSRS_RETENTION: при 0.9 → ровно S.
  const factor = Math.pow(1 / FSRS_RETENTION, 2) - 1;
  return Math.max(1, Math.round(stability * factor * (81 / 19)));
}

export function fsrsNextDifficulty(difficulty: number, rating: number): number {
  const delta = -FSRS_W[5] * (rating - 3);
  return Math.min(10, Math.max(1, difficulty + (delta * (10 - difficulty)) / 9));
}

export type FsrsCardState = {
  ease?: number | string | null;
  interval?: number | string | null;
  reps?: number | string | null;
  reviewed_at?: string | null;
  stability?: number | string | null;
  difficulty?: number | string | null;
  state?: number | string | null;
  lapses?: number | string | null;
};

export function nextReviewState(card: FsrsCardState, rating: number) {
  const now = new Date();
  const ratingKey = Math.min(4, Math.max(1, Math.round(Number(rating) || 3)));

  const prevStability = Number(card.stability ?? 0);
  const prevDifficulty = Number(card.difficulty ?? 0);
  const prevState = Number(card.state ?? 0);
  const isNew = prevState === 0 || !(prevStability > 0);

  let stability: number;
  let difficulty: number;
  if (isNew) {
    stability = Math.max(0.1, FSRS_W[ratingKey - 1]);
    difficulty = Math.min(10, Math.max(1, FSRS_W[3] - FSRS_W[4] * (ratingKey - 3)));
  } else {
    // Удержание на момент проверки по кривой забывания R(t,S) = (1+F·t/S)^-0.5.
    const lastReviewed = card.reviewed_at ? new Date(String(card.reviewed_at)).getTime() : NaN;
    const elapsed = Number.isFinite(lastReviewed)
      ? Math.max(0, (now.getTime() - lastReviewed) / 86400_000)
      : Math.max(0, Number(card.interval ?? 0));
    const retrievability = 1 / Math.pow(1 + (19 / 81) * (elapsed / prevStability), 0.5);
    if (ratingKey === 1) {
      stability = Math.min(
        FSRS_MAX_STABILITY,
        Math.max(0.1,
          FSRS_W[10] * Math.pow(prevDifficulty, -FSRS_W[11])
          * (Math.pow(prevStability + 1, FSRS_W[12]) - 1)
          * Math.exp((1 - retrievability) * FSRS_W[13])),
      );
    } else {
      const hard = ratingKey === 2 ? FSRS_W[14] : 1;
      const easy = ratingKey === 4 ? FSRS_W[15] : 1;
      stability = Math.min(
        FSRS_MAX_STABILITY,
        Math.max(0.1,
          prevStability
          * (1 + Math.exp(FSRS_W[7]) * (11 - prevDifficulty)
            * Math.pow(prevStability, -FSRS_W[8])
            * (Math.exp((1 - retrievability) * FSRS_W[9]) - 1)
            * hard * easy)),
      );
    }
    difficulty = fsrsNextDifficulty(prevDifficulty, ratingKey);
  }

  const interval = fsrsIntervalDays(stability);

  // SM-2-совместимость: ease/interval/reps продолжают жить рядом.
  let ease = Number(card.ease ?? 2.5);
  let reps = Number(card.reps ?? 0);
  if (ratingKey === 1) {
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else if (ratingKey === 2) {
    reps += 1;
    ease = Math.max(1.3, ease - 0.05);
  } else if (ratingKey === 3) {
    reps += 1;
  } else {
    reps += 1;
    ease = Math.min(3.2, ease + 0.15);
  }

  const wasNew = isNew;
  const state = ratingKey === 1 ? (wasNew ? 1 : 3) : 2;
  const lapses = Number(card.lapses ?? 0) + (ratingKey === 1 && !wasNew ? 1 : 0);

  return {
    ease: Number(ease.toFixed(2)),
    interval,
    reps,
    due_at: new Date(now.getTime() + interval * 86400_000).toISOString(),
    stability: Number(stability.toFixed(4)),
    difficulty: Number(difficulty.toFixed(4)),
    state,
    lapses,
  };
}
