"use client";

/**
 * Шапка прохождения: где я, сколько прошёл, сколько осталось и как выйти.
 *
 * Липкая и одна на весь экран: раньше заголовок, счёт, таймер и кнопки жили
 * в четырёх разных блоках, и при прокрутке к вопросу ориентиры исчезали.
 */
import { Check, LogOut, X } from "lucide-react";

import type { PreparationController } from "@/components/test-prep/usePreparation";
import { questionView, scoreSummary } from "@/components/test-prep/view";

export function RunHeader({ page }: { page: PreparationController }) {
  const {
    q, idx, questions, mode, experience, meta, loading, stats,
    answers, checked, checking, grading,
    remainingSec, timeExpired, finish, exit,
  } = page;

  const view = questionView({ q, questions, idx, answers, grading, checked, checking, experience });
  const score = scoreSummary(questions, grading, checked);
  const percent = questions.length ? Math.round(((idx + 1) / questions.length) * 100) : 0;

  return (
    <div className="sticky top-2 z-20 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => void exit()}
          title="Прогресс сохранится, тест останется незавершённым"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-slate-500 transition hover:border-indigo-300 hover:text-indigo-700"
          aria-label="Сохранить и выйти"
        >
          <LogOut className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-indigo-600">
            {meta?.subject || "Тест"} · {view.experienceLabel}
          </p>
          <h1 className="truncate text-sm font-extrabold text-slate-950 sm:text-base">
            {meta?.title || "Тест"}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 tabular-nums text-slate-700">
            {view.hideNumbers ? "—" : idx + 1} / {questions.length}
          </span>
          {!view.hideNumbers && score.counted > 0 && (
            <>
              <span className="hidden items-center gap-1 rounded-full bg-[var(--status-ok-bg)] px-2 py-1 text-[var(--status-ok-fg)] sm:inline-flex">
                <Check className="h-3.5 w-3.5" /> {score.correctCount}
              </span>
              <span className="hidden items-center gap-1 rounded-full bg-[var(--status-critical-bg)] px-2 py-1 text-[var(--status-critical-fg)] sm:inline-flex">
                <X className="h-3.5 w-3.5" /> {score.wrongCount}
              </span>
            </>
          )}
          {remainingSec != null && !stats && (
            <span
              role="timer"
              aria-label={`Осталось времени: ${Math.floor(remainingSec / 60)} мин ${remainingSec % 60} с`}
              className={
                "rounded-full px-2.5 py-1 tabular-nums " +
                (timeExpired
                  ? "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
                  : remainingSec < 300
                    ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
                    : "bg-indigo-50 text-indigo-900")
              }
            >
              {timeExpired
                ? "время"
                : `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void finish(score.answeredCount < questions.length)}
            disabled={loading}
            className="inline-flex min-h-9 items-center rounded-xl border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-800 disabled:opacity-60 sm:px-3"
          >
            {score.answeredCount < questions.length ? "Завершить" : "Сдать"}
          </button>
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-b-2xl bg-slate-100">
        <div
          className="h-1 bg-indigo-500 transition-[width]"
          style={{ width: percent + "%" }}
          aria-hidden
        />
      </div>

      {mode === "sequential" && (
        <div className="border-t border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-indigo-800 sm:px-4">
          Режим «весь банк»: вопросы идут по порядку, прогресс сохраняется
        </div>
      )}
    </div>
  );
}
