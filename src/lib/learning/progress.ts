/**
 * Локальный прогресс по симуляциям.
 *
 * Серверный `progress_ledger` требует uuid объекта, а симуляции живут как
 * контент-каталог; поэтому результат прохождения сохраняется на устройстве,
 * а страница прогресса показывает его рядом с серверными данными. Это не
 * замена серверному прогрессу, а честно подписанный локальный слой.
 */

export type SimulationRun = {
  slug: string;
  subjectSlug: string;
  percent: number;
  correctCount: number;
  total: number;
  finishedAt: string;
};

export type SimulationSummary = {
  runs: number;
  subjects: number;
  averagePercent: number | null;
  bestBySlug: Record<string, number>;
  lastFinishedAt: string | null;
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const SIM_PROGRESS_KEY = "mbh:sim_progress:v1";
const MAX_RUNS = 200;

export function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function clampPercent(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

/** Разбор хранилища: битые записи отбрасываются, а не ломают страницу. */
export function parseRuns(raw: string | null | undefined): SimulationRun[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): SimulationRun | null => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const slug = String(record.slug ?? "").trim();
        const percent = clampPercent(record.percent);
        if (!slug || percent === null) return null;
        return {
          slug,
          subjectSlug: String(record.subjectSlug ?? "").trim(),
          percent,
          correctCount: Math.max(0, Math.round(Number(record.correctCount) || 0)),
          total: Math.max(0, Math.round(Number(record.total) || 0)),
          finishedAt: String(record.finishedAt ?? ""),
        };
      })
      .filter((run): run is SimulationRun => run !== null)
      .slice(-MAX_RUNS);
  } catch {
    return [];
  }
}

export function summarizeRuns(runs: SimulationRun[]): SimulationSummary {
  if (!runs.length) {
    return { runs: 0, subjects: 0, averagePercent: null, bestBySlug: {}, lastFinishedAt: null };
  }
  const bestBySlug: Record<string, number> = {};
  const subjects = new Set<string>();
  let sum = 0;
  let last: string | null = null;
  for (const run of runs) {
    sum += run.percent;
    bestBySlug[run.slug] = Math.max(bestBySlug[run.slug] ?? 0, run.percent);
    if (run.subjectSlug) subjects.add(run.subjectSlug);
    const time = Date.parse(run.finishedAt);
    if (Number.isFinite(time) && (last === null || time > Date.parse(last))) {
      last = run.finishedAt;
    }
  }
  return {
    runs: runs.length,
    subjects: subjects.size,
    averagePercent: Math.round(sum / runs.length),
    bestBySlug,
    lastFinishedAt: last,
  };
}

export function readRuns(storage: StorageLike | null = defaultStorage()): SimulationRun[] {
  if (!storage) return [];
  try {
    return parseRuns(storage.getItem(SIM_PROGRESS_KEY));
  } catch {
    return [];
  }
}

/** Добавляет прохождение и возвращает новое состояние (последние 200). */
export function recordRun(
  run: SimulationRun,
  storage: StorageLike | null = defaultStorage(),
  now: Date = new Date(),
): SimulationRun[] {
  const normalized: SimulationRun = {
    ...run,
    percent: clampPercent(run.percent) ?? 0,
    finishedAt: run.finishedAt || now.toISOString(),
  };
  const next = [...readRuns(storage), normalized].slice(-MAX_RUNS);
  if (storage) {
    try {
      storage.setItem(SIM_PROGRESS_KEY, JSON.stringify(next));
    } catch {
      // Переполнение квоты не должно ломать прохождение симуляции.
    }
  }
  return next;
}
