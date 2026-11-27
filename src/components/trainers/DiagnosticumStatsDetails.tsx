"use client";

/**
 * Раскрывающийся блок «Мои результаты и ошибки».
 *
 * Вынесено из `DiagnosticumRunner`: статистика — вторичный блок и не должна
 * удлинять файл задания.
 */
import { DiagnosticumStats } from "@/components/trainers/DiagnosticumStats";

type DiagnosticumStatsDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshKey: number;
};

export function DiagnosticumStatsDetails({ open, onOpenChange, refreshKey }: DiagnosticumStatsDetailsProps) {
  return (
    <details
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3"
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        Мои результаты и ошибки
      </summary>
      {open ? (
        <div className="mt-3">
          <DiagnosticumStats refreshKey={refreshKey} />
        </div>
      ) : null}
    </details>
  );
}
