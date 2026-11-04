import { describe, expect, it } from "vitest";

import {
  parseRuns,
  readRuns,
  recordRun,
  SIM_PROGRESS_KEY,
  summarizeRuns,
  type SimulationRun,
  type StorageLike,
} from "@/lib/learning/progress";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const run = (overrides: Partial<SimulationRun> = {}): SimulationRun => ({
  slug: "osmosis",
  subjectSlug: "histology",
  percent: 100,
  correctCount: 1,
  total: 1,
  finishedAt: "2026-11-04T12:00:00.000Z",
  ...overrides,
});

describe("parseRuns", () => {
  it("возвращает пустой список для пустого и битого хранилища", () => {
    expect(parseRuns(null)).toEqual([]);
    expect(parseRuns("")).toEqual([]);
    expect(parseRuns("not json")).toEqual([]);
    expect(parseRuns('{"slug":"x"}')).toEqual([]);
  });

  it("отбрасывает записи без slug и с нечисловым процентом", () => {
    const raw = JSON.stringify([
      run(),
      { slug: "", percent: 50 },
      { slug: "osmosis", percent: "abc" },
      { slug: "osmosis", percent: 55 },
    ]);
    expect(parseRuns(raw).map((item) => item.percent)).toEqual([100, 55]);
  });

  it("ограничивает процент диапазоном 0…100", () => {
    const raw = JSON.stringify([run({ percent: 250 }), run({ percent: -20 })]);
    expect(parseRuns(raw).map((item) => item.percent)).toEqual([100, 0]);
  });
});

describe("summarizeRuns", () => {
  it("без запусков возвращает пустую сводку", () => {
    expect(summarizeRuns([])).toEqual({
      runs: 0,
      subjects: 0,
      averagePercent: null,
      bestBySlug: {},
      lastFinishedAt: null,
    });
  });

  it("считает средний результат, предметы и лучший результат", () => {
    const summary = summarizeRuns([
      run({ slug: "osmosis", subjectSlug: "histology", percent: 60 }),
      run({ slug: "osmosis", subjectSlug: "histology", percent: 100 }),
      run({ slug: "hardy-weinberg", subjectSlug: "biology", percent: 80 }),
    ]);
    expect(summary.runs).toBe(3);
    expect(summary.subjects).toBe(2);
    expect(summary.averagePercent).toBe(80);
    expect(summary.bestBySlug).toEqual({ osmosis: 100, "hardy-weinberg": 80 });
    expect(summary.lastFinishedAt).toBe("2026-11-04T12:00:00.000Z");
  });
});

describe("recordRun", () => {
  it("сохраняет запуск и читает его обратно", () => {
    const storage = memoryStorage();
    recordRun(run({ percent: 75 }), storage);
    expect(storage.data.has(SIM_PROGRESS_KEY)).toBe(true);
    expect(readRuns(storage)).toHaveLength(1);
    expect(readRuns(storage)[0].percent).toBe(75);
  });

  it("подставляет дату, если она не передана", () => {
    const storage = memoryStorage();
    const now = new Date("2026-11-04T10:00:00.000Z");
    const saved = recordRun(run({ finishedAt: "" }), storage, now);
    expect(saved[0].finishedAt).toBe(now.toISOString());
  });

  it("не падает без хранилища и при ошибке записи", () => {
    expect(recordRun(run(), null)).toHaveLength(1);
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => recordRun(run(), broken)).not.toThrow();
  });

  it("хранит не больше 200 запусков", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 205; index += 1) {
      recordRun(run({ percent: index % 101 }), storage);
    }
    const runs = readRuns(storage);
    expect(runs).toHaveLength(200);
  });
});
