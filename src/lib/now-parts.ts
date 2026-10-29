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
 * Начало пары в минутах от полуночи. Строковое сравнение «9:00» > «12:30»
 * выбирало не ту пару, поэтому время разбирается и проверяется по границам.
 * null — времени нет или оно некорректно.
 */
export function lessonStartMinutes(raw: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(raw || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Первая пара, которая ещё наступит сегодня, либо первая пара ближайшего
 * будущего дня. rows — записи расписания с полями date и start_time.
 * Пары без корректного времени не теряются: в будущем дне они идут последними,
 * а сегодня не считаются «уже прошедшими» наугад.
 */
export function pickNextLesson<T extends { date?: string | null; start_time?: string | null }>(
  rows: T[],
  now: NowParts,
): T | null {
  const decorate = (row: T) => ({
    row,
    date: String(row.date || "").slice(0, 10),
    start: lessonStartMinutes(row.start_time),
  });
  const upcoming = rows
    .map(decorate)
    .filter((item) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return false;
      if (item.date > now.date) return true;
      if (item.date < now.date) return false;
      // Сегодня: при неизвестном времени считаем, что пара ещё может наступить,
      // и не скрываем её из «ближайшей» — врать про прошедшее хуже.
      return item.start === null || item.start >= now.minutes;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      // Неизвестное время — в конце дня, а не в начале.
      if (a.start === null && b.start === null) return 0;
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return a.start - b.start;
    });
  return upcoming[0]?.row || null;
}
