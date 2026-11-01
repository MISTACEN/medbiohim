"use client";

/**
 * Задание 5 — «Подготовка к самостоятельной»: только открытые вопросы.
 *
 * Студент пишет ответ текстом, проверка идёт локально по пунктам эталона
 * (`checkSelfWorkAnswer`), после проверки видны найденные/потерянные пункты,
 * разбор ошибок и образцовый ответ на «5». Прогресс («решено» и «повторить
 * ошибочные») хранится в selfWorkProgress и переживает перезагрузку.
 *
 * Компонент автономен: контент приходит пропом `topic` (или берётся из реестра
 * по `lectureId`), поэтому пустой контент не ломает рендер.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ListChecks, RotateCcw, Target, TriangleAlert } from "lucide-react";
import type { SelfWorkCheckResult, SelfWorkOpenQuestion, SelfWorkTopic } from "@/lib/histology/selfWorkTypes";
import { checkSelfWorkAnswer, selfWorkResultLabel } from "@/lib/histology/openAnswerCheck";
import {
  SELF_WORK_PROGRESS_EVENT,
  mistakeQuestionIds,
  readSelfWorkProgress,
  recordSelfWorkResult,
  resetSelfWorkQuestion,
  selfWorkEntry,
  type SelfWorkProgress,
} from "@/lib/histology/selfWorkProgress";
import { selfWorkTopicForLecture } from "@/lib/histology/selfWorkTopics";

export type OpenAnswerPracticeProps = {
  lectureId?: string;
  /** Готовый контент темы; без него берётся selfWorkTopicForLecture(lectureId). */
  topic?: SelfWorkTopic | null;
};

