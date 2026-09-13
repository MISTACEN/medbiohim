"use client";

import { useState, useEffect } from "react";
import { Clock, MapPin, Zap } from "lucide-react";
import { weekSchedule, todaySchedule, examSummary, currentUser } from "@/lib/mock-data";
import type { ScheduleEntry } from "@/types";

const timeSlots = ["08:30–10:10", "10:40–12:20", "12:50–14:30", "14:45–16:25"];
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const pastel = [
  "bg-rose-50 text-rose-900 border-rose-100",
  "bg-emerald-50 text-emerald-900 border-emerald-100",
  "bg-sky-50 text-sky-900 border-sky-100",
  "bg-amber-50 text-amber-900 border-amber-100",
  "bg-violet-50 text-violet-900 border-violet-100",
  "bg-indigo-50 text-indigo-900 border-indigo-100",
  "bg-teal-50 text-teal-900 border-teal-100",
];

function colorFor(subject: string) {
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h + subject.charCodeAt(i) * 17) % pastel.length;
  return pastel[h];
}

function nowLineTop(): number | null {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = 8 * 60 + 30;
  const end = 16 * 60 + 25;
  if (mins < start || mins > end) return null;
  return ((mins - start) / (end - start)) * 100;
}

function findEntry(dayIndex: number, slotIndex: number): ScheduleEntry | undefined {
  return weekSchedule.find((e) => e.dayIndex === dayIndex && e.slotIndex === slotIndex);
}

export default function SchedulePage() {
  const [view, setView] = useState<"day" | "week" | "month" | "semester">("week");
  const [nowTop, setNowTop] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowTop(nowLineTop());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Расписание</h1>
          <p className="page-subtitle">Группа {currentUser.groupName} · Курс {currentUser.course} · Семестр {currentUser.semester}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["semester", "Семестр"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setView(key)}
              className={`rounded-pill px-4 py-1.5 text-sm font-semibold transition ${
                view === key ? "bg-brand-gradient text-white shadow-card" : "border border-slate-200 bg-white text-slate-600 hover:bg-indigo-50"
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {view === "week" && (
        <div className="card relative overflow-x-auto p-4">
          <div className="relative min-w-[760px]">
            {nowTop != null && (
              <div className="pointer-events-none absolute left-16 right-0 z-20 flex items-center" style={{ top: `calc(${nowTop}% + 28px)` }}>
                <span className="mr-1 h-2.5 w-2.5 rounded-full bg-rose-500 shadow" />
                <div className="h-0.5 flex-1 bg-rose-500/90 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
              </div>
            )}
            <div className="grid grid-cols-8 gap-2 pb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              <div />
              {days.map((d) => <div key={d}>{d}</div>)}
            </div>
            {timeSlots.map((slot, slotIndex) => (
              <div key={slot} className="grid grid-cols-8 gap-2 py-2">
                <div className="flex items-center text-xs font-medium text-slate-500">{slot}</div>
                {days.map((d, dayIndex) => {
                  const entry = findEntry(dayIndex, slotIndex);
                  return (
                    <div key={`${d}-${slot}`} className="min-h-[72px]">
                      {entry ? (
                        <div className={`h-full rounded-soft border p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-card ${colorFor(entry.subject)}`}>
                          <div className="text-[12px] font-bold leading-tight">{entry.subject}</div>
                          <div className="mt-0.5 text-[11px] opacity-70">{entry.type}</div>
                          <div className="mt-1 flex items-center gap-1 text-[11px] opacity-80"><MapPin className="h-3 w-3" />{entry.room}</div>
                          {entry.isNonStandard && (
                            <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700"><Zap className="h-3 w-3" /> время</span>
                          )}
                        </div>
                      ) : (
                        <div className="h-full rounded-soft bg-slate-50/80" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "day" && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Сегодня</h2>
          {todaySchedule.map((e) => (
            <div key={e.id} className={`rounded-soft border p-4 transition hover:-translate-y-0.5 hover:shadow-card ${colorFor(e.subject)}`}>
              <div className="flex justify-between gap-2">
                <div>
                  <span className="font-bold">{e.subject}</span>
                  <span className="ml-2 text-sm opacity-70">{e.type}</span>
                </div>
                {e.isNonStandard && <span className="badge-warning inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5" />нестандартное</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm opacity-80">
                <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{e.startTime}–{e.endTime}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{e.room}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {(view === "month" || view === "semester") && (
        <div className="card p-12 text-center text-slate-500">Вид «{view === "month" ? "Месяц" : "Семестр"}» — после API календаря.</div>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold text-slate-900">Экзамены и зачёты</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {examSummary.map((item) => (
            <li key={item.name} className="flex items-center justify-between rounded-soft border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm">
              <span className="font-medium text-slate-800">{item.name}</span>
              <span className={item.type === "экзамен" ? "badge-danger" : "badge-success"}>{item.type}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
