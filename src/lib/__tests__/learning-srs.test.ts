import { describe, expect, it } from "vitest";

import { isDue, nextReviewState, reviewReason } from "@/lib/learning/srs";

const NOW = new Date("2026-11-04T12:00:00.000Z");
const DAY = 86_400_000;

describe("nextReviewState: SM-2 совместим с Worker", () => {
  it("новая карточка «Хорошо» уходит на 1 день", () => {
    const next = nextReviewState({ ease: 2.5, interval: 0, reps: 0 }, 3, NOW);
    expect(next).toMatchObject({ ease: 2.5, interval: 1, reps: 1 });
    expect(Date.parse(next.due_at) - NOW.getTime()).toBe(DAY);
  });

  it("«Хорошо» умножает интервал на ease", () => {
    const next = nextReviewState({ ease: 2.5, interval: 3, reps: 2 }, 3, NOW);
    expect(next.interval).toBe(8); // ceil(3 * 2.5) = 8
    expect(next.reps).toBe(3);
    expect(next.ease).toBe(2.5);
  });

  it("«Снова» сбрасывает прогресс и снижает ease не ниже 1.3", () => {
    const next = nextReviewState({ ease: 1.35, interval: 30, reps: 6 }, 1, NOW);
    expect(next.reps).toBe(0);
    expect(next.interval).toBe(1);
    expect(next.ease).toBe(1.3);
  });

  it("«Трудно» растягивает интервал в 1.4 раза и слегка снижает ease", () => {
    const next = nextReviewState({ ease: 2.5, interval: 5, reps: 2 }, 2, NOW);
    expect(next.interval).toBe(7);
    expect(next.ease).toBe(2.45);
    expect(next.reps).toBe(3);
  });

  it("«Легко» на новой карточке даёт 2 дня и повышает ease", () => {
    const next = nextReviewState({ ease: 2.5, interval: 0, reps: 0 }, 4, NOW);
    expect(next.interval).toBe(2);
    expect(next.ease).toBe(2.65);
  });

  it("ease не превышает 3.2", () => {
    const next = nextReviewState({ ease: 3.2, interval: 10, reps: 5 }, 4, NOW);
    expect(next.ease).toBe(3.2);
  });

  it("строковые значения из Postgres приводятся к числам", () => {
    const next = nextReviewState({ ease: "2.50", interval: "3", reps: "2" }, 3, NOW);
    expect(next.interval).toBe(8);
    expect(next.ease).toBe(2.5);
  });

  it("битые значения не ломают расчёт", () => {
    const next = nextReviewState({ ease: "abc", interval: null, reps: undefined }, 3, NOW);
    expect(next.interval).toBe(1);
    expect(next.ease).toBe(2.5);
  });
});

describe("isDue", () => {
  it("сравнивает дату с текущим моментом", () => {
    expect(isDue("2026-11-04T11:59:00.000Z", NOW)).toBe(true);
    expect(isDue("2026-11-05T11:59:00.000Z", NOW)).toBe(false);
  });

  it("пустая или битая дата считается просроченной", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue("not-a-date", NOW)).toBe(true);
  });
});

describe("reviewReason", () => {
  it("объясняет возврат после ошибки", () => {
    expect(reviewReason({ level: 2, lastScorePercent: 40, reps: 3 })).toContain("Ошибка");
  });

  it("отличает новую карточку уровня «Применение»", () => {
    expect(reviewReason({ level: 3, lastScorePercent: null, reps: 0 })).toContain("Применение");
  });

  it("для зрелой карточки описывает рост интервала", () => {
    expect(reviewReason({ level: 1, lastScorePercent: 90, reps: 5 })).toContain("SM-2");
  });
});
