"use client";

/** Месяц: сетка календаря, метки важных дней и колонка выбранного дня. */
import { CalendarDays, ChevronLeft, ChevronRight, Target } from "lucide-react";
import { importantEventKind } from "@/components/schedule/ScheduleCard";
import { EVENT_KIND_LABELS } from "@/components/schedule/model";
import {
  TYPE_LABELS,
  addMonthsYmd,
  dateLabelRu,
  monthStartYmd,
  monthTitle,
  nowParts,
  parseYmd,
  subjectColorKey,
} from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function MonthView({ schedule }: { schedule: ScheduleController }) {
  const {
    monthStart,
    setMonthStart,
    monthDays,
    monthItems,
    allItems,
    today,
    selectedDay,
    setSelectedDay,
    currentDayItems,
    openLesson,
  } = schedule;

  return (
    <section className="schedule-month-shell">
      <div className="schedule-view-toolbar">
        <div>
          <div className="schedule-view-kicker"><CalendarDays className="h-4 w-4" /> Календарь месяца</div>
          <h2 className="schedule-view-title">{monthTitle(monthStart)}</h2>
          <p className="schedule-view-subtitle">{monthItems.length} занятий · нажмите на день для подробностей</p>
        </div>
        <div className="schedule-toolbar-actions">
          <button type="button" className="schedule-icon-btn" onClick={() => setMonthStart((d) => addMonthsYmd(d, -1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="schedule-today-btn" onClick={() => { const t = nowParts().date; setMonthStart(monthStartYmd(t)); setSelectedDay(t); }}>Сегодня</button>
          <button type="button" className="schedule-icon-btn" onClick={() => setMonthStart((d) => addMonthsYmd(d, 1))} aria-label="Следующий месяц"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="schedule-month-layout">
        <div className="schedule-month-grid">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="schedule-month-weekday">{d}</div>)}
          {monthDays.map((day) => {
            const inMonth = day.startsWith(monthStart.slice(0, 7));
            const dayItems = allItems.filter((it) => it.date === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
            const isToday = day === today;
            const isSelected = day === selectedDay;
            // Важный день в месяце: коллоквиум/КР/зачёт/экзамен — метка в шапке ячейки.
            const importantDay = dayItems.map((it) => importantEventKind((it as { event_kind?: unknown }).event_kind)).find(Boolean) as string | undefined;
            return (
              <button key={day} type="button" onClick={() => setSelectedDay(day)} className={`schedule-month-cell ${inMonth ? "" : "schedule-month-cell-muted"} ${isToday ? "schedule-month-cell-today" : ""} ${isSelected ? "schedule-month-cell-selected" : ""}`}>
                <div className="schedule-month-cell-head"><span className="schedule-month-day-number">{parseYmd(day).d}</span>{importantDay && <span className="rounded bg-[var(--status-warn-bg)] px-1 text-[8px] font-extrabold uppercase text-[var(--status-warn-fg)]">{EVENT_KIND_LABELS[importantDay]}</span>}{dayItems.length > 0 && <span className="schedule-month-count">{dayItems.length}</span>}</div>
                <div className="schedule-month-events">
                  {dayItems.slice(0, 3).map((it) => <span key={it.id || `${day}-${it.start_time}-${it.subject_name}`} className={`schedule-mini-event schedule-mini-${subjectColorKey(it.type)}`}><b>{it.start_time.slice(0, 5)}</b> <span>{it.subject_name || "Занятие"}</span></span>)}
                  {dayItems.length > 3 && <span className="schedule-more">+ ещё {dayItems.length - 3}</span>}
                </div>
              </button>
            );
          })}
        </div>
        <aside className="schedule-month-side">
          <div className="schedule-side-label"><Target className="h-4 w-4" /> Выбранный день</div>
          <div className="schedule-side-date">{dateLabelRu(selectedDay)}</div>
          {selectedDay === today && <span className="schedule-current-pill"><span />Сегодня</span>}
          <div className="schedule-side-summary"><b>{currentDayItems.length}</b><span>{currentDayItems.length === 1 ? "занятие" : currentDayItems.length >= 2 && currentDayItems.length <= 4 ? "занятия" : "занятий"}</span></div>
          <div className="schedule-side-list">
            {currentDayItems.length === 0 ? <div className="schedule-empty"><CalendarDays className="h-5 w-5" /><span>Свободный день</span></div> : currentDayItems.map((it) =>
              <button key={it.id || `${it.start_time}-${it.subject_name}`} type="button" className={`schedule-side-item schedule-side-${subjectColorKey(it.type)}`} onClick={() => openLesson(it)}>
                <div className="schedule-side-time">{it.start_time.slice(0, 5)}–{it.end_time.slice(0, 5)}</div>
                <div className="schedule-side-subject">{it.subject_name || "Занятие"}</div>
                <div className="schedule-side-meta">{TYPE_LABELS[it.type || ""] || it.type}{it.room ? ` · Ауд. ${it.room}` : ""}</div>
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
