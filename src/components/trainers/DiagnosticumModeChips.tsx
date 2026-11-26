"use client";

/**
 * Что показываем студенту в переключателе. Остальные режимы (`identify`,
 * `structures`, `differential`, `schema`) остались в API ради старых попыток и
 * ссылок, но в интерфейсе дублируют «разбор препарата».
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк.
 */

import type { DiagnosticumMode, DiagnosticumOverview } from "@/lib/diagnosticum-api";

const STUDENT_MODES: DiagnosticumMode[] = ["complex", "exam", "electronogram"];

type DiagnosticumModeChipsProps = {
  modes: DiagnosticumOverview["modes"] | undefined;
  mode: DiagnosticumMode;
  onSelect: (mode: DiagnosticumMode) => void;
};

export function DiagnosticumModeChips({ modes, mode, onSelect }: DiagnosticumModeChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(modes ?? []).filter((item) => STUDENT_MODES.includes(item.mode)).map((item) => (
        <button
          key={item.mode}
          type="button"
          onClick={() => onSelect(item.mode)}
          className={
            "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
            (mode === item.mode
              ? "border-indigo-300 bg-indigo-50 text-indigo-800"
              : "border-[var(--border)] bg-white text-slate-600 hover:border-indigo-200")
          }
        >
          {item.title}
        </button>
      ))}
    </div>
  );
}