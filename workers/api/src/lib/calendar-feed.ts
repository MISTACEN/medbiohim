/**
 * Экспорт учебного расписания в iCalendar и подписной токен.
 *
 * Фидовый URL не может нести Bearer-токен (Google Calendar и Apple Calendar
 * ходят без заголовков), поэтому доступ к фиду даёт HMAC-подпись от id
 * пользователя. Ключ подписи — серверный секрет Supabase, в клиент он не попадает.
 */
import { zonedToUtc } from "./ical";

export type FeedEntry = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  subject_name?: string | null;
  room?: string | null;
  building?: string | null;
  notes?: string | null;
  teacher?: string | null;
  type?: string | null;
  is_cancelled?: boolean;
};

const TIMEZONE = "Asia/Vladivostok";

/** RFC 5545: экранируем запятую, точку с запятой, обратный слэш и перевод строки. */
export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Перенос строки по 75 октетам UTF-8 (продолжение — с ведущим пробелом). */
export function foldIcalLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = char;
      bytes = size;
    } else {
      current += char;
      bytes += size;
    }
  }
  if (current) parts.push(current);
  return parts[0] + parts.slice(1).map((part) => `\r\n ${part}`).join("");
}

function compactUtc(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function eventStart(date: string, time: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})/.exec(String(time || ""));
  if (!dateMatch || !timeMatch) return null;
  return zonedToUtc(
    {
      year: Number(dateMatch[1]),
      month: Number(dateMatch[2]),
      day: Number(dateMatch[3]),
      hour: Number(timeMatch[1]),
      minute: Number(timeMatch[2]),
      second: 0,
    },
    TIMEZONE
  );
}

export function buildCalendar(
  entries: FeedEntry[],
  options: { calendarName: string; productId?: string; now?: Date } = { calendarName: "Расписание" }
): string {
  const stamp = compactUtc((options.now || new Date()).toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.productId || "-//Medbiohim//Schedule//RU"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcalText(options.calendarName)}`,
    `X-WR-TIMEZONE:${TIMEZONE}`,
  ];

  for (const entry of entries) {
    const startsAt = eventStart(entry.date, entry.start_time);
    if (!startsAt) continue;
    const endsAt = eventStart(entry.date, entry.end_time) || startsAt;
    const summary = entry.subject_name || "Занятие";
    const location = [entry.building, entry.room].filter(Boolean).join(", ");
    const descriptionParts: string[] = [];
    if (entry.type) descriptionParts.push(entry.type);
    if (entry.teacher) descriptionParts.push(entry.teacher);
    if (entry.notes) descriptionParts.push(entry.notes);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${entry.id}@medbiohim`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${compactUtc(startsAt)}`);
    lines.push(`DTEND:${compactUtc(endsAt)}`);
    lines.push(`SUMMARY:${escapeIcalText(summary)}`);
    if (location) lines.push(`LOCATION:${escapeIcalText(location)}`);
    if (descriptionParts.length) lines.push(`DESCRIPTION:${escapeIcalText(descriptionParts.join(" · "))}`);
    if (entry.is_cancelled) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcalLine).join("\r\n");
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function signFeedToken(userId: string, secret: string): Promise<string> {
  return `${userId}:${await hmacHex(userId, secret)}`;
}

export async function verifyFeedToken(token: string, secret: string): Promise<string | null> {
  const separator = token.lastIndexOf(":");
  if (separator <= 0) return null;
  const userId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
  const expected = await hmacHex(userId, secret);
  return safeEqual(signature, expected) ? userId : null;
}
