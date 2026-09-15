"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { listSchedule, hasToken, type ScheduleItem } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная", seminar: "Семинар",
  exam: "Экзамен", credit: "Зачёт", consultation: "Консультация", other: "Занятие",
};

function toDateInput(date: Date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function startOfWeek(value: Date) {
  const date = new Date(value); date.setHours(0, 0, 0, 0); const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day; date.setDate(date.getDate() + diff); return date;
}
function formatDay(date: Date) { return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date); }
function formatWeekTitle(start: Date) {
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const a = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(start);
  const b = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(end);
  return `${a} — ${b}`;
}

export default function SchedulePage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const weekDates = useMemo(() => DAYS.map((_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date; }), [weekStart]);

  async function load() {
    setLoading(true); setError(null);
    const res = await listSchedule(toDateInput(weekDates[0]), toDateInput(weekDates[6]));
    if (res.ok) setItems(res.data.items || []); else setError(res.error.message);
    setLoading(false);
  }
  useEffect(() => { if (!hasToken()) { setLoading(false); return; } void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekStart]);

  if (!hasToken()) return <div className="card p-8 text-center"><p className="text-slate-600">Войдите, чтобы видеть расписание</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;

  const byDate = new Map<string, ScheduleItem[]>();
  for (const item of items) { const list = byDate.get(item.date) || []; list.push(item); byDate.set(item.date, list); }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><CalendarDays className="h-6 w-6 text-indigo-600" /><h1 className="page-title">Расписание</h1></div>
          <p className="page-subtitle">{user?.groupName ? `Группа ${user.groupName}` : "Расписание вашей группы"}{user?.course != null ? ` · ${user.course} курс` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-xl border bg-white p-2 hover:bg-slate-50" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} aria-label="Предыдущая неделя"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => setWeekStart(startOfWeek(new Date()))}>Сегодня</button>
          <button type="button" className="rounded-xl border bg-white p-2 hover:bg-slate-50" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} aria-label="Следующая неделя"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="text-sm font-semibold text-slate-600">{formatWeekTitle(weekStart)}</div>
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading ? <SkeletonCards count={3} /> : <div className="grid gap-3 lg:grid-cols-7">
        {weekDates.map((date, dayIndex) => {
          const key = toDateInput(date); const dayItems = [...(byDate.get(key) || [])].sort((a,b) => `${a.start_time}`.localeCompare(`${b.start_time}`)); const isToday = key === toDateInput(new Date());
          return <section key={key} className={`min-h-48 rounded-2xl border bg-white p-3 ${isToday ? "ring-2 ring-indigo-200" : ""}`}>
            <div className="mb-3 flex items-center justify-between"><div className="font-bold text-slate-800">{DAYS[dayIndex]}</div><div className={`text-xs ${isToday ? "font-bold text-indigo-600" : "text-slate-400"}`}>{formatDay(date)}</div></div>
            <div className="space-y-2">{dayItems.length === 0 ? <div className="py-8 text-center text-xs text-slate-400">Нет занятий</div> : dayItems.map(item => <article key={item.id} className={`rounded-xl border p-3 ${item.is_cancelled ? "border-rose-200 bg-rose-50 opacity-70" : "border-slate-100 bg-slate-50"}`}>
              <div className="text-xs font-semibold text-indigo-600">{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</div>
              <div className={`mt-1 text-sm font-bold ${item.is_cancelled ? "line-through" : ""}`}>{item.subject_name || "Занятие"}</div>
              <div className="mt-1 text-xs text-slate-500">{TYPE_LABELS[item.type] || item.type}{item.is_cancelled ? " · ОТМЕНЕНО" : ""}</div>
              {(item.room || item.building) && <div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{[item.building,item.room].filter(Boolean).join(", ")}</div>}
              {item.notes && <div className="mt-2 text-xs text-slate-500">{item.notes}</div>}
            </article>)}</div>
          </section>;
        })}
      </div>}
    </div>
  );
}
/* synced-2026-09-15 */
