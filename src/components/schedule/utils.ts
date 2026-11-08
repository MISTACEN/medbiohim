/**
 * Общие хелперы расписания (ЗАДАЧА A4): даты, сетка дня, цвета предметов.
 * Вынесено из монолита app/schedule/page.tsx по образцу components/<домен>/.
 */
import type { ScheduleItem, ScheduleMeta } from "@/lib/api";
import { nowParts as sharedNowParts } from "@/lib/now-parts";

export const nowParts = () => sharedNowParts();

/**
 * Диапазон семестра берётся из календарных периодов (schedule meta, type=theoretical),
 * а не зашит в код. Константа ниже — fallback, если в БД периодов ещё нет.
 */
export type SemesterRange = { from: string; to: string };
export const FALLBACK_SEMESTER: SemesterRange = { from: "2026-09-01", to: "2027-01-31" };
export function deriveSemesterRange(meta: any): SemesterRange {
  const periods = Array.isArray(meta?.periods) ? meta.periods : [];
  const theoretical = periods.filter((p: any) =>
    p?.type === "theoretical" && typeof p?.start_date === "string" && p.start_date.length >= 10
  );
  if (!theoretical.length) return FALLBACK_SEMESTER;
  const from = theoretical.map((p: any) => String(p.start_date).slice(0, 10)).sort()[0];
  const ends = theoretical.map((p: any) => String(p.end_date || p.start_date).slice(0, 10)).sort();
  const to = ends[ends.length - 1];
  return to > from ? { from, to } : FALLBACK_SEMESTER;
}


export function parseYmd(ymd: string) { const [y,m,d]=ymd.split("-").map(Number); return {y,m,d}; }
export function addDaysYmd(ymd: string, days: number): string {
  const {y,m,d}=parseYmd(ymd); const utc=new Date(Date.UTC(y,m-1,d+days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth()+1).padStart(2,"0")}-${String(utc.getUTCDate()).padStart(2,"0")}`;
}
export function startOfWeekYmd(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const utc=new Date(Date.UTC(y,m-1,d)); const dow=utc.getUTCDay();
  return addDaysYmd(ymd, dow===0?-6:1-dow);
}
export function weekdayShortRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const dt=new Date(Date.UTC(y,m-1,d,12));
  return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(dt).replace(".","");
}
export function dayDateRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const dt=new Date(Date.UTC(y,m-1,d,12));
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(dt);
}
export function weekTitle(startYmd: string): string {
  const endYmd=addDaysYmd(startYmd,6); const a=parseYmd(startYmd); const b=parseYmd(endYmd);
  const start=new Date(Date.UTC(a.y,a.m-1,a.d,12)); const end=new Date(Date.UTC(b.y,b.m-1,b.d,12));
  const fmt=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",timeZone:"UTC"});
  const fmtEnd=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
  return `${fmt.format(start)} — ${fmtEnd.format(end)} · Хабаровск`;
}
export function monthStartYmd(ymd: string): string {
  const {y,m}=parseYmd(ymd);
  return `${y}-${String(m).padStart(2,"0")}-01`;
}
export function addMonthsYmd(ymd: string, delta: number): string {
  const {y,m}=parseYmd(ymd);
  const d=new Date(Date.UTC(y,m-1+delta,1,12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-01`;
}
export function monthTitle(ymd: string): string {
  const {y,m}=parseYmd(ymd);
  return new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,1,12)));
}
export function monthGridDays(ymd: string): string[] {
  const first=monthStartYmd(ymd);
  const monday=startOfWeekYmd(first);
  return Array.from({length:42},(_,i)=>addDaysYmd(monday,i));
}
export function dateLabelRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd);
  return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d,12)));
}
export function shortDateRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd);
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d,12)));
}
const SUBJECT_PALETTE = ["#2563eb","#7c3aed","#059669","#ea580c","#db2777","#0891b2","#65a30d","#9333ea","#0284c7","#ca8a04","#e11d48","#0f766e"];
export function subjectColorKey(type?: string | null): string {
  if (type==="practice") return "practice";
  if (type==="laboratory") return "lab";
  if (type==="exam" || type==="credit") return "exam";
  if (type==="seminar") return "seminar";
  return "lecture";
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
export function timeToMinutes(v: string) { const [h,m]=v.slice(0,5).split(":").map(Number); return h*60+m; }
export function breakRange(value: string): { start: number; end: number } | null {
  const m = String(value || "").match(/(\d{1,2}:\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2})/i);
  if (!m) return null;
  const start = timeToMinutes(m[1]);
  const end = timeToMinutes(m[2]);
  return end > start ? { start, end } : null;
}

/** Pack overlapping events into side-by-side columns (classic calendar layout). */
export function layoutDayColumns(items: ScheduleItem[]): Array<{ item: ScheduleItem; col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => {
    const s = a.start_time.localeCompare(b.start_time);
    return s !== 0 ? s : a.end_time.localeCompare(b.end_time);
  });
  const seen = new Set<string>();
  const unique: ScheduleItem[] = [];
  for (const it of sorted) {
    const k = `${it.date}|${it.start_time}|${it.end_time}|${it.subject_name}|${it.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(it);
  }
  type Node = { item: ScheduleItem; start: number; end: number; col: number };
  const nodes: Node[] = [];
  const colEnds: number[] = [];
  for (const item of unique) {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);
    let col = colEnds.findIndex((e) => e <= start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(end);
    } else {
      colEnds[col] = end;
    }
    nodes.push({ item, start, end, col });
  }
  const result: Array<{ item: ScheduleItem; col: number; cols: number }> = [];
  let i = 0;
  while (i < nodes.length) {
    let clusterEnd = nodes[i].end;
    let j = i + 1;
    while (j < nodes.length && nodes[j].start < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, nodes[j].end);
      j++;
    }
    const cluster = nodes.slice(i, j);
    const cols = Math.max(1, ...cluster.map((n) => n.col + 1));
    for (const n of cluster) result.push({ item: n.item, col: n.col, cols });
    i = j;
  }
  return result;
}


// Константы сетки дня и подписи типов занятий (используют ScheduleCard и страница).


export function subjectColor(item:any): string {
  if (typeof item?.color_hex === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color_hex)) return item.color_hex;
  const raw=String(item?.subject_slug||item?.subject_name||"subject");
  let h=0; for(let i=0;i<raw.length;i++) h=((h<<5)-h+raw.charCodeAt(i))|0;
  return SUBJECT_PALETTE[Math.abs(h)%SUBJECT_PALETTE.length];
}


export const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная",
  seminar: "Семинар", exam: "Экзамен", credit: "Зачёт",
  consultation: "Консультация", other: "Занятие",
};

export const TYPE_CLASS: Record<string, string> = {
  lecture: "schedule-lecture", practice: "schedule-practice", laboratory: "schedule-lab",
  seminar: "schedule-seminar", exam: "schedule-exam", credit: "schedule-credit",
  consultation: "schedule-consultation", other: "schedule-other",
};

export const GRID_START_MIN = 8 * 60;

export const PX_PER_MIN = 1.05;

export const TYPE_COLORS: Record<string, string> = {
  lecture: "#6366f1", practice: "#10b981", laboratory: "#f59e0b", seminar: "#06b6d4",
  exam: "#f43f5e", credit: "#8b5cf6", consultation: "#3b82f6", other: "#64748b",
};

export const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
export function attendanceLabel(status?: string | null){return status==="present"?"Был":status==="excused"?"Уважительная":status==="sick"?"Болезнь":status==="unexcused"?"Пропуск":"";}
