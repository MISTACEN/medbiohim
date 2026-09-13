"use client";

import { useState } from "react";
import { Clock, MapPin, AlertTriangle } from "lucide-react";
import { weekSchedule, todaySchedule, examSummary, currentUser } from "@/lib/mock-data";
import type { ScheduleEntry } from "@/types";

const timeSlots = ["08:30–10:10", "10:40–12:20", "12:50–14:30", "14:45–16:25"];
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function findEntry(dayIndex: number, slotIndex: number): ScheduleEntry | undefined {
  return weekSchedule.find((e) => e.dayIndex === dayIndex && e.slotIndex === slotIndex);
}

export default function SchedulePage() {
  const [view, setView] = useState<"day" | "week" | "month" | "semester">("week");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Расписание</h1>
          <p className="mt-1 text-gray-500">
            Группа {currentUser.groupName} · Курс {currentUser.course} · Семестр {currentUser.semester}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([ ["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["semester", "Семестр"] ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                view === key ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {view === "week" && (
        <div className="card overflow-x-auto p-4">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-8 gap-2 border-b border-gray-100 pb-2 text-center text-sm font-medium text-gray-500">
              <div />
              {days.map((d) => <div key={d}>{d}</div>)}
            </div>
            {timeSlots.map((slot, slotIndex) => (
              <div key={slot} className="grid grid-cols-8 gap-2 border-b border-gray-50 py-2">
                <div className="flex items-center text-xs text-gray-500">{slot}</div>
                {days.map((d, dayIndex) => {
                  const entry = findEntry(dayIndex, slotIndex);
                  return (
                    <div key={`${d}-${slot}`} className="min-h-[72px] rounded-lg border border-dashed border-gray-100 p-1.5">
                      {entry && (
                        <div className="h-full rounded-md bg-primary/10 p-2 text-xs">
                          <div className="font-semibold text-primary">{entry.subject}</div>
                          <div className="text-gray-600">{entry.type}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-gray-500"><MapPin className="h-3 w-3" />{entry.room}</div>
                          {entry.isNonStandard && (
                            <span className="mt-1 inline-block rounded bg-warning/20 px-1 text-[10px] font-medium text-warning">нестандартное время</span>
                          )}
                        </div>
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
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Сегодня</h2>
          <ul className="space-y-3">
            {todaySchedule.map((e) => (
              <li key={e.id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="flex justify-between gap-2">
                  <div>
                    <span className="font-semibold">{e.subject}</span>
                    <span className="ml-2 text-sm text-gray-500">{e.type}</span>
                    {e.topic && <p className="mt-1 text-sm text-gray-600">{e.topic}</p>}
                  </div>
                  {e.isNonStandard && (
                    <span className="flex items-center gap-1 rounded bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" /> нестандартное время
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{e.startTime}–{e.endTime}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{e.room}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(view === "month" || view === "semester") && (
        <div className="card p-12 text-center text-gray-500">
          Вид «{view === "month" ? "Месяц" : "Семестр"}» — после подключения календаря Supabase.
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-3 font-semibold text-gray-800">Экзамены и зачёты</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {examSummary.map((item) => (
            <li key={item.name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span>{item.name}</span>
              <span className={item.type === "экзамен" ? "font-medium text-danger" : "font-medium text-success"}>{item.type}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
