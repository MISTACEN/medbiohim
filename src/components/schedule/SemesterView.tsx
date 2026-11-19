"use client";

/** Семестр: метрики, прогресс и таймлайн недель с переходом в неделю. */
import { CalendarDays, CheckCircle2, Clock, GraduationCap, Layers3 } from "lucide-react";
import { shortDateRu, startOfWeekYmd } from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function SemesterView({ schedule }: { schedule: ScheduleController }) {
  const { yearLabel, semesterRange, totalCount, activePeriod, semesterWeeks, today, allItems, setWeekStart, setView } = schedule;

  return (
    <section className="schedule-semester-shell">
      <div className="schedule-view-toolbar">
        <div>
          <div className="schedule-view-kicker"><GraduationCap className="h-4 w-4" /> Учебный ритм</div>
          <h2 className="schedule-view-title">Семестр {yearLabel}</h2>
          <p className="schedule-view-subtitle">Теоретическое обучение · {semesterRange.from} — {semesterRange.to} · {totalCount} занятий</p>
        </div>
        <div className="schedule-semester-status"><CheckCircle2 className="h-4 w-4" /> {activePeriod?.title || "Текущий учебный блок"}</div>
      </div>
      <div className="schedule-semester-metrics">
        <div className="schedule-semester-metric"><span className="metric-icon metric-blue"><CalendarDays /></span><div><b>{semesterWeeks.filter((w) => w.items.length > 0).length}</b><small>активных недель</small></div></div>
        <div className="schedule-semester-metric"><span className="metric-icon metric-green"><CheckCircle2 /></span><div><b>{allItems.filter((it) => it.date < today).length}</b><small>занятий прошло</small></div></div>
        <div className="schedule-semester-metric"><span className="metric-icon metric-violet"><Layers3 /></span><div><b>{new Set(allItems.map((it) => it.subject_name).filter(Boolean)).size}</b><small>дисциплин</small></div></div>
        <div className="schedule-semester-metric"><span className="metric-icon metric-amber"><Clock /></span><div><b>{allItems.reduce((sum, it) => sum + (Number(it.academic_hours) || 0), 0)}</b><small>акад. часов</small></div></div>
      </div>
      <div className="schedule-semester-progress">
        <div className="schedule-semester-progress-top"><b>Прогресс семестра</b><span>Неделя {Math.min(21, Math.max(1, Math.floor(Math.max(0, (new Date(today + "T12:00:00").getTime() - new Date(semesterRange.from + "T12:00:00").getTime()) / 86400000) / 7) + 1))} из {Math.max(1, semesterWeeks.length)}</span></div>
        <div className="schedule-semester-progress-track"><div className="schedule-semester-progress-fill" style={{ width: `${Math.min(100, Math.max(0, ((new Date(today + "T12:00:00").getTime() - new Date(semesterRange.from + "T12:00:00").getTime()) / (new Date(semesterRange.to + "T12:00:00").getTime() - new Date(semesterRange.from + "T12:00:00").getTime())) * 100))}%` }} /></div>
        <div className="schedule-semester-progress-scale"><span>1 сен</span><span>Экватор · 10 нед.</span><span>Зачётная · 19 нед.</span><span>21 янв</span></div>
      </div>
      <div className="schedule-semester-timeline">
        {semesterWeeks.map((w) => {
          const isCurrent = today >= w.start && today <= w.end; const isPast = w.end < today; const preview = w.items.slice(0, 4);
          return <button key={w.index} type="button" onClick={() => { setWeekStart(startOfWeekYmd(w.start)); setView("week"); }} className={`schedule-semester-week ${isCurrent ? "current" : ""} ${isPast ? "past" : ""}`}>
            <div className="schedule-semester-week-head"><span className="schedule-week-no">Неделя {w.index}</span><span>{shortDateRu(w.start)} — {shortDateRu(w.end)}</span></div>
            <div className="schedule-semester-week-track"><span className="schedule-week-fill" style={{ width: `${Math.min(100, Math.max(12, w.items.length * 9))}%` }} /></div>
            <div className="schedule-semester-week-info"><b>{w.items.length}</b><span>занятий</span><div className="schedule-week-subjects">{preview.map((it, i) => <span key={i}>{it.subject_name}</span>)}{w.items.length > 4 && <span>+{w.items.length - 4}</span>}</div></div>
          </button>;
        })}
      </div>
    </section>
  );
}