/** Статусные токены — те же, что в LectureRenderer/MiniQuizBlock. */
const RESULT_TONES = {
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

function toneOf(result: SelfWorkCheckResult) {
  if (result.complete) return RESULT_TONES.ok;
  if (result.passed) return RESULT_TONES.warn;
  return RESULT_TONES.critical;
}

function answerFieldId(questionId: string): string {
  return `selfwork-answer-${questionId}`;
}

/** Группировка вопросов по подтеме с сохранением порядка контента. */
function groupByTopic(questions: SelfWorkOpenQuestion[]): Array<[string, SelfWorkOpenQuestion[]]> {
  const groups = new Map<string, SelfWorkOpenQuestion[]>();
  for (const question of questions) {
    const key = String(question.topic || "Вопросы").trim() || "Вопросы";
    const bucket = groups.get(key);
    if (bucket) bucket.push(question);
    else groups.set(key, [question]);
  }
  return [...groups.entries()];
}

/** Результат проверки: процент, статус, найденные и потерянные пункты, эталон. */
function CheckResultPanel({ result, model }: { result: SelfWorkCheckResult; model?: string }) {
  const tone = toneOf(result);
  return (
    <div
      role="status"
      aria-live="polite"
      className={"mt-3 rounded-xl border px-3 py-3 text-sm " + tone.box + " " + tone.text}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xl font-extrabold tabular-nums">{result.percent}%</span>
        <span className="font-semibold">{selfWorkResultLabel(result)}</span>
        <span className="ml-auto text-xs font-semibold opacity-80">
          {result.score}/{result.max} балла
        </span>
      </div>

      {result.hits.length ? (
        <div className="mt-2">
          <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">Найденные пункты</div>
          <ul className="mt-1 space-y-1">
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
          <div className="text-[11px] font-bold uppercase tracking-wide">Образцовый ответ на «5»</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{model}</p>
        </div>
      ) : null}
    </div>
  );
}

export function OpenAnswerPractice({ lectureId, topic }: OpenAnswerPracticeProps) {
  const resolved = topic ?? selfWorkTopicForLecture(lectureId);
  const topicId = String(lectureId || resolved?.lectureId || "").trim();
  const questions = useMemo(
    () => (Array.isArray(resolved?.openQuestions) ? resolved.openQuestions.filter(Boolean) : []),
    [resolved],
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, SelfWorkCheckResult>>({});
  const [progress, setProgress] = useState<SelfWorkProgress>({});
  const [onlyMistakes, setOnlyMistakes] = useState(false);

  const syncProgress = useCallback(() => setProgress(readSelfWorkProgress()), []);

  useEffect(() => {
    syncProgress();
    if (typeof window === "undefined") return;
    window.addEventListener(SELF_WORK_PROGRESS_EVENT, syncProgress);
    return () => window.removeEventListener(SELF_WORK_PROGRESS_EVENT, syncProgress);
  }, [syncProgress]);

  const entry = selfWorkEntry(topicId, progress);
  const mistakes = mistakeQuestionIds(topicId, progress);
  const solvedCount = questions.filter((question) => entry.passed.includes(question.id)).length;
  const mistakeCount = questions.filter((question) => mistakes.includes(question.id)).length;
  const visibleQuestions = onlyMistakes
    ? questions.filter((question) => mistakes.includes(question.id))
    : questions;
  const groups = groupByTopic(visibleQuestions);

  function check(question: SelfWorkOpenQuestion) {
    const answer = String(answers[question.id] ?? "");
    if (!answer.trim() || results[question.id]) return;
    const result = checkSelfWorkAnswer(answer, question.keyPoints ?? []);
    setResults((current) => ({ ...current, [question.id]: result }));
    recordSelfWorkResult(topicId, question.id, { complete: result.complete, passed: result.passed });
    syncProgress();
  }

  function repeat(question: SelfWorkOpenQuestion) {
    setAnswers((current) => ({ ...current, [question.id]: "" }));
    setResults((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });
    resetSelfWorkQuestion(topicId, question.id);
    syncProgress();
  }

  function focusNext(question: SelfWorkOpenQuestion) {
    const index = visibleQuestions.findIndex((item) => item.id === question.id);
    if (index < 0) return;
    const next = visibleQuestions[index + 1] ?? visibleQuestions[0];
    if (!next) return;
    const field = typeof document === "undefined" ? null : document.getElementById(answerFieldId(next.id));
    if (field && typeof (field as HTMLTextAreaElement).focus === "function") {
      (field as HTMLTextAreaElement).focus();
      const scroll = (field as HTMLElement).scrollIntoView;
      if (typeof scroll === "function") scroll.call(field, { block: "center" });
    }
  }

  if (!resolved || questions.length === 0) {
    return (
      <section className="my-6 rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">
        Открытые вопросы для этой лекции ещё не заполнены. Задание 5 появится, когда контент темы будет готов.
      </section>
    );
  }

  return (
    <section className="my-7 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
        Задание 5 · Открытые вопросы
      </div>
      <h3 className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">{resolved.title}</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Вариантов ответа нет: напишите ответ своими словами. Проверка идёт по пунктам эталона, после неё виден разбор
        ошибок и образцовый ответ на «5».
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          Решено {solvedCount} из {questions.length}
        </span>
        {onlyMistakes ? (
          <button
            type="button"
            onClick={() => setOnlyMistakes(false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            Все вопросы
          </button>
        ) : (
          <button
            type="button"
            disabled={mistakeCount === 0}
            onClick={() => setOnlyMistakes(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-3 py-1.5 text-xs font-bold text-[var(--status-warn-fg)] transition disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Повторить ошибочные ({mistakeCount})
          </button>
        )}
      </div>

      {onlyMistakes && visibleQuestions.length === 0 ? (
        <div className="mt-3 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">
          Ошибочных вопросов нет — все проверенные ответы полные.
        </div>
      ) : null}

      <div className="mt-4 space-y-5">
        {groups.map(([groupTitle, items]) => (
          <div key={groupTitle} className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{groupTitle}</h4>
            {items.map((question) => {
              const answer = String(answers[question.id] ?? "");
              const result = results[question.id];
              const solved = entry.passed.includes(question.id);
              return (
                <article
                  key={question.id}
                  data-testid={`open-question-${question.id}`}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h5 className="text-sm font-bold leading-6 text-slate-900 dark:text-slate-100">{question.prompt}</h5>
                    {solved ? <span className="badge-success shrink-0">решено</span> : null}
                  </div>
                  {question.source ? (
                    <div className="mt-1 text-xs text-[var(--muted)]">Источник: {question.source}</div>
                  ) : null}

                  <label
                    htmlFor={answerFieldId(question.id)}
                    className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]"
                  >
                    Письменный ответ
                  </label>
                  <textarea
                    id={answerFieldId(question.id)}
                    value={answer}
                    rows={5}
                    disabled={Boolean(result)}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                    }
                    placeholder="Напишите ответ своими словами…"
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--primary)] disabled:opacity-70 dark:bg-slate-900"
                  />

                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={!answer.trim() || Boolean(result)}
                      onClick={() => check(question)}
                      className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
                    >
                      Проверить
                    </button>
                  </div>

                  {result ? (
                    <>
                      <CheckResultPanel result={result} model={question.model} />
                      {question.explanation ? (
                        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{question.explanation}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => repeat(question)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Повторить
                        </button>
                        <button
                          type="button"
                          onClick={() => focusNext(question)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
                        >
                          Следующий вопрос
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export default OpenAnswerPractice;
