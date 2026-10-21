"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  RotateCcw,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { type BankQuestion } from "@/lib/physiology-colloquium/content";
import {
  type ExamAttempt,
  moduleShortTitle,
} from "@/lib/physiology-colloquium/progress";
import type {
  ColloquiumContentSnapshot,
  ColloquiumSettings,
} from "@/lib/physiology-colloquium/settings";
import { OptionList, ProgressBar, ReadinessRing } from "./ui";

type ExamResult = {
  score: number;
  total: number;
  seconds: number;
  byModule: Record<string, { correct: number; total: number }>;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function isCorrect(question: BankQuestion, selected: number[]): boolean {
  const correct = [...(question.correct ?? [])].sort((a, b) => a - b);
  const chosen = [...selected].sort((a, b) => a - b);
  return chosen.length === correct.length && chosen.every((value, index) => value === correct[index]);
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function ExamView({
  addExam,
  onActiveChange,
  settings,
  content,
  attemptsUsed,
}: {
  addExam: (attempt: ExamAttempt) => void;
  onActiveChange?: (active: boolean) => void;
  settings: ColloquiumSettings;
  content: ColloquiumContentSnapshot;
  attemptsUsed: number;
}) {
  const passRate = settings.exam.pass_percent / 100;
  const defaultModules = useMemo(
    () => content.test_modules.filter((module) => module.id !== "quick").map((module) => module.id),
    [content.test_modules],
  );
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [selectedModules, setSelectedModules] = useState<string[]>(defaultModules);
  const [count, setCount] = useState(settings.exam.default_question_count);
  const [minutes, setMinutes] = useState(settings.exam.default_minutes);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const finishedRef = useRef(false);

  const pool = useMemo(() => {
    const list: BankQuestion[] = [];
    selectedModules.forEach((moduleId) => {
      list.push(...content.tests.filter((question) => question.module === moduleId));
    });
    return list;
  }, [content.tests, selectedModules]);

  const effectiveCount = Math.max(1, Math.min(count, pool.length));
  const answeredCount = questions.filter((question) => (answers[question.id]?.length ?? 0) > 0).length;

  useEffect(() => {
    onActiveChange?.(phase === "running");
  }, [phase, onActiveChange]);

  const finishExam = useCallback(() => {
    if (finishedRef.current || questions.length === 0) return;
    finishedRef.current = true;

    const byModule: Record<string, { correct: number; total: number }> = {};
    let score = 0;
    questions.forEach((question) => {
      const entry = byModule[question.module] ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (isCorrect(question, answers[question.id] ?? [])) {
        entry.correct += 1;
        score += 1;
      }
      byModule[question.module] = entry;
    });

    const attempt: ExamAttempt = {
      id: `exam-${Date.now()}`,
      date: Date.now(),
      score,
      total: questions.length,
      seconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      modules: [...new Set(questions.map((question) => question.module))],
      byModule,
    };
    addExam(attempt);
    setResult({
      score,
      total: questions.length,
      seconds: attempt.seconds,
      byModule,
    });
    setPhase("done");
    setConfirmSubmit(false);
  }, [addExam, answers, questions, startedAt]);

  useEffect(() => {
    if (phase !== "running" || remaining === null) return;
    if (remaining <= 0) {
      finishExam();
      return;
    }
    const timer = window.setTimeout(() => {
      setRemaining((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [phase, remaining, finishExam]);

  const beginExam = (list: BankQuestion[]) => {
    finishedRef.current = false;
    setQuestions(list);
    setAnswers({});
    setIndex(0);
    setStartedAt(Date.now());
    setRemaining(minutes > 0 ? minutes * 60 : null);
    setResult(null);
    setConfirmSubmit(false);
    setPhase("running");
  };

  const startExam = () => {
    const selected = shuffle(pool).slice(0, effectiveCount);
    beginExam(selected);
  };

  const toggleModule = (moduleId: string) => {
    setSelectedModules((previous) =>
      previous.includes(moduleId)
        ? previous.filter((id) => id !== moduleId)
        : [...previous, moduleId],
    );
  };

  const toggleOption = (question: BankQuestion, optionNumber: number) => {
    setAnswers((previous) => {
      const current = previous[question.id] ?? [];
      const multiple = (question.correct?.length ?? 0) > 1;
      const next = multiple
        ? current.includes(optionNumber)
          ? current.filter((number) => number !== optionNumber)
          : [...current, optionNumber]
        : [optionNumber];
      return { ...previous, [question.id]: next };
    });
  };

  const requestFinish = () => {
    if (answeredCount < questions.length && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    finishExam();
  };

  const retryWrong = () => {
    const wrong = questions.filter((question) => !isCorrect(question, answers[question.id] ?? []));
    if (!wrong.length) return;
    beginExam(shuffle(wrong));
  };

  if (phase === "setup") {
    const countOptions = Array.from(
      new Set([
        ...settings.exam.question_counts.filter((value) => value < pool.length),
        settings.exam.default_question_count,
      ]),
    )
      .filter((value) => value > 0 && value <= pool.length)
      .sort((a, b) => a - b);
    const passCount = Math.ceil(effectiveCount * passRate);
    const attemptLimitReached =
      settings.exam.max_attempts > 0 && attemptsUsed >= settings.exam.max_attempts;

    return (
      <div className="space-y-4">
        <section className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600">
            <Target className="h-4 w-4" />
            Экзамен
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Пробный экзамен</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Случайные вопросы из выбранных разделов, таймер и разбор ошибок после завершения. Проходной
            порог — {settings.exam.pass_percent}%.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Разделы</h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {content.test_modules.map((module) => {
                  const active = selectedModules.includes(module.id);
                  const total = content.tests.filter((question) => question.module === module.id).length;
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => toggleModule(module.id)}
                      aria-pressed={active}
                      className={
                        "flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition " +
                        (active
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-indigo-200")
                      }
                    >
                      <span>
                        <span className="block text-sm font-bold text-slate-900">{module.shortTitle}</span>
                        <span className="block text-xs text-slate-500">{total} вопросов</span>
                      </span>
                      <span
                        className={
                          "flex h-6 w-6 items-center justify-center rounded-md border " +
                          (active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-transparent")
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedModules.length === 0 && (
                <p className="mt-2 text-xs font-semibold text-rose-600">Выбери хотя бы один раздел.</p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Количество вопросов</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {countOptions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCount(value)}
                      className={
                        "min-h-10 rounded-lg border px-3 py-2 text-xs font-bold transition " +
                        (effectiveCount === value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50")
                      }
                    >
                      {value}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCount(pool.length)}
                    className={
                      "min-h-10 rounded-lg border px-3 py-2 text-xs font-bold transition " +
                      (effectiveCount === pool.length && pool.length > 0
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50")
                    }
                  >
                    Все · {pool.length}
                  </button>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-bold text-slate-900">Время</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {settings.exam.timer_minutes.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMinutes(value)}
                      className={
                        "min-h-10 rounded-lg border px-3 py-2 text-xs font-bold transition " +
                        (minutes === value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50")
                      }
                    >
                      {value === 0 ? "Без лимита" : `${value} мин`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-700">
              <p className="font-bold text-slate-900">
                {effectiveCount} вопросов · {minutes > 0 ? `${minutes} минут` : "без таймера"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Для зачёта нужно не меньше {passCount} правильных ответов.
              </p>
              {settings.exam.max_attempts > 0 && (
                <p className={"mt-1 text-xs font-semibold " + (attemptLimitReached ? "text-rose-700" : "text-slate-500")}>
                  Попыток: {attemptsUsed} из {settings.exam.max_attempts}
                  {attemptLimitReached ? " · лимит исчерпан" : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={startExam}
              disabled={pool.length === 0 || attemptLimitReached}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Target className="h-4 w-4" />
              Начать экзамен
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (phase === "running" && questions.length > 0) {
    const question = questions[index];
    const answer = answers[question.id] ?? [];
    const answered = answeredCount;
    const isLast = index === questions.length - 1;

    return (
      <div className="space-y-4">
        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-600">Экзамен идёт</div>
              <div className="mt-0.5 text-sm font-bold text-slate-900">
                Вопрос {index + 1} из {questions.length}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold " +
                  (remaining !== null && remaining <= 60
                    ? "bg-rose-50 text-rose-700"
                    : "bg-slate-100 text-slate-700")
                }
                role="timer"
                aria-live="off"
              >
                <Clock className="h-4 w-4" />
                {remaining === null ? "без лимита" : formatTime(remaining)}
              </span>
              <button
                type="button"
                onClick={requestFinish}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
              >
                <Flag className="h-4 w-4" />
                Завершить
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar value={answered} total={questions.length} tone="amber" />
            <span className="shrink-0 text-xs font-bold text-slate-500">
              {answered}/{questions.length}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {questions.map((item, itemIndex) => {
              const isAnswered = (answers[item.id]?.length ?? 0) > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndex(itemIndex)}
                  aria-label={`Перейти к вопросу ${itemIndex + 1}`}
                  aria-current={itemIndex === index}
                  className={
                    "h-8 w-8 rounded-lg text-[11px] font-bold transition " +
                    (itemIndex === index
                      ? "bg-indigo-600 text-white"
                      : isAnswered
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                  }
                >
                  {itemIndex + 1}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-sm font-extrabold text-amber-700">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {moduleShortTitle(question.module, content.test_modules)}
              </p>
              <h2 className="mt-1 text-base font-bold leading-6 text-slate-900 sm:text-lg">{question.question}</h2>
              <OptionList
                question={question}
                selected={answer}
                checked={false}
                onToggle={(optionNumber) => toggleOption(question, optionNumber)}
              />
            </div>
          </div>

          {confirmSubmit && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-bold">
                Без ответа: {questions.length - answeredCount}. Завершить экзамен?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={finishExam}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white"
                >
                  Завершить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSubmit(false)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800"
                >
                  Вернуться к вопросам
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={requestFinish}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                Завершить экзамен
                <Flag className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                Далее
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>

        <p className="px-1 text-xs leading-5 text-slate-500">
          Можно вернуться к любому вопросу через панель номеров. Ответы не показываются до завершения
          экзамена.
        </p>
      </div>
    );
  }

  const percent = result && result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const passed = percent >= Math.round(passRate * 100);
  const wrong = questions.filter((question) => !isCorrect(question, answers[question.id] ?? []));

  return (
    <div className="space-y-4">
      <section className={"overflow-hidden rounded-3xl border p-5 sm:p-6 " + (passed ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40")}>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <ReadinessRing percent={percent} label="результат" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Trophy className="h-4 w-4" />
              Экзамен завершён
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              {result?.score} из {result?.total} · {percent}%
            </h1>
            <p className={"mt-1 text-sm font-bold " + (passed ? "text-emerald-700" : "text-amber-700")}>
              {passed ? "Проходной порог пройден." : `Нужно не меньше ${Math.ceil((result?.total ?? 0) * passRate)} правильных ответов.`}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Время: {formatTime(result?.seconds ?? 0)} · ошибок: {wrong.length}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPhase("setup")}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                <RotateCcw className="h-4 w-4" />
                Новый экзамен
              </button>
              {wrong.length > 0 && (
                <button
                  type="button"
                  onClick={retryWrong}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Повторить ошибки ({wrong.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {result && Object.keys(result.byModule).length > 1 && (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(result.byModule).map(([moduleId, entry]) => (
              <div key={moduleId} className="rounded-xl border border-white bg-white/80 p-3">
                <div className="text-xs font-bold text-slate-500">{moduleShortTitle(moduleId, content.test_modules)}</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">
                  {entry.correct}/{entry.total}
                </div>
                <ProgressBar value={entry.correct} total={entry.total} tone="emerald" className="mt-1" />
              </div>
            ))}
          </div>
        )}
      </section>

      {wrong.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-lg font-extrabold text-slate-900">Разбор ошибок</h2>
            <span className="text-xs font-semibold text-slate-500">{wrong.length} вопросов</span>
          </div>
          {wrong.map((question) => (
            <article key={question.id} className="card overflow-hidden border-rose-100">
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                    <XCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {moduleShortTitle(question.module, content.test_modules)} · вопрос {question.number}
                    </p>
                    <h3 className="mt-1 font-bold text-slate-900">{question.question}</h3>
                    <OptionList
                      question={question}
                      selected={answers[question.id] ?? []}
                      checked
                    />
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-700">
                      <p>
                        <strong>Правильный ответ:</strong> {question.answer}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{question.why}</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="card border-emerald-200 bg-emerald-50/40 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 font-bold text-slate-900">Ни одной ошибки</p>
          <p className="mt-1 text-sm text-slate-600">Можно переходить к следующему разделу или усложнить экзамен.</p>
        </div>
      )}
    </div>
  );
}
