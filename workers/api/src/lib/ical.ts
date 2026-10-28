/**
 * iCal (RFC 5545) — минимальный парсер для импорта персонального расписания.
 *
 * Задача узкая: вытащить из VEVENT время, место и заголовок, а из заголовка —
 * предмет и тему. Повторяющиеся события (RRULE) разворачивает сам источник:
 * мы берём только те VEVENT, у которых есть DTSTART, и не выдумываем вхождения.
 */

export type IcalEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  /** ISO 8601 в UTC. */
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
};

export type ParsedTitle = { subject: string; topic: string };

const DEFAULT_TIMEZONE = "Asia/Vladivostok";

/** RFC 5545: строки длиннее 75 октетов переносятся с ведущим пробелом/табом. */
export function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

type Property = { name: string; params: Record<string, string>; value: string };

function parseProperty(line: string): Property | null {
  const separator = line.indexOf(":");
  if (separator <= 0) return null;
  const head = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const [rawName, ...rawParams] = head.split(";");
  const params: Record<string, string> = {};
  for (const raw of rawParams) {
    const eq = raw.indexOf("=");
    if (eq > 0) params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1);
  }
  return { name: rawName.toUpperCase(), params, value };
}

/** Смещение зоны в минутах для конкретного момента (через Intl, без зависимостей). */
function timezoneOffsetMinutes(timestamp: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const wallClock = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour") % 24,
    pick("minute"),
    pick("second")
  );
  return Math.round((wallClock - timestamp) / 60000);
}

/** Настенное время в зоне → UTC ISO. */
export function zonedToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone = DEFAULT_TIMEZONE
): string {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const firstOffset = timezoneOffsetMinutes(guess, timeZone);
  let timestamp = guess - firstOffset * 60000;
  const secondOffset = timezoneOffsetMinutes(timestamp, timeZone);
  if (secondOffset !== firstOffset) timestamp = guess - secondOffset * 60000;
  return new Date(timestamp).toISOString();
}

function parseDateValue(property: Property, defaultTimezone: string): { iso: string; allDay: boolean } | null {
  const raw = property.value.trim();
  if (property.params.VALUE === "DATE" || /^\d{8}$/.test(raw)) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return { iso: zonedToUtc({ year, month, day, hour: 0, minute: 0, second: 0 }), allDay: true };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  if (utc) {
    return {
      iso: new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
      ).toISOString(),
      allDay: false,
    };
  }
  return {
    iso: zonedToUtc(
      {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
      },
      property.params.TZID || defaultTimezone
    ),
    allDay: false,
  };
}

/** Разбирает текст календаря. Невалидные VEVENT пропускаются, а не роняют импорт. */
export function parseIcal(text: string, options: { defaultTimezone?: string } = {}): IcalEvent[] {
  const timezone = options.defaultTimezone || DEFAULT_TIMEZONE;
  const lines = unfold(text);
  const events: IcalEvent[] = [];
  let current: Record<string, Property> | null = null;
  let uidCounter = 0;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (upper === "END:VEVENT") {
      if (current) {
        const start = current.DTSTART ? parseDateValue(current.DTSTART, timezone) : null;
        const summary = current.SUMMARY ? unescapeText(current.SUMMARY.value).trim() : "";
        if (start && summary) {
          const end = current.DTEND ? parseDateValue(current.DTEND, timezone) : null;
          const uid = current.UID?.value?.trim() || `generated-${start.iso}-${summary}-${uidCounter++}`;
          events.push({
            uid,
            summary,
            description: current.DESCRIPTION ? unescapeText(current.DESCRIPTION.value).trim() : null,
            location: current.LOCATION ? unescapeText(current.LOCATION.value).trim() : null,
            startsAt: start.iso,
            endsAt: end?.iso || null,
            allDay: start.allDay,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const property = parseProperty(line);
    if (property) current[property.name] = property;
  }

  return events;
}

const LESSON_PREFIX = /^(?:лекция|семинар|практика|практическое занятие|лабораторная|экзамен|зачёт|зачет|консультация|коллоквиум)\s*[.:—-]?\s*/i;

/**
 * «Биохимия: Белки — структура и функции» → { subject: «Биохимия», topic: «Белки — структура и функции» }.
 * Если двоеточия нет, пробуем длинное тире: «Биохимия — Белки».
 */
export function splitTitle(summary: string): ParsedTitle {
  const cleaned = summary.replace(LESSON_PREFIX, "").trim();
  for (const separator of [":", " — ", " – ", " - "]) {
    const index = cleaned.indexOf(separator);
    if (index > 0) {
      const subject = cleaned.slice(0, index).trim();
      const topic = cleaned.slice(index + separator.length).trim();
      if (subject && topic) return { subject, topic };
    }
  }
  return { subject: cleaned, topic: "" };
}

const STOP_WORDS = new Set(["и", "в", "на", "по", "с", "для", "из", "к", "о", "об", "the", "of"]);

export function normalizeTitle(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeTitle(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function tokenMatches(left: string, right: string): boolean {
  if (left === right) return true;
  // Морфология русских слов: «белки»/«белков», «функции»/«функция» — общий корень.
  const limit = Math.min(left.length, right.length);
  let common = 0;
  while (common < limit && left[common] === right[common]) common += 1;
  return common >= 4;
}

/** Схожесть 0..1: коэффициент Дайса по совпавшим токенам (префикс ≥4 символов считается совпадением). */
export function titleSimilarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.length || !b.length) return 0;
  let matched = 0;
  const used = new Set<number>();
  for (const token of a) {
    const index = b.findIndex((candidate, position) => !used.has(position) && tokenMatches(token, candidate));
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return Math.round(((2 * matched) / (a.length + b.length)) * 100) / 100;
}

export function matchByTitle<T>(
  title: string,
  candidates: T[],
  titleOf: (candidate: T) => string,
  threshold = 0.55
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = titleSimilarity(title, titleOf(candidate));
    if (score >= threshold && (!best || score > best.score)) best = { item: candidate, score };
  }
  return best;
}

/** Короткий детерминированный хеш для дедупа повторных синхронизаций. */
export function contentHash(parts: Array<string | null | undefined>): string {
  const source = parts.map((part) => part ?? "").join("\u0001");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
