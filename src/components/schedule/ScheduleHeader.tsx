"use client";

/**
 * Шапка расписания: группа/курс/семестр, источник данных, локальное время
 * Хабаровска и переключение недели. Разметка перенесена из
 * `src/app/schedule/page.tsx` без изменений.
 */
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Database } from "lucide-react";
import { addDaysYmd, nowParts, startOfWeekYmd } from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function ScheduleHeader({ schedule }: { schedule: ScheduleController }) {
  const { groupName, course, semester, yearLabel, source, totalCount, now, setWeekStart, setSelectedDay } = schedule;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6" style={{ color: "var(--primary)" }} />
          <h1 className="page-title">Расписание</h1>
        </div>
        <p className="page-subtitle">{groupName}{course != null ? ` · ${course} курс` : ""}{semester != null ? ` · семестр ${semester}` : ""} · {yearLabel}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
            <Database className="h-3.5 w-3.5" /> {source === "db" ? "база данных" : source === "local" ? "резервные данные" : source} · {totalCount} занятий за семестр
          </div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
            <Clock className="h-3.5 w-3.5" /> Хабаровск · {now.timeLabel}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => { const next = addDaysYmd(d, -7); setSelectedDay(next); return next; })} aria-label="Предыдущая неделя"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className="schedule-today-btn" onClick={() => { const t = nowParts().date; setSelectedDay(t); setWeekStart(startOfWeekYmd(t)); }}>Сегодня</button>
        <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => { const next = addDaysYmd(d, 7); setSelectedDay(next); return next; })} aria-label="Следующая неделя"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </header>
  );
}
