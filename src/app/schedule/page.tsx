"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { hasToken } from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";
import IcalImportCard from "@/components/schedule/IcalImportCard";
import { weekTitle } from "@/components/schedule/utils";
import { useSchedulePage } from "@/components/schedule/useSchedulePage";
import { ScheduleHeader } from "@/components/schedule/ScheduleHeader";
import { HomeworkPlanner } from "@/components/schedule/HomeworkPlanner";
import { RecoveryPanel } from "@/components/schedule/RecoveryPanel";
import { WeekView } from "@/components/schedule/WeekView";
import { DayView } from "@/components/schedule/DayView";
import { MonthView } from "@/components/schedule/MonthView";
import { SemesterView } from "@/components/schedule/SemesterView";
import { LessonDrawer } from "@/components/schedule/LessonDrawer";

/**
 * Расписание: страница только собирает виды из модуля `components/schedule`.
 * Данные и действия — `useSchedulePage`, правила — `components/schedule/model`.
 */
export default function SchedulePage() {
  const schedule = useSchedulePage();

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <p style={{ color: "var(--muted)" }}>Войдите, чтобы видеть расписание</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: `
        .schedule-now-line{position:absolute;left:0;right:0;height:0;border-top:2px solid #f43f5e;z-index:30;pointer-events:none}
        .schedule-now-dot{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:999px;background:#f43f5e;box-shadow:0 0 0 3px rgba(244,63,94,.25)}
        .schedule-now-label{position:absolute;left:8px;top:-11px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;background:#f43f5e;color:#fff}
      ` }} />

      <ScheduleHeader schedule={schedule} />

      <IcalImportCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="schedule-tabs">
          {([["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["semester", "Семестр"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => schedule.setView(id)} className={schedule.view === id ? "schedule-tab schedule-tab-active" : "schedule-tab"}>{label}</button>
          ))}
        </div>
        <div className="schedule-period">{weekTitle(schedule.weekStart)} · на неделе {schedule.weekCount}</div>
        {schedule.activePeriod && <div className="w-full rounded-xl border px-3 py-2 text-xs font-semibold" style={{ background: "color-mix(in srgb,var(--primary) 7%,transparent)", color: "var(--primary)" }}>{schedule.activePeriod.title}: {schedule.activePeriod.start_date}{schedule.activePeriod.end_date ? ` — ${schedule.activePeriod.end_date}` : ""}</div>}
      </div>

      {/* Планировщик: полный список ДЗ семестра свёрнут — ДЗ видны прямо на
          занятиях (карточки/день), планировщик нужен для поиска и переноса. */}
      <HomeworkPlanner schedule={schedule} />

      <RecoveryPanel schedule={schedule} />

      {schedule.groupMissing && !schedule.loading && (
        <div className="schedule-config-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div><b>Учебная группа не назначена.</b><p>CMS → Пользователи: назначьте учебную группу. Расписание без подтверждённой группы не подставляется автоматически.</p></div>
        </div>
      )}
      {schedule.displayError && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb,var(--danger) 10%,transparent)", color: "var(--danger)" }}>{schedule.displayError}</div>}

      {schedule.loading ? <SkeletonCards count={4} /> : (
        <>
          {schedule.view === "week" && <WeekView schedule={schedule} />}
          {schedule.view === "day" && <DayView schedule={schedule} />}
          {schedule.view === "month" && <MonthView schedule={schedule} />}
          {schedule.view === "semester" && <SemesterView schedule={schedule} />}
        </>
      )}

      <LessonDrawer schedule={schedule} />
    </div>
  );
}
