"use client";

/** Пропуски и невыполненные ДЗ по предметам — одна строка на предмет. */
import { subjectColor } from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function RecoveryPanel({ schedule }: { schedule: ScheduleController }) {
  const { recovery } = schedule;
  if (recovery.length === 0) return null;

  return (
    <section className="rounded-2xl border p-4" style={{ background: "color-mix(in srgb,var(--primary) 4%,var(--card))" }}>
      <div className="mb-2 flex items-center justify-between gap-3"><div><b>Что нужно подтянуть</b><p className="text-xs opacity-60">Пропуски и невыполненные ДЗ по предметам.</p></div><span className="rounded-full px-2 py-1 text-xs font-bold">{recovery.length} предмета</span></div>
      {/* Одна строка на предмет вместо сетки карточек — быстрее сканируется. */}
      <ul className="space-y-1 text-sm">
        {recovery.slice(0, 6).map((r: any) => <li key={r.subject_name} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "color-mix(in srgb,var(--primary) 4%,transparent)" }}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: subjectColor(r) }} /><b className="min-w-0 flex-1 truncate">{r.subject_name}</b>
          <span className="text-xs opacity-70">{r.unexcused || 0} неуваж. · {(r.excused || 0) + (r.sick || 0)} уваж. · {r.homeworks_pending || 0} ДЗ не закрыто</span>
        </li>)}
      </ul>
    </section>
  );
}
