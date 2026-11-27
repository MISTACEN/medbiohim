"use client";

/**
 * Экзаменационная серия диагностикума: строка прогресса с таймером и итог.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк.
 * Разметка, тексты и классы перенесены как есть.
 */

import { RotateCcw } from "lucide-react";
import type {
  DiagnosticumResult,
  DiagnosticumSessionItem,
  DiagnosticumSessionReview,
} from "@/lib/diagnosticum-api";

/** Подписи верных вариантов: эталон приходит только в разборе серии. */
function answerLabels(item: DiagnosticumSessionItem): string[] {
  const labels = new Map<string, string>();
  for (const part of item.question.parts ?? []) {
    for (const option of part.options) labels.set(`${part.id}:${option.id}`, option.label);
  }
  const out: string[] = [];
  for (const [partId, key] of Object.entries(item.answers ?? {})) {
    const names = (key.correct ?? []).map((id) => labels.get(`${partId}:${id}`) ?? id);
    if (names.length) out.push(names.join(", "));
  }
  return out;
}

/**
 * Ход серии. Длина, номер вопроса и баллы живут в клиенте: сервер по-прежнему
 * хранит отдельные попытки, а не сессию.
 */
export type DiagnosticumExamState = {
  total: number;
  index: number;
  scores: number[];
  finished: boolean;
};

type DiagnosticumExamProgressProps = {
  exam: DiagnosticumExamState;
  /** Серия восстановлена после перезагрузки — об этом стоит сказать один раз. */
  resumedNote: boolean;
  /** Время на вопрос в секундах; 0 — без таймера. */
  examTime: number;
  timeLeft: number;
  result: DiagnosticumResult | null;
};

export function DiagnosticumExamProgress({
  exam,
  resumedNote,
  examTime,
  timeLeft,
  result,
}: DiagnosticumExamProgressProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Экзамен · вопрос {Math.min(exam.index, exam.total)} из {exam.total}
        </p>
        {resumedNote ? (
          <p className="text-[11px] text-slate-500">Серия продолжена с того же вопроса.</p>
        ) : null}
      </div>
      {examTime && !exam.finished && !result ? (
        <span
          className={
            "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums " +
            (timeLeft <= 10
              ? "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
              : "bg-slate-100 text-slate-700")
          }
          aria-label="Осталось времени на вопрос"
        >
          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
        </span>
      ) : null}
    </div>
  );
}

type DiagnosticumExamResultProps = {
  exam: DiagnosticumExamState;
  result: DiagnosticumResult;
  /** Разбор всей серии: приходит с сервера после `finish`. */
  review?: DiagnosticumSessionReview | null;
  /** Вопрос закрылся по таймеру — ответ ушёл сам. */
  timedOut: boolean;
  onRestart: () => void;
  onNext: () => void;
};

export function DiagnosticumExamResult({
  exam,
  result,
  review,
  timedOut,
  onRestart,
  onNext,
}: DiagnosticumExamResultProps) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
      {exam.finished ? (
        <>
          <p className="text-sm font-bold text-slate-900">
            Экзамен завершён: без ошибок {exam.scores.filter((score) => score >= 100).length} из {exam.total}
          </p>
          <p className="text-sm text-slate-600">
            Средний балл: {exam.scores.length ? Math.round(exam.scores.reduce((sum, score) => sum + score, 0) / exam.scores.length) : 0}
            {" · "}лучший: {exam.scores.length ? Math.max(...exam.scores) : 0}
          </p>
          {review ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Разбор серии
              </p>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {review.items.map((item) => {
                  const correct = answerLabels(item);
                  return (
                    <li
                      key={item.attempt_id}
                      className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
                    >
                      <span className="font-semibold text-slate-800">
                        {item.index + 1}.{" "}
                        {item.correct ? "верно" : item.answered ? "ошибка" : "пропуск"} · {item.score} б.
                      </span>
                      {!item.correct && correct.length ? (
                        <span className="block text-slate-600">Верно: {correct.join(" · ")}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-slate-500">
                Ошибки уже в очереди повторения: их можно разобрать в режиме тренировки.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Ошибки уже в очереди повторения, разбор и эталоны — в режиме тренировки.
            </p>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <RotateCcw className="h-4 w-4" /> Новый экзамен
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-slate-900">Ответ принят · {result.score} баллов</p>
          {timedOut ? (
            <p className="text-xs font-semibold text-[var(--status-warn-fg)]">
              Время на вопрос вышло — ответ отправлен автоматически.
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            Вопрос {exam.index} из {exam.total}. Разбор и эталон — только после последнего вопроса.
          </p>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {exam.index >= exam.total ? "Показать итог" : "Следующий вопрос"}
          </button>
        </>
      )}
    </div>
  );
}