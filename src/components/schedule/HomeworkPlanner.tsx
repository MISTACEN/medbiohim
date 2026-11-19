"use client";

/**
 * Планировщик заданий: свёрнутый список всех ДЗ семестра с поиском, фильтрами
 * и переносом срока. Разметка перенесена из `src/app/schedule/page.tsx`.
 */
import { CalendarClock, CheckCircle2, ClipboardList, Loader2, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { addDaysYmd, shortDateRu, subjectColor } from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function HomeworkPlanner({ schedule }: { schedule: ScheduleController }) {
  const {
    loading,
    homeworks,
    filteredHomeworks,
    hwSearch,
    setHwSearch,
    hwSubject,
    setHwSubject,
    hwSubjects,
    hwStatus,
    setHwStatus,
    homeworkBusy,
    homeworkStatus,
    homeworkStatusLabel,
    homeworkEditable,
    toggleHomework,
    rescheduleHomework,
    now,
  } = schedule;

  if (loading || homeworks.length === 0) return null;

  return (
    <details className="rounded-2xl border p-4" aria-label="Планировщик заданий">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <div>
          <b>Планировщик заданий</b>
          <p className="text-xs opacity-60">Все ДЗ семестра: поиск, фильтры по предмету и статусу, перенос сроков.</p>
        </div>
        <span className="rounded-full px-2 py-1 text-xs font-bold">{filteredHomeworks.length} / {homeworks.length}</span>
      </summary>
      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
          <input
            value={hwSearch}
            onChange={(e) => setHwSearch(e.target.value)}
            placeholder="Поиск по заданиям…"
            className="w-56 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-2 text-sm"
          />
        </label>
        <select
          value={hwSubject}
          onChange={(e) => setHwSubject(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
          aria-label="Фильтр по предмету"
        >
          <option value="">Все предметы</option>
          {hwSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="schedule-tabs">
          {([["all", "Все"], ["active", "Активные"], ["overdue", "Просрочено"], ["done", "Готово"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setHwStatus(id)} className={hwStatus === id ? "schedule-tab schedule-tab-active" : "schedule-tab"}>{label}</button>
          ))}
        </div>
      </div>
      {filteredHomeworks.length === 0 ? (
        <EmptyState compact icon={ClipboardList} title="Заданий по фильтру нет" description="Измените поиск или фильтры — либо все задания в этом статусе закрыты." />
      ) : (
        <ul className="space-y-2">
          {filteredHomeworks.map((h: any) => {
            const hs = homeworkStatus(h);
            const due = String(h.due_date || h.due_at?.slice(0, 10) || "");
            const editable = homeworkEditable(h);
            return (
              <li key={String(h.id)} className="flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--card)] p-3">
                <button type="button" disabled={homeworkBusy === String(h.id)} onClick={() => void toggleHomework(h)} aria-label={hs === "done" ? "Отметить как невыполненное" : "Отметить выполненным"} className={hs === "done" ? "text-[var(--status-ok-fg)]" : "text-slate-300"}>
                  <CheckCircle2 className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <b className={hs === "done" ? "line-through opacity-60" : ""}>{h.title}</b>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs opacity-70">
                    {h.subject_name && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: subjectColor(h) }} />{h.subject_name}</span>}
                    {due && <span>· срок {shortDateRu(due)}</span>}
                    {hs === "overdue" && <span className="rounded-full bg-[var(--status-critical-bg)] px-1.5 py-0.5 font-semibold text-[var(--status-critical-fg)]">просрочено</span>}
                    {hs === "done" && <span className="rounded-full bg-[var(--status-ok-bg)] px-1.5 py-0.5 font-semibold text-[var(--status-ok-fg)]">готово</span>}
                    {hs !== "done" && hs !== "overdue" && homeworkStatusLabel(h) && <span className="rounded-full bg-[var(--status-warn-bg)] px-1.5 py-0.5 font-semibold text-[var(--status-warn-fg)]">{homeworkStatusLabel(h)}</span>}
                  </div>
                </div>
                {editable && (
                  <button
                    type="button"
                    disabled={homeworkBusy === String(h.id)}
                    onClick={() => void rescheduleHomework(h, 1)}
                    title={`Перенести срок на ${shortDateRu(addDaysYmd(due || now.date, 1))}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:border-[var(--primary)]"
                  >
                    {homeworkBusy === String(h.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                    На день позже
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
