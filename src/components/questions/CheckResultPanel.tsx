"use client";

/**
 * Панель результата проверки письменного/открытого ответа (этап C).
 *
 * Раньше существовала двумя дословными копиями: в `OpenAnswerPractice` и
 * `ExamModePanel`. Здесь один компонент; различия оформления передаются
 * пропсами, поэтому перенос не меняет ни разметку, ни текст на экранах.
 *
 * Компонент не зависит от предметного модуля: принимает структурно совместимый
 * результат проверки и готовую подпись статуса.
 */
import { CheckCircle2, TriangleAlert } from "lucide-react";

export type CheckResultPoint = {
  id: string;
  label: string;
};

/** Минимальный контракт результата: совместим с `SelfWorkCheckResult`. */
export type CheckResultLike = {
  percent: number;
  score: number;
  max: number;
  hits: CheckResultPoint[];
  misses: CheckResultPoint[];
  feedback: string[];
  passed: boolean;
  complete: boolean;
};

/** Статусные токены — те же, что в LectureRenderer/MiniQuizBlock. */
export const RESULT_TONES = {
  ok: {
    box: "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]",
    text: "text-[var(--status-ok-fg)]",
  },
  warn: {
    box: "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]",
    text: "text-[var(--status-warn-fg)]",
  },
  critical: {
    box: "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]",
    text: "text-[var(--status-critical-fg)]",
  },
} as const;

export function resultTone(result: Pick<CheckResultLike, "complete" | "passed">) {
  if (result.complete) return RESULT_TONES.ok;
  if (result.passed) return RESULT_TONES.warn;
  return RESULT_TONES.critical;
}

export type CheckResultPanelProps = {
  result: CheckResultLike;
  /** Готовая подпись статуса (например, «Зачтено»). */
  statusLabel: string;
  /** Образцовый ответ; без него блок не показывается. */
  model?: string;
  /** Заголовок над найденными пунктами; null/пусто — не показывать. */
  hitsTitle?: string | null;
  /** Суффикс баллов: « балла» в подготовке, пусто в экзамене. */
  scoreSuffix?: string;
  /** Заголовок блока с эталоном. */
  modelTitle?: string;
  className?: string;
};

export function CheckResultPanel({
  result,
  statusLabel,
  model,
  hitsTitle = null,
  scoreSuffix = "",
  modelTitle = "Образцовый ответ",
  className = "",
}: CheckResultPanelProps) {
  const tone = resultTone(result);
  return (
    <div
      role="status"
      aria-live="polite"
      className={("mt-3 rounded-xl border px-3 py-3 text-sm " + tone.box + " " + tone.text + " " + className).trim()}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xl font-extrabold tabular-nums">{result.percent}%</span>
        <span className="font-semibold">{statusLabel}</span>
        <span className="ml-auto text-xs font-semibold opacity-80">
          {result.score}/{result.max}
          {scoreSuffix}
        </span>
      </div>

      {result.hits.length ? (
        <div className="mt-2">
          {hitsTitle ? (
            <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">{hitsTitle}</div>
          ) : null}
          <ul className={hitsTitle ? "mt-1 space-y-1" : "space-y-1"}>
            {result.hits.map((point) => (
              <li key={point.id} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span aria-hidden="true">✓ </span>
                  {point.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.misses.length ? (
        <div className="mt-2">
          <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">Разбор ошибок</div>
          <ul className="mt-1 space-y-1">
            {result.misses.map((point, index) => (
              <li key={point.id} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{result.feedback[index] ?? `${point.label} — не найдено в ответе.`}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {model ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[var(--muted)]">
          <div className="text-[11px] font-bold uppercase tracking-wide">{modelTitle}</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{model}</p>
        </div>
      ) : null}
    </div>
  );
}
