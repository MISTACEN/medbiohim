/**
 * Единое «сейчас» для расписания и дашборда (FD8 из PRODUCT-AUDIT-PLAN-2026-10-27).
 * Раньше обе страницы считали текущее время своими Intl-форматами (en-CA и en-GB)
 * и могли разойтись на границе суток/часа — показания «ближайшей пары» не совпадали.
 */

export const PLATFORM_TZ = "Asia/Vladivostok";

export type NowParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** YYYY-MM-DD в таймзоне платформы */
  date: string;
  /** минуты от полуночи */
  minutes: number;
  /** HH:MM */
  timeLabel: string;
};

export function nowParts(tz: string = PLATFORM_TZ): NowParts {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const raw = Object.fromEntries(
    dtf.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const year = Number(raw.year);
  const month = Number(raw.month);
  const day = Number(raw.day);
  const hour = Number(raw.hour) % 24;
  const minute = Number(raw.minute);
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, hour, minute, date, minutes: hour * 60 + minute, timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

/**
 * Первая пара, которая ещё наступит сегодня, либо первая пара ближайшего
 * будущего дня. rows — записи расписания с полями date и start_time.
 */
export function pickNextLesson<T extends { date?: string | null; start_time?: string | null }>(
  rows: T[],
  now: NowParts,
): T | null {
  const upcoming = rows
    .filter((row) => {
      const date = String(row.date || "").slice(0, 10);
      const start = String(row.start_time || "").slice(0, 5) || "00:00";
      return date > now.date || (date === now.date && start >= now.timeLabel);
    })
    .sort((a, b) => {
      const da = String(a.date || ""), db = String(b.date || "");
      if (da !== db) return da.localeCompare(db);
      const ta = String(a.start_time || "").slice(0, 5), tb = String(b.start_time || "").slice(0, 5);
      return ta.localeCompare(tb);
    });
  return upcoming[0] || null;
}
