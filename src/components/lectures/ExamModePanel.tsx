"use client";

/**
 * Задание 6 — «Режим экзамена»: три задания как на реальной самостоятельной.
 *
 *  1 — осевые органы по варианту (письменный ответ);
 *  2 — опознать электронограмму и подписать структуры;
 *  3 — развёрнутый теоретический вопрос.
 *
 * Плюс описание клетки по памятке (открывает «4») и итоговая оценка через
 * computeExamGrade (шкала преподавателя: 3/4/5, ниже базы — «не зачтено»).
 * Компонент автономен: контент приходит пропом `topic` (или из реестра по
 * `lectureId`), пустой контент не ломает рендер.
 */

import { useState } from "react";
import { ArrowRight, CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import type {
  SelfWorkCellMemo,
  SelfWorkCheckResult,
  SelfWorkExamScale,
  SelfWorkKeyPoint,
  SelfWorkTopic,
} from "@/lib/histology/selfWorkTypes";
import { checkSelfWorkAnswer, checkSelfWorkLabels, selfWorkResultLabel, SELF_WORK_PASS_RATIO } from "@/lib/histology/openAnswerCheck";
import { computeExamGrade, examGradeLabel, type ExamGradeResult } from "@/lib/histology/examGrade";
import { selfWorkTopicForLecture } from "@/lib/histology/selfWorkTopics";

export type ExamModePanelProps = {
  lectureId?: string;
  /** Готовый контент темы; без него берётся selfWorkTopicForLecture(lectureId). */
  topic?: SelfWorkTopic | null;
};

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

/** Слова-инструкции из памятки не должны требоваться в ответе студента. */
const MEMO_STOP_WORDS = new Set([
  "описать",
  "опишите",
  "назвать",
  "назовите",
  "указать",
  "укажите",
  "перечислить",
  "перечислите",
  "отметить",
  "отметьте",
  "рассказать",
  "расскажите",
  "например",
  "который",
  "которая",
  "которые",
  "также",
  "нужно",
  "надо",
  "может",
  "будет",
  "будут",
  "этот",
  "эта",
  "эти",
  "того",
  "чтобы",
  "если",
  "или",
  "для",
  "при",
  "чем",
  "как",
  "так",
  "что",
]);

/** Значимые слова шага памятки: из них собираются принимаемые формулировки. */
function significantWords(text: string): string[] {
  return Array.from(
    new Set(
      String(text ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
        .split(/\s+/)
        .map((word) => word.replace(/^-+|-+$/g, ""))
        .filter((word) => word.length >= 4 && !MEMO_STOP_WORDS.has(word)),
    ),
  );
}

/** Пункты проверки описания клетки по памятке (шаги memo.steps). */
function memoStepKeyPoints(memo: SelfWorkCellMemo | null | undefined): SelfWorkKeyPoint[] {
  return (memo?.steps ?? []).map((step, index) => {
    const words = significantWords(`${step.title} ${step.hint}`);
    return {
      id: `memo-step-${index + 1}`,
      label: step.title || `Шаг ${index + 1}`,
      anyOf: words.length ? words : [step.title || `Шаг ${index + 1}`],
    };
  });
}

/** Свод результата по нескольким открытым вопросам (задание 4). */
function combineResults(list: SelfWorkCheckResult[]): SelfWorkCheckResult {
  const score = list.reduce((sum, r) => sum + r.score, 0);
  const max = list.reduce((sum, r) => sum + r.max, 0);
  return {
    total: list.reduce((sum, r) => sum + r.total, 0),
    score,
    max,
    percent: max > 0 ? Math.round((score / max) * 100) : 0,
    hits: list.flatMap((r) => r.hits),
    misses: list.flatMap((r) => r.misses),
    feedback: list.flatMap((r) => r.feedback),
    passed: max > 0 && score / max >= SELF_WORK_PASS_RATIO,
    complete: max > 0 && score === max,
  };
}

/** Пункт «определить половую клетку»: название берём из подписи электронограммы.
 *  Подпись в интерфейсе скрыта до проверки, иначе опознание теряет смысл. */
function electronogramIdentificationPoint(caption: string): SelfWorkKeyPoint {
  const word = String(caption || "")
    .replace(/^электронограмма[.\s—-]*/i, "")
    .replace(/\s*[—-].*$/, "")
    .trim();
  const variants = word ? [word, word.toLowerCase()] : ["половая клетка"];
  return { id: "identify", label: "Определена половая клетка", anyOf: variants };
}

/** Блок результата проверки: процент, статус, найденные/потерянные пункты, эталон. */
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
          {result.score}/{result.max}
        </span>
      </div>

      {result.hits.length ? (
        <ul className="mt-2 space-y-1">
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
          <div className="text-[11px] font-bold uppercase tracking-wide">Образцовый ответ</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{model}</p>
        </div>
      ) : null}
    </div>
  );
}

