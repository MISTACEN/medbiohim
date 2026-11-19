"use client";

/** День: pill-кнопки дней недели и список занятий выбранного дня. */
import { CalendarDays, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { importantEventKind } from "@/components/schedule/ScheduleCard";
import { EVENT_KIND_LABELS } from "@/components/schedule/model";
import { TYPE_LABELS, attendanceLabel, dayDateRu, startOfWeekYmd, subjectColor, weekdayShortRu } from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function DayView({ schedule }: { schedule: ScheduleController }) {
  const {
    days,
    today,
    currentDayItems,
    setSelectedDay,
    setWeekStart,
    setView,
    openLesson,
    homeworkByEntry,
    dayScrollRef,
    rememberDayScroll,
  } = schedule;

  return (
    <div className="space-y-3">
      <div className="schedule-day-picker" ref={dayScrollRef} onScroll={rememberDayScroll}>
        {days.map(({ key }) => (
          <button key={key} type="button" className={key === today ? "schedule-day-pill schedule-day-pill-active" : "schedule-day-pill"} onClick={() => { setSelectedDay(key); setWeekStart(startOfWeekYmd(key)); setView("day"); }}>
            <span>{weekdayShortRu(key)}</span><b>{dayDateRu(key)}</b>
          </button>
        ))}
      </div>
      <div className="card divide-y overflow-hidden p-0">
        {currentDayItems.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarDays}
            title="На сегодня занятий нет"
            description="Выберите другой день pill-кнопками выше или проверьте «Неделю» и «Месяц»."
          />
        ) : currentDayItems.map((item) => (
          <button key={item.id || item.start_time} type="button" className="flex w-full gap-4 p-4 text-left hover:bg-black/5" onClick={() => openLesson(item)}>
            <div className="w-24 shrink-0 text-sm font-semibold" style={{ color: "var(--primary)" }}>{item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-bold" style={{ borderLeft: `3px solid ${subjectColor(item)}`, paddingLeft: 8 }}>{item.subject_name || "Занятие"}</b>
                {importantEventKind((item as { event_kind?: unknown }).event_kind) && (
                  <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--status-warn-fg)]">
                    {EVENT_KIND_LABELS[importantEventKind((item as { event_kind?: unknown }).event_kind) as string]}
                  </span>
                )}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{item.is_makeup ? "ОТРАБОТКА" : TYPE_LABELS[item.type || ""] || item.type} · {attendanceLabel(item.attendance_status) || "отметьте посещение"}</div>
              {(homeworkByEntry[String(item.id ?? "")] || []).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(homeworkByEntry[String(item.id ?? "")] || []).map((hw: any) => (
                    <span key={String(hw.id)} className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary)]" title={String(hw.description || hw.title || "")}>
                      <ClipboardList className="h-3 w-3" /> ДЗ: {String(hw.title || "")}{hw.my_status === "done" ? " ✓" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
