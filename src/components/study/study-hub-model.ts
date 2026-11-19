export const DONE_KEY = "study.program.done.v2";
export const KR_KEY = "study.program.krDate.v2";

export type ProgressPayload = {
  overall_pct?: number | null;
  homework?: { total: number; done: number };
  tests?: { attempts: number; finished?: number; avg_score?: number | null };
};

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function isoTodayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

export const ANCHORS = [
  { href: "#today", label: "Сегодня" },
  { href: "#timeline", label: "Ближайшее" },
  { href: "#prep", label: "Подготовка" },
  { href: "#plan", label: "Учебный план" },
  { href: "#progress", label: "Прогресс" },
  { href: "#assignments", label: "Отработки" },
];