type WrittenTaskProps = {
  testId: string;
  heading: string;
  fieldId: string;
  prompt: string;
  answer: string;
  result?: SelfWorkCheckResult;
  model?: string;
  explanation?: string;
  onAnswer: (value: string) => void;
  onCheck: () => void;
  onRepeat: () => void;
};

/** Письменное задание экзамена: textarea, проверка, разбор, эталон, повтор. */
function WrittenTask({
  testId,
  heading,
  fieldId,
  prompt,
  answer,
  result,
  model,
  explanation,
  onAnswer,
  onCheck,
  onRepeat,
}: WrittenTaskProps) {
  return (
    <section data-testid={testId} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">{heading}</div>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">{prompt}</p>

      <label htmlFor={fieldId} className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
        Письменный ответ
      </label>
      <textarea
        id={fieldId}
        value={answer}
        rows={5}
        disabled={Boolean(result)}
        onChange={(event) => onAnswer(event.target.value)}
        placeholder="Напишите ответ своими словами…"
        className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--primary)] disabled:opacity-70 dark:bg-slate-900"
      />

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={!answer.trim() || Boolean(result)}
          onClick={onCheck}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
        >
          Проверить
        </button>
      </div>

      {result ? (
        <>
          <CheckResultPanel result={result} model={model} />
          {explanation ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{explanation}</p> : null}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onRepeat}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Повторить
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function GradeBadge({ grade }: { grade: ExamGradeResult }) {
  const tone =
    grade.grade === 0 ? RESULT_TONES.critical : grade.grade >= 4 ? RESULT_TONES.ok : RESULT_TONES.warn;
  return (
    <span
      data-testid="exam-grade-badge"
      className={
        "inline-flex h-16 min-w-16 items-center justify-center rounded-2xl border px-4 text-3xl font-black " +
        tone.box +
        " " +
        tone.text
      }
    >
      {examGradeLabel(grade)}
    </span>
  );
}

function ScaleTable({ scale }: { scale: SelfWorkExamScale[] }) {
  if (!scale.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Шкала оценок</div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--status-warn-bg)] text-left text-[var(--status-warn-fg)]">
            <th className="border border-[var(--border)] px-3 py-2">Оценка</th>
            <th className="border border-[var(--border)] px-3 py-2">Когда ставится</th>
            <th className="border border-[var(--border)] px-3 py-2">Что нужно</th>
          </tr>
        </thead>
        <tbody>
          {scale.map((row) => (
            <tr key={row.grade}>
              <td className="border border-[var(--border)] px-3 py-2 text-center text-base font-extrabold">{row.grade}</td>
              <td className="border border-[var(--border)] px-3 py-2 font-semibold">{row.when}</td>
              <td className="border border-[var(--border)] px-3 py-2 text-[var(--muted)]">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExamModePanel({ lectureId, topic }: ExamModePanelProps) {
  const resolved = topic ?? selfWorkTopicForLecture(lectureId);
  const exam = resolved?.exam ?? null;
  const variants = Array.isArray(exam?.variants) ? exam.variants : [];
  const electronograms = Array.isArray(exam?.electronograms) ? exam.electronograms : [];
  const memo = exam?.memo ?? null;
  const openType = exam?.openType ?? null;
  const scale = Array.isArray(exam?.scale) ? exam.scale : [];

  const [variantIndex, setVariantIndex] = useState(0);
  const [electronogramIndex, setElectronogramIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, SelfWorkCheckResult>>({});

  const variant = variants[variantIndex] ?? variants[0] ?? null;
  const electronogram = electronograms[electronogramIndex] ?? electronograms[0] ?? null;
  const activeVariantIndex = variant ? Math.max(0, variants.indexOf(variant)) : 0;
  const activeElectronogramIndex = electronogram ? Math.max(0, electronograms.indexOf(electronogram)) : 0;

  const task1Key = variant ? `${variant.id}:task1` : "";
  const task3Key = variant ? `${variant.id}:task3` : "";
  const detailKey = variant ? `${variant.id}:detail` : "";
  const task2Key = electronogram ? `ecogram:${electronogram.id}` : "";
  const memoKey = "memo";

  /** Задание 4: вопросы открытого типа из банка темы (в реальной самостоятельной
   *  именно они идут после трёх заданий — описания клетки по памятке там нет). */
  const openTypeQuestions = openType
    ? (resolved?.openQuestions ?? []).filter((question) => openType.questionIds.includes(question.id))
    : [];
  const openTypeKeys = openTypeQuestions.map((question) => `open:${question.id}`);
  const openTypeResults = openTypeKeys.map((key) => results[key]).filter(Boolean) as SelfWorkCheckResult[];
  const openTypeResult =
    openTypeQuestions.length > 0 && openTypeResults.length === openTypeQuestions.length
      ? combineResults(openTypeResults)
      : null;

  /** Углублённый уровень задания 3 «на 5»; без detailKeyPoints шаг не показываем. */
  const detailPoints = Array.isArray(variant?.task3.detailKeyPoints)
    ? variant.task3.detailKeyPoints.filter(Boolean)
    : [];
  const hasDetail = detailPoints.length > 0;

  const task1 = task1Key ? results[task1Key] : undefined;
  const task2 = task2Key ? results[task2Key] : undefined;
  const task3 = task3Key ? results[task3Key] : undefined;
  const detail = hasDetail ? (detailKey ? results[detailKey] ?? null : null) : (task3 ?? null);
  const memoResult = results[memoKey] ?? null;
  const grade =
    task1 && task2 && task3
      ? computeExamGrade({
          task1,
          task2,
          task3,
          // Ключ openType в вызове означает «четвёртое задание — открытые вопросы»,
          // поэтому для тем со старой памяткой передаём memo, а не openType: null.
          ...(openType ? { openType: openTypeResult } : { memo: memoResult }),
          theoryDetail: detail,
        })
      : null;

  const missing: string[] = [];
  if (variant && !task1) missing.push("Задание 1 (осевые органы)");
  if (electronogram && !task2) missing.push("Задание 2 (электронограмма)");
  if (variant && !task3) missing.push("Задание 3 (теория)");

  const memoPoints = memoStepKeyPoints(memo);

  function setAnswer(key: string, value: string) {
    if (!key) return;
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function checkOpen(key: string, answer: string, keyPoints: SelfWorkKeyPoint[]) {
    if (!key || !String(answer).trim() || results[key]) return;
    setResults((current) => ({ ...current, [key]: checkSelfWorkAnswer(answer, keyPoints ?? []) }));
  }

  function checkLabels() {
    if (!electronogram || !task2Key) return;
    const answer = String(answers[task2Key] ?? "");
    if (!answer.trim() || results[task2Key]) return;
    // Задание 2 — «определить электронограмму И подписать структуры», поэтому
    // кроме подписей проверяем название клетки (до проверки подпись скрыта).
    const labelPoints: SelfWorkKeyPoint[] = (electronogram.labels ?? []).map((label) => ({
      id: `label-${label.n}`,
      label: `${label.n}. ${label.label}`,
      anyOf: label.anyOf?.length ? label.anyOf : [label.label],
    }));
    const points = [electronogramIdentificationPoint(electronogram.caption), ...labelPoints];
    setResults((current) => ({ ...current, [task2Key]: checkSelfWorkAnswer(answer, points) }));
  }

  function repeat(key: string) {
    if (!key) return;
    setAnswers((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setResults((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** «Пройти заново» — сброс ответов и результатов текущего варианта и оценки. */
  function resetRun() {
    for (const key of [task1Key, task3Key, detailKey, task2Key, memoKey, ...openTypeKeys]) repeat(key);
  }

  if (!exam || variants.length === 0) {
    return (
      <section className="my-6 rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">
        Режим экзамена для этой лекции ещё не заполнен. Задание 6 появится, когда контент темы будет готов.
      </section>
    );
  }

  return (
    <section className="my-7 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
        Задание 6 · Режим экзамена
      </div>
      <h3 className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">{exam.title}</h3>
      {exam.intro ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{exam.intro}</p> : null}

      <div className="mt-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Вариант самостоятельной</div>
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Выбор варианта">
          {variants.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={index === activeVariantIndex}
              onClick={() => setVariantIndex(index)}
              className={
                "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (index === activeVariantIndex
                  ? "border-indigo-500 bg-indigo-100 text-indigo-900"
                  : "border-[var(--border)] bg-white text-slate-600 hover:border-indigo-300 dark:bg-slate-900 dark:text-slate-300")
              }
            >
              Вариант {index + 1}
            </button>
          ))}
        </div>
        {variant ? (
          <div className="mt-2 text-sm">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{variant.title}</span>
            {variant.focus ? <span className="text-[var(--muted)]"> · {variant.focus}</span> : null}
          </div>
        ) : null}
      </div>

      {variant ? (
        <div className="mt-4 space-y-4">
          <WrittenTask
            testId="exam-task1"
            heading="Задание 1 · Осевые органы"
            fieldId={`exam-task1-${variant.id}`}
            prompt={variant.task1.prompt}
            answer={String(answers[task1Key] ?? "")}
            result={task1}
            model={variant.task1.model}
            explanation={variant.task1.explanation}
            onAnswer={(value) => setAnswer(task1Key, value)}
            onCheck={() => checkOpen(task1Key, answers[task1Key] ?? "", variant.task1.keyPoints ?? [])}
            onRepeat={() => repeat(task1Key)}
          />

          <section data-testid="exam-task2" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
              Задание 2 · Электронограмма
            </div>

            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Выбор электронограммы">
              {electronograms.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={index === activeElectronogramIndex}
                  onClick={() => setElectronogramIndex(index)}
                  className={
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                    (index === activeElectronogramIndex
                      ? "border-indigo-500 bg-indigo-100 text-indigo-900"
                      : "border-[var(--border)] bg-white text-slate-600 hover:border-indigo-300 dark:bg-slate-900 dark:text-slate-300")
                  }
                >
                  Электронограмма {index + 1}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Определите, какая половая клетка изображена, и подпишите структуры по номерам — название клетки откроется после проверки.
            </p>

            {electronogram ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <figure className="min-w-0">
                  {electronogram.imageUrl ? (
                    <img
                      src={electronogram.imageUrl}
                      alt="Электронограмма половой клетки"
                      data-testid="exam-task2-image"
                      className="mx-auto max-h-72 w-full rounded-xl border border-[var(--border)] bg-slate-50 object-contain"
                    />
                  ) : (
                    <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm text-[var(--muted)]">
                      Изображение электронограммы ещё не приложено
                    </div>
                  )}
                  <figcaption className="mt-1 text-xs text-[var(--muted)]">
                    {task2 ? electronogram.caption : `Электронограмма №${activeElectronogramIndex + 1} — определите клетку`}
                  </figcaption>
                </figure>

                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
                    {electronogram.prompt}
                  </p>
                  <label
                    htmlFor={`exam-task2-${electronogram.id}`}
                    className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]"
                  >
                    Подписи структур (по номерам)
                  </label>
                  <textarea
                    id={`exam-task2-${electronogram.id}`}
                    value={String(answers[task2Key] ?? "")}
                    rows={5}
                    disabled={Boolean(task2)}
                    onChange={(event) => setAnswer(task2Key, event.target.value)}
                    placeholder="1 — …; 2 — …"
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--primary)] disabled:opacity-70 dark:bg-slate-900"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={!String(answers[task2Key] ?? "").trim() || Boolean(task2)}
                      onClick={checkLabels}
                      className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
                    >
                      Проверить
                    </button>
                  </div>

                  {task2 ? (
                    <>
                      <CheckResultPanel result={task2} model={electronogram.model} />
                      {electronogram.explanation ? (
                        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{electronogram.explanation}</p>
                      ) : null}
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => repeat(task2Key)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Повторить
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">Электронограммы для этой темы ещё не заполнены.</p>
            )}
          </section>

          <WrittenTask
            testId="exam-task3"
            heading="Задание 3 · Развёрнутая теория"
            fieldId={`exam-task3-${variant.id}`}
            prompt={variant.task3.prompt}
            answer={String(answers[task3Key] ?? "")}
            result={task3}
            model={variant.task3.model}
            explanation={variant.task3.explanation}
            onAnswer={(value) => setAnswer(task3Key, value)}
            onCheck={() => checkOpen(task3Key, answers[task3Key] ?? "", variant.task3.keyPoints ?? [])}
            onRepeat={() => repeat(task3Key)}
          />

          {hasDetail && task3 ? (
            <WrittenTask
              testId="exam-task3-detail"
              heading="Дополнительно · Максимально подробно (на «5»)"
              fieldId={`exam-task3-detail-${variant.id}`}
              prompt={`${variant.task3.prompt} Раскройте вопрос максимально подробно — нужны дополнительные пункты эталона.`}
              answer={String(answers[detailKey] ?? "")}
              result={detailKey ? results[detailKey] : undefined}
              model={variant.task3.detailModel ?? variant.task3.model}
              onAnswer={(value) => setAnswer(detailKey, value)}
              onCheck={() => checkOpen(detailKey, answers[detailKey] ?? "", detailPoints)}
              onRepeat={() => repeat(detailKey)}
            />
          ) : null}
        </div>
      ) : null}

      {openType ? (
        <section data-testid="exam-open" className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
            {openType.title} · открывает «4»
          </div>
          {openType.intro ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{openType.intro}</p> : null}

          {openTypeQuestions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--status-warn-fg)]">Вопросы открытого типа для этой темы не заполнены.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {openTypeQuestions.map((question) => {
                const key = `open:${question.id}`;
                const result = results[key];
                return (
                  <li key={question.id} data-testid={key} className="rounded-xl border border-[var(--border)] p-3">
                    <p className="text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">{question.prompt}</p>
                    <label
                      htmlFor={`exam-${key}`}
                      className="mt-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]"
                    >
                      Письменный ответ
                    </label>
                    <textarea
                      id={`exam-${key}`}
                      value={String(answers[key] ?? "")}
                      rows={3}
                      disabled={Boolean(result)}
                      onChange={(event) => setAnswer(key, event.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--primary)] disabled:opacity-70 dark:bg-slate-900"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      {result ? (
                        <>
                          <span className="mr-auto self-center text-xs font-semibold text-[var(--muted)]">
                            {result.complete ? "✓ зачтено" : `разобрано ${result.score}/${result.max}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => repeat(key)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            Повторить
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={!String(answers[key] ?? "").trim()}
                          onClick={() => checkOpen(key, answers[key] ?? "", question.keyPoints ?? [])}
                          className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
                        >
                          Проверить
                        </button>
                      )}
                    </div>
                    {result ? <CheckResultPanel result={result} model={question.model} /> : null}
                  </li>
                );
              })}
            </ol>
          )}

          {openTypeResult ? (
            <div className="mt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Итог по заданию 4</div>
              <CheckResultPanel result={openTypeResult} />
            </div>
          ) : null}
        </section>
      ) : null}

      {!openType && memo ? (
        <section data-testid="exam-memo" className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
            Описать клетку по памятке · открывает «4»
          </div>
          <h4 className="mt-1 text-sm font-extrabold text-slate-900 dark:text-slate-100">{memo.title}</h4>

          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {memo.steps.map((step, index) => (
              <li key={`${step.title}-${index}`}>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{step.title}</span>
                {step.hint ? <span className="text-[var(--muted)]"> — {step.hint}</span> : null}
              </li>
            ))}
          </ol>

          <label htmlFor="exam-memo-answer" className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Описание клетки по памятке
          </label>
          <textarea
            id="exam-memo-answer"
            value={String(answers[memoKey] ?? "")}
            rows={5}
            disabled={Boolean(memoResult)}
            onChange={(event) => setAnswer(memoKey, event.target.value)}
            placeholder="Название и окраска → строение → источник развития → функции…"
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--primary)] disabled:opacity-70 dark:bg-slate-900"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={!String(answers[memoKey] ?? "").trim() || Boolean(memoResult)}
              onClick={() => checkOpen(memoKey, answers[memoKey] ?? "", memoPoints)}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
            >
              Проверить описание
            </button>
          </div>

          {memoResult ? (
            <>
              <CheckResultPanel result={memoResult} />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => repeat(memoKey)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Повторить
                </button>
              </div>
            </>
          ) : null}

          {memo.samples.length ? (
            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Образцы описания</div>
              <div className="mt-1 space-y-2">
                {memo.samples.map((sample) => (
                  <details
                    key={sample.id}
                    className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 dark:bg-slate-900"
                  >
                    <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {sample.title}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{sample.text}</p>
                  </details>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section data-testid="exam-grade" className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">Итоговая оценка</div>

        {grade ? (
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-3">
              <GradeBadge grade={grade} />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{grade.label}</div>
                <div className="text-xs text-[var(--muted)]">
                  {grade.baseComplete ? "База выполнена: три задания зачтены." : "База не выполнена."}
                </div>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              {grade.notes.map((note, index) => (
                <li key={index} className="flex items-start gap-2">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-3 py-2 text-sm text-[var(--status-warn-fg)]">
            До итоговой оценки не хватает: {missing.length ? missing.join(", ") : "проверить задания"}. После проверки
            всех трёх заданий появится оценка по шкале.
          </p>
        )}

        <ScaleTable scale={scale} />

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={resetRun}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 dark:bg-slate-900 dark:text-slate-200"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Пройти заново
          </button>
        </div>
      </section>
    </section>
  );
}

export default ExamModePanel;
