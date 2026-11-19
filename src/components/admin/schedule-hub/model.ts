/**
 * CMS · Сетка расписания: константы, типы и чистые хелперы дат/дедупликации.
 * Без React: только типы, константы и функции без состояния.
 */
import type { ScheduleItem } from "@/lib/api";

export const TZ = "Asia/Vladivostok";
export const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная",
  seminar: "Семинар", exam: "Экзамен", credit: "Зачёт",
  consultation: "Консультация", other: "Другое",
};
export const TYPES = Object.keys(TYPE_LABELS);
export const SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export type ScheduleGroupOption = { id: string; name?: string; code?: string; course_number?: number | null };
export type SchedulePeriod = { id: string; title: string; start_date: string; end_date?: string | null; notes?: string | null };
export type ScheduleDraftOffer = { savedAt: string; data: { items: ScheduleItem[]; weekStart?: string } };

export function nowPartsKh() {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const raw = Object.fromEntries(
    dtf.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return {
    date: `${raw.year}-${raw.month}-${raw.day}`,
    minutes: Number(raw.hour) * 60 + Number(raw.minute),
    timeLabel: `${raw.hour}:${raw.minute}`,
  };
}
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function startOfWeek(value: Date) {
  const d = new Date(value); d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
export function addDays(value: Date, days: number) {
  const d = new Date(value); d.setDate(d.getDate() + days); return d;
}
export function timeToMinutes(v: string) {
  const [h, m] = (v || "08:00").slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}
export function ymdFromKhToday() {
  const n = nowPartsKh();
  const [y, m, d] = n.date.split("-").map(Number);
  return startOfWeek(new Date(y, m - 1, d, 12));
}

export function dedupeItems(list: ScheduleItem[]): ScheduleItem[] {
  const byId = new Set<string>();
  const bySig = new Map<string, ScheduleItem>();
  for (const it of list) {
    const id = String(it.id || "");
    if (id && byId.has(id)) continue;
    const sig = [
      it.date || "",
      (it.start_time || "").slice(0, 5),
      (it.end_time || "").slice(0, 5),
      (it.subject_name || "").trim().toLowerCase(),
      (it.type || "").toLowerCase(),
      (it.room || "").trim().toLowerCase(),
      it.group_id || "",
    ].join("|");
    if (bySig.has(sig)) continue;
    if (id) byId.add(id);
    bySig.set(sig, it);
  }
  return Array.from(bySig.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
  );
}
