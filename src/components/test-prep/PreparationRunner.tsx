"use client";

/**
 * Экран прохождения: липкая шапка, вопрос и навигатор.
 *
 * Заголовок, счёт, таймер и кнопки съехали в `RunHeader`, поэтому на телефоне
 * вопрос виден сразу, без прокрутки через четыре блока служебного текста.
 */
import { LoadingBar } from "@/components/ui/LoadingBar";
import { QuestionCard } from "@/components/test-prep/QuestionCard";
import { QuestionNavigator } from "@/components/test-prep/QuestionNavigator";
import { RunHeader } from "@/components/test-prep/RunHeader";
import type { PreparationController } from "@/components/test-prep/usePreparation";
import { questionView } from "@/components/test-prep/view";

export function PreparationRunner({ page }: { page: PreparationController }) {
  const {
    q, idx, questions, experience, loading, error,
    answers, checked, checking, grading, dialog,
  } = page;

  const view = questionView({ q, questions, idx, answers, grading, checked, checking, experience });

  return (
    <div className="test-preparation-page mx-auto max-w-3xl space-y-3 sm:space-y-4">
      <LoadingBar active={loading} />

      <RunHeader page={page} />

      {error && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">
          {error}
        </div>
      )}

      {view.isChecking && (
        <p className="text-xs font-semibold text-indigo-700">Проверяем ответ…</p>
      )}

      <QuestionNavigator page={page} view={view} />

      <QuestionCard page={page} view={view} />

      {q && !page.checked[q.id] && (
        <button
          type="button"
          onClick={() => page.next()}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
        >
          Пропустить и перейти дальше
        </button>
      )}

      {dialog}
    </div>
  );
}
