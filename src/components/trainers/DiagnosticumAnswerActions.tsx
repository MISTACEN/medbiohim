"use client";

/**
 * Действия под заданием: ответ и подсказка (или пояснение, почему её нет).
 * Вынесено из `DiagnosticumRunner` ради бюджета строк.
 */
import { HelpCircle } from "lucide-react";
import type { DiagnosticumMode } from "@/lib/diagnosticum-api";

type DiagnosticumAnswerActionsProps = {
  mode: DiagnosticumMode;
  busy: boolean;
  ready: boolean;
  hintsUsed: number;
  hintsTotal: number;
  onSubmit: () => void;
  onHint: () => void;
};

export function DiagnosticumAnswerActions({
  mode,
  busy,
  ready,
  hintsUsed,
  hintsTotal,
  onSubmit,
  onHint,
}: DiagnosticumAnswerActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !ready}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        Ответить
      </button>
      {mode === "exam" || mode === "electronogram" ? (
        <span className="text-xs text-slate-500">
          {mode === "exam"
            ? "Экзамен: подсказок нет, эталон откроется только в разборе после серии."
            : "Для электронограмм подсказок нет: методички к ним не привязаны."}
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={onHint}
            disabled={busy || hintsUsed >= hintsTotal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-200 disabled:opacity-60"
          >
            <HelpCircle className="h-4 w-4" />
            {hintsUsed >= hintsTotal
              ? "Все подсказки использованы"
              : `Подсказка ${hintsUsed + 1}/${hintsTotal}`}
          </button>
          <span className="text-xs text-slate-400">Каждая подсказка снижает балл на 10.</span>
        </>
      )}
    </div>
  );
}
