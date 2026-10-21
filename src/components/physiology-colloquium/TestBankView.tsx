"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  RotateCcw,
  Search,
  Shuffle,
  XCircle,
} from "lucide-react";
import { type BankQuestion } from "@/lib/physiology-colloquium/content";
import {
  type ColloquiumProgress,
  testKey,
} from "@/lib/physiology-colloquium/progress";
import type { ColloquiumContentSnapshot } from "@/lib/physiology-colloquium/settings";
import { OptionList, ProgressBar } from "./ui";

function isAnswerCorrect(question: BankQuestion, selected: number[]): boolean {
  const correct = [...(question.correct ?? [])].sort((a, b) => a - b);
  const chosen = [...selected].sort((a, b) => a - b);
  return chosen.length === correct.length && chosen.every((value, index) => value === correct[index]);
}

export function TestBankView({
  progress,
  markTest,
  initialModule,
  initialOnlyErrors = false,
  content,
}: {
  progress: ColloquiumProgress;
  markTest: (question: BankQuestion, correct: boolean) => void;
  initialModule?: string;
  initialOnlyErrors?: boolean;
  content: ColloquiumContentSnapshot;
}) {
  const [moduleId, setModuleId] = useState(initialModule ?? content.test_modules[0]?.id ?? "cell");
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [onlyErrors, setOnlyErrors] = useState(initialOnlyErrors);
  const [shuffled, setShuffled] = useState<number[] | null>(null);
  const [query, setQuery] = useState("");

  const moduleQuestions = useMemo(
    () => content.tests.filter((question) => question.module === moduleId),
    [content.tests, moduleId],
  );
  const attempted = moduleQuestions.filter((question) => progress.tests[testKey(question)]);
  const correct = moduleQuestions.filter((question) => progress.tests[testKey(question)]?.correct);
  const wrong = moduleQuestions.filter((question) => {
    const result = progress.tests[testKey(question)];
    return result && !result.correct;
  });

  const resetLocal = () => {
    setSelected({});
    setChecked({});
    setShuffled(null);
  };

  const changeModule = (nextModule: string) => {
    setModuleId(nextModule);
    setOnlyErrors(false);
    resetLocal();
  };

  const displayed = useMemo(() => {
    const search = query.trim().toLowerCase();
    let list = onlyErrors ? wrong : moduleQuestions;
    if (search) {
      list = list.filter((question) =>
        `${question.question} ${question.answer}`.toLowerCase().includes(search),
      );
    }
    if (shuffled) {
      const byId = new Map(list.map((question) => [question.id, question]));
      list = shuffled.flatMap((id) => {
        const question = byId.get(id);
        return question ? [question] : [];
      });
    }
    return list;
  }, [moduleQuestions, onlyErrors, wrong, query, shuffled]);

  const checkQuestion = (question: BankQuestion) => {
    const answer = selected[question.id] ?? [];
    if (!answer.length) return;
    const result = isAnswerCorrect(question, answer);
    setChecked((previous) => ({ ...previous, [question.id]: true }));
    markTest(question, result);
  };

  const toggleOption = (question: BankQuestion, optionNumber: number) => {
    if (checked[question.id]) return;
    setSelected((previous) => {
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

  const toggleShuffle = () => {
    if (shuffled) {
      setShuffled(null);
      return;
    }
    const ids = displayed.map((question) => question.id);
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [ids[index], ids[swap]] = [ids[swap], ids[index]];
    }
    setShuffled(ids);
  };

  const currentSessionAnswered = moduleQuestions.filter(
    (question) => checked[question.id] && (selected[question.id]?.length ?? 0) > 0,
  ).length;
  const currentSessionCorrect = moduleQuestions.filter(
    (question) =>
      checked[question.id] &&
      isAnswerCorrect(question, selected[question.id] ?? []),
  ).length;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-600">
              <ListChecks className="h-4 w-4" />
              Тренировка
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Банк тестов</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Отвечай на вопросы по одному и сразу проверяй себя. Ошибки сохраняются — их можно отфильтровать
              и пройти повторно.
            </p>
          </div>
          <div className="min-w-48 text-right">
            <div className="text-sm font-extrabold text-slate-900">
              {correct.length} / {moduleQuestions.length}
            </div>
            <div className="text-xs text-slate-500">верно в разделе</div>
            <ProgressBar value={correct.length} total={moduleQuestions.length} tone="violet" className="mt-2" />
            <div className="mt-1 text-[11px] text-slate-400">
              пройдено {attempted.length} · ошибок {wrong.length}
            </div>
          </div>
        </div>

        <div className="mobile-scroll-x mt-4 flex gap-2 overflow-x-auto pb-1">
          {content.test_modules.map((module) => {
            const questions = content.tests.filter((question) => question.module === module.id);
            const moduleCorrect = questions.filter(
              (question) => progress.tests[testKey(question)]?.correct,
            ).length;
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => changeModule(module.id)}
                className={
                  "shrink-0 rounded-xl border px-3 py-2 text-left text-xs font-bold transition " +
                  (moduleId === module.id
                    ? "border-violet-500 bg-violet-50 text-violet-800"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                <span className="block">{module.shortTitle}</span>
                <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
                  {moduleCorrect}/{questions.length}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти вопрос…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setOnlyErrors((value) => !value);
              setShuffled(null);
            }}
            disabled={wrong.length === 0}
            className={
              "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 " +
              (onlyErrors
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            <AlertTriangle className="h-4 w-4" />
            Только ошибки · {wrong.length}
          </button>
          <button
            type="button"
            onClick={toggleShuffle}
            className={
              "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition " +
              (shuffled
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            <Shuffle className="h-4 w-4" />
            {shuffled ? "По порядку" : "Перемешать"}
          </button>
          <button
            type="button"
            onClick={resetLocal}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Сбросить текущую попытку
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
        <p className="text-slate-500">
          Вопросов: {displayed.length}
          {onlyErrors ? " · только ошибки" : ""}
          {query ? ` · поиск «${query}»` : ""}
        </p>
        <p className="text-xs text-slate-400">
          В этой попытке: {currentSessionAnswered} ответов, {currentSessionCorrect} верно
        </p>
      </div>

      <section className="space-y-3">
        {displayed.map((question) => {
          const isChecked = Boolean(checked[question.id]);
          const answer = selected[question.id] ?? [];
          const result = isChecked ? isAnswerCorrect(question, answer) : null;
          const stored = progress.tests[testKey(question)];

          return (
            <article
              key={question.id}
              className={
                "card overflow-hidden " +
                (result === true
                  ? "border-emerald-200"
                  : result === false
                    ? "border-rose-200"
                    : "")
              }
            >
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold " +
                      (result === true
                        ? "bg-emerald-100 text-emerald-700"
                        : result === false
                          ? "bg-rose-100 text-rose-700"
                          : "bg-violet-50 text-violet-700")
                    }
                  >
                    {result === true ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : result === false ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      (question.number ?? "?")
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Вопрос {question.number ?? "—"}
                      </span>
                      {stored?.correct && !result && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          уже решён верно
                        </span>
                      )}
                      {stored && !stored.correct && !result && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                          в ошибках
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-bold text-slate-900">{question.question}</h3>

                    <OptionList
                      question={question}
                      selected={answer}
                      checked={isChecked}
                      onToggle={(optionNumber) => toggleOption(question, optionNumber)}
                    />

                    {!isChecked ? (
                      <button
                        type="button"
                        onClick={() => checkQuestion(question)}
                        disabled={answer.length === 0}
                        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Проверить
                      </button>
                    ) : (
                      <div
                        className={
                          "mt-3 rounded-xl border p-3 text-sm leading-5 " +
                          (result
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                            : "border-rose-200 bg-rose-50 text-rose-950")
                        }
                      >
                        <p className="font-bold">
                          {result ? "Верно." : "Неверно."} Правильный ответ: {question.answer}
                        </p>
                        <p className="mt-1 text-xs leading-5 opacity-90">{question.why}</p>
                        {!result && (
                          <button
                            type="button"
                            onClick={() => {
                              setChecked((previous) => {
                                const next = { ...previous };
                                delete next[question.id];
                                return next;
                              });
                              setSelected((previous) => {
                                const next = { ...previous };
                                delete next[question.id];
                                return next;
                              });
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Попробовать снова
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {displayed.length === 0 && (
          <div className="card p-8 text-center">
            <p className="font-bold text-slate-900">
              {onlyErrors ? "Ошибок в этом разделе нет" : "Ничего не найдено"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {onlyErrors
                ? "Отличный результат — переходи к следующему разделу или к ситуационным задачам."
                : "Измени поисковый запрос или сбрось фильтр."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
