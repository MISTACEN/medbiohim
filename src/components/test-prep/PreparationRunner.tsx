"use client";

/** Экран прохождения: шапка со счётом и таймером, прогресс, навигатор, вопрос. */
import { LoadingBar } from "@/components/ui/LoadingBar";
import { QuestionCard } from "@/components/test-prep/QuestionCard";
import { QuestionNavigator } from "@/components/test-prep/QuestionNavigator";
import type { PreparationController } from "@/components/test-prep/usePreparation";
import { questionView, scoreSummary } from "@/components/test-prep/view";

export function PreparationRunner({ page }: { page: PreparationController }) {
  const {
    q, idx, questions, mode, experience, meta, loading, error, bankProgress,
    answers, checked, checking, grading, stats,
    remainingSec, timeExpired, finish, exit, dialog,
  } = page;

  const view = questionView({ q, questions, idx, answers, grading, checked, checking, experience });
  const score = scoreSummary(questions, grading, checked);

  return (
    <div className="test-preparation-page space-y-4 sm:space-y-5">
      <LoadingBar active={loading} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {meta?.subject && (
              <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">{meta.subject}</span>
            )}
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{view.experienceLabel}</span>
          </div>
          <h1 className="page-title">{meta?.title || "Тест"}</h1>
          <p className="page-subtitle">
            {view.hideNumbers ? "Вопрос" : `Вопрос ${idx + 1} из ${questions.length}`} · отвечено {score.answeredCount}
            {mode === "sequential" ? " · проход всего банка" : ""}
            {view.isOpen
              ? " · письменный ответ"
              : view.isMulti
                ? " · можно выбрать несколько вариантов"
                : " · выберите вариант"} · незавершённый тест сохраняется
            {" · "}
            {experience === "exam"
              ? "эталоны после завершения"
              : experience === "solve"
                ? "проверка после завершения"
                : "проверка сразу"}
          </p>
          {!view.hideNumbers && score.counted > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <span className="rounded-full bg-[var(--status-ok-bg)] px-2.5 py-1 text-[var(--status-ok-fg)]">Верно {score.correctCount}</span>
              <span className="rounded-full bg-[var(--status-warn-bg)] px-2.5 py-1 text-[var(--status-warn-fg)]">Частично {score.partialCount}</span>
              <span className="rounded-full bg-[var(--status-critical-bg)] px-2.5 py-1 text-[var(--status-critical-fg)]">Ошибок {score.wrongCount}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Средний {score.averagePercent}%</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {remainingSec != null && !stats && (
            <div
              className={
                "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold tabular-nums " +
                (timeExpired
                  ? "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
                  : remainingSec < 300
                    ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
                    : "border border-indigo-200 bg-indigo-50 text-indigo-900")
              }
              title={timeExpired ? "Время теста вышло" : "Лимит времени этого теста"}
              role="timer"
              aria-label={"Осталось времени: " + Math.floor(remainingSec / 60) + " мин " + (remainingSec % 60) + " с"}
            >
              {timeExpired ? "Время вышло" : "Осталось " + Math.floor(remainingSec / 60) + ":" + String(remainingSec % 60).padStart(2, "0")}
            </div>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void finish(score.answeredCount < questions.length)}
            className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800"
          >
            {score.answeredCount < questions.length ? "Завершить досрочно" : "Завершить тест"}
          </button>
          <button type="button" onClick={() => void exit()} className="text-sm text-slate-500" title="Прогресс сохранится, тест останется незавершённым">
            Сохранить и выйти
          </button>
        </div>
      </div>

      {mode === "sequential" && bankProgress && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">Банк: {bankProgress.answered ?? 0} / {bankProgress.total ?? questions.length}{bankProgress.completed ? " · пройден полностью" : ""}</div>}

      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      <div className="h-2 rounded bg-slate-100 sticky-progress">
        <div className="h-2 rounded bg-indigo-500" style={{ width: ((idx + 1) / questions.length) * 100 + "%" }} />
      </div>

      <QuestionNavigator page={page} view={view} />

      <QuestionCard page={page} view={view} />
      {dialog}
    </div>
  );
}
