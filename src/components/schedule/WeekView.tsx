"use client";

/** Неделя: сетка по времени с карточками занятий и линией «сейчас». */
import { CalendarDays, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import ScheduleCard from "@/components/schedule/ScheduleCard";
import { SLOTS, dayDateRu, layoutDayColumns, weekdayShortRu } from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function WeekView({ schedule }: { schedule: ScheduleController }) {
  const {
    meta,
    days,
    today,
    homeworks,
    grouped,
    homeworkByEntry,
    openLesson,
    showNowLine,
    nowTop,
    now,
    weekCount,
    totalCount,
  } = schedule;

  return (
    <div className="space-y-3">
      {meta.periods.length > 0 && <div className="flex flex-wrap gap-2">{meta.periods.map((p: any) => <div key={p.id} className="rounded-xl border px-3 py-2 text-xs" title={p.notes || ""}><b>{p.title}</b> · {p.start_date}{p.end_date ? ` — ${p.end_date}` : ""}</div>)}</div>}
      <div className="schedule-shell">
        <div className="schedule-scroll">
          <div className="schedule-grid" style={{ minWidth: 1080 }}>
            <div className="schedule-corner"><Clock className="h-4 w-4" /></div>
            {days.map(({ key }, dayIndex) => (
              <div key={key} style={{ gridColumn: dayIndex + 2, gridRow: 1 }} className={`schedule-day-head ${key === today ? "schedule-day-today" : ""}`}>
                <div>{weekdayShortRu(key)}</div>
                <strong>{dayDateRu(key)}</strong>
                {key === today && <span>Сегодня</span>}
                <div className="mt-1 space-y-0.5 text-left">{homeworks.filter((h: any) => h.due_date === key).slice(0, 2).map((h: any) => <div key={h.id} className="truncate rounded bg-white/70 px-1.5 py-0.5 text-[8px] font-semibold" title={h.title}>ДЗ: {h.title}{h.my_status === "done" ? " ✓" : ""}</div>)}{homeworks.filter((h: any) => h.due_date === key).length > 2 && <div className="text-[8px] opacity-60">+ ещё {homeworks.filter((h: any) => h.due_date === key).length - 2} ДЗ</div>}</div>
              </div>
            ))}
            <div className="schedule-times" style={{ gridColumn: 1, gridRow: 2 }}>{SLOTS.map((t) => <div key={t} className="schedule-time">{t}</div>)}</div>
            {days.map(({ key }, dayIndex) => (
              <div key={key} style={{ gridColumn: dayIndex + 2, gridRow: 2 }} className="schedule-day-column relative">
                {SLOTS.map((t) => <div key={t} className="schedule-hour-line" />)}
                {layoutDayColumns(grouped.get(key) || []).map(({ item, col, cols }) => (
                  <ScheduleCard
                    key={String(item.id ?? `${item.date}-${item.start_time}-${item.subject_name}-${col}`)}
                    item={item}
                    col={col}
                    cols={cols}
                    homeworks={homeworkByEntry[String(item.id ?? "")] || []}
                    onOpen={openLesson}
                  />
                ))}
                {key === today && showNowLine && (
                  <div className="schedule-now-line" style={{ top: nowTop }} aria-label={`Сейчас ${now.timeLabel}`}>
                    <span className="schedule-now-dot" /><span className="schedule-now-label">{now.timeLabel}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {weekCount === 0 && (
          <EmptyState
            compact
            icon={CalendarDays}
            title="На эту неделю занятий нет"
            description={`В семестре загружено ${totalCount}. Листайте ← →, откройте «Месяц» или «Семестр».`}
          />
        )}
      </div>
    </div>
  );
}
