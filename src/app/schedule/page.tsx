"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { listSchedule, hasToken, type ScheduleItem } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";

const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная", seminar: "Семинар",
  exam: "Экзамен", credit: "Зачёт", consultation: "Консультация", other: "Занятие",
};
function inputDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function startOfWeek(value: Date) { const d = new Date(value); d.setHours(0, 0, 0, 0); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d; }
function titleForWeek(start: Date) { const end = new Date(start); end.setDate(end.getDate() + 6); const a = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(start); const b = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(end); return `${a} — ${b}`; }
function dayLabel(date: Date) { return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date); }

export default function SchedulePage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => DAYS.map((name, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return { name, date: d, key: inputDate(d) }; }), [weekStart]);
  useEffect(() => { if (!hasToken()) { setLoading(false); return; } setLoading(true); setError(null); void listSchedule(inputDate(days[0].date), inputDate(days[6].date)).then((res) => { if (res.ok) setItems(res.data.items || []); else setError(res.error.message); setLoading(false); }); }, [weekStart]);
  if (!hasToken()) return <div className="card mx-auto max-w-md p-8 text-center"><p className="text-slate-600">Войдите, чтобы видеть расписание</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;
  const grouped = new Map<string, ScheduleItem[]>(); items.forEach((item) => grouped.set(item.date, [...(grouped.get(item.date) || []), item])); grouped.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));
  const today = inputDate(new Date());
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><CalendarDays className="h-6 w-6 text-indigo-600" /><h1 className="page-title">Расписание</h1></div><p className="page-subtitle">{user?.groupName ? `Группа ${user.groupName}` : "Расписание вашей группы"}{user?.course != null ? ` · ${user.course} курс` : ""}</p></div><div className="flex items-center gap-2"><button className="rounded-xl border bg-white p-2 hover:bg-slate-50" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}><ChevronLeft className="h-5 w-5" /></button><button className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => setWeekStart(startOfWeek(new Date()))}>Сегодня</button><button className="rounded-xl border bg-white p-2 hover:bg-slate-50" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}><ChevronRight className="h-5 w-5" /></button></div></div>
    <div className="text-sm font-semibold text-slate-600">{titleForWeek(weekStart)}</div>
    {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {loading ? <SkeletonCards count={4} /> : <div className="space-y-4">{days.map(({ name, date, key }) => { const dayItems = grouped.get(key) || []; const isToday = key === today; return <section key={key} className={`overflow-hidden rounded-2xl border bg-white ${isToday ? "ring-2 ring-indigo-200" : ""}`}><header className={`flex items-center justify-between border-b px-5 py-4 ${isToday ? "bg-indigo-50/60" : "bg-slate-50/70"}`}><div><h2 className="font-bold text-slate-900">{name}</h2><p className="text-xs text-slate-500">{dayLabel(date)}</p></div>{isToday && <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">Сегодня</span>}</header>{dayItems.length === 0 ? <div className="px-5 py-7 text-sm text-slate-400">Нет занятий</div> : <div className="divide-y">{dayItems.map(item => <article key={item.id} className={`grid gap-4 px-5 py-4 md:grid-cols-[110px_1fr_auto] ${item.is_cancelled ? "bg-rose-50/70" : ""}`}><div className="flex items-start gap-2 text-sm font-semibold text-slate-600"><Clock className="mt-0.5 h-4 w-4 text-indigo-500" />{item.start_time.slice(0,5)}–{item.end_time.slice(0,5)}</div><div><div className={`font-bold text-slate-900 ${item.is_cancelled ? "line-through" : ""}`}>{item.subject_name || "Занятие"}</div><div className="mt-1 text-xs font-medium text-indigo-600">{TYPE_LABELS[item.type] || item.type}{item.is_cancelled ? " · ОТМЕНЕНО" : ""}</div>{item.notes && <p className="mt-2 text-sm text-slate-500">{item.notes}</p>}</div>{(item.room || item.building) && <div className="flex items-start gap-1 text-sm text-slate-500 md:justify-self-end"><MapPin className="mt-0.5 h-4 w-4" />{[item.building, item.room].filter(Boolean).join(", ")}</div>}</article>)}</div>}</section>; })}</div>}
  </div>;
}
/* cms-schedule-classic-2026-09-15 */
