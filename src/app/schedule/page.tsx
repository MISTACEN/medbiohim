"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Database, AlertTriangle, X, BookOpen,
} from "lucide-react";
import Link from "next/link";
import { listSchedule, getScheduleMeta, hasToken, getLessonPlan, type ScheduleItem, type SubjectPlanWeek, type ScheduleMeta } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";

const TZ = "Asia/Vladivostok";
const SEMESTER_FROM = "2026-09-01";
const SEMESTER_TO = "2027-01-31";

const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная",
  seminar: "Семинар", exam: "Экзамен", credit: "Зачёт",
  consultation: "Консультация", other: "Занятие",
};
const TYPE_CLASS: Record<string, string> = {
  lecture: "schedule-lecture", practice: "schedule-practice", laboratory: "schedule-lab",
  seminar: "schedule-seminar", exam: "schedule-exam", credit: "schedule-credit",
  consultation: "schedule-consultation", other: "schedule-other",
};
const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
const GRID_START_MIN = 8 * 60;
const PX_PER_MIN = 1.05;

function nowParts() {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const raw = Object.fromEntries(dtf.formatToParts(new Date()).filter((p: Intl.DateTimeFormatPart) => p.type !== "literal").map((p: Intl.DateTimeFormatPart) => [p.type, p.value]));
  const year = Number(raw.year), month = Number(raw.month), day = Number(raw.day);
  const hour = Number(raw.hour), minute = Number(raw.minute);
  const date = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return { year, month, day, hour, minute, date, minutes: hour * 60 + minute, timeLabel: `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}` };
}
function parseYmd(ymd: string) { const [y,m,d]=ymd.split("-").map(Number); return {y,m,d}; }
function addDaysYmd(ymd: string, days: number): string {
  const {y,m,d}=parseYmd(ymd); const utc=new Date(Date.UTC(y,m-1,d+days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth()+1).padStart(2,"0")}-${String(utc.getUTCDate()).padStart(2,"0")}`;
}
function startOfWeekYmd(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const utc=new Date(Date.UTC(y,m-1,d)); const dow=utc.getUTCDay();
  return addDaysYmd(ymd, dow===0?-6:1-dow);
}
function weekdayShortRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const dt=new Date(Date.UTC(y,m-1,d,12));
  return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(dt).replace(".","");
}
function dayDateRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const dt=new Date(Date.UTC(y,m-1,d,12));
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(dt);
}
function weekTitle(startYmd: string): string {
  const endYmd=addDaysYmd(startYmd,6); const a=parseYmd(startYmd); const b=parseYmd(endYmd);
  const start=new Date(Date.UTC(a.y,a.m-1,a.d,12)); const end=new Date(Date.UTC(b.y,b.m-1,b.d,12));
  const fmt=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",timeZone:"UTC"});
  const fmtEnd=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
  return `${fmt.format(start)} — ${fmtEnd.format(end)} · Хабаровск`;
}
function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function timeToMinutes(v: string) { const [h,m]=v.slice(0,5).split(":").map(Number); return h*60+m; }

/** Parse break interval "12:00-12:30" / "12:00–12:30" → minutes from midnight. */
function breakRange(value: string): { start: number; end: number } | null {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/** Pack overlapping events into side-by-side columns (classic calendar layout). */
function layoutDayColumns(items: ScheduleItem[]): Array<{ item: ScheduleItem; col: number; cols: number }> {
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

export default function SchedulePage() {
  return <div className="p-8">Расписание загружается… (partial push — full file in artifacts/deploy)</div>;
}
