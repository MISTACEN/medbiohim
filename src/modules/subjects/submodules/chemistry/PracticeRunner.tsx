"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, Printer, RefreshCw, RotateCcw, XCircle } from "lucide-react";

import {
  PRACTICE_TOPICS,
  TOPIC_LABEL,
  checkPracticeAnswer,
  difficultyLabel,
  generateVariant,
  variantCsvRows,
  type AnswerCheck,
  type PracticeDifficulty,
  type PracticeTopic,
} from "@/lib/chemistry/practice";
import { CHEM_PLAN_HREF, planAnchorLabel, planLinkFor } from "@/lib/chemistry/planLinks";
import { csvFilename, downloadCsv, printCurrentView, toCsv } from "@/lib/chemistry/export";

const CSV_COLUMNS = [
  { key: "№", label: "№" },
  { key: "Тема", label: "Тема" },
  { key: "Уровень", label: "Уровень" },
  { key: "Задача", label: "Задача" },
  { key: "Ответ", label: "Ответ" },
  { key: "Единица", label: "Единица" },
  { key: "Ваш результат", label: "Ваш результат" },
  { key: "Seed", label: "Seed" },
] as const;

const DIFFICULTIES: Array<PracticeDifficulty | "mixed"> = [1, 2, 3, "mixed"];

/**
 * H6 + H8: вариант задач по химии. Задачи генерируются детерминированно по
 * seed, ответы проверяются локально, решения показываются по шагам.
 * Экспорт: CSV (Excel) и печать → PDF.
 */
export function PracticeRunner() {
  const [seedInput, setSeedInput] = useState("demo-2026");
  const [appliedSeed, setAppliedSeed] = useState("demo-2026");
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty | "mixed">(2);
  const [count, setCount] = useState(6);

  const variant = useMemo(
    () => generateVariant({
      seed: appliedSeed,
      topics: topics.length ? topics : undefined,
      count,
      difficulty,
    }),
    [appliedSeed, topics, count, difficulty],
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, AnswerCheck>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const checked = Object.values(checks);
  const correct = checked.filter((check) => check.status === "correct").length;
  const answered = checked.filter((check) => check.status !== "empty").length;

  function resetResults() {
    setAnswers({});
    setChecks({});
    setRevealed({});
  }

  function applySeed() {
    const next = seedInput.trim() || "demo-2026";
    setAppliedSeed(next);
    resetResults();
  }

  function newVariant() {
    const next = Date.now().toString(36);
    setSeedInput(next);
    setAppliedSeed(next);
    resetResults();
  }

  function toggleTopic(topic: PracticeTopic) {
    setTopics((current) => (
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]
    ));
    resetResults();
  }

  function checkOne(questionId: string) {
    const question = variant.questions.find((item) => item.id === questionId);
    if (!question) return;
    setChecks((current) => ({ ...current, [questionId]: checkPracticeAnswer(question, answers[questionId] || "") }));
  }

  function checkAll() {
    const next: Record<string, AnswerCheck> = {};
    for (const question of variant.questions) {
      const value = answers[question.id];
      if (!value || !value.trim()) continue;
      next[question.id] = checkPracticeAnswer(question, value);
    }
    setChecks(next);
  }

  function exportCsv() {
    const results: Record<string, "correct" | "incorrect" | "invalid" | "empty"> = {};
    for (const question of variant.questions) {
      const check = checks[question.id];
      results[question.id] = check && "status" in check ? check.status : "empty";
    }
    const csv = toCsv(variantCsvRows(variant, results), [...CSV_COLUMNS]);
    downloadCsv(csvFilename("medbiohim", `practice-${variant.seed.toString(36)}`), csv);
  }

  return (
    <section className="space-y-5">
      <div className="card space-y-4 p-4 print:hidden sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 basis-52 text-sm">
            <span className="mb-1 block font-medium text-[var(--muted)]">Seed варианта</span>
            <input
              value={seedInput}
              onChange={(event) => setSeedInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") applySeed(); }}
              className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
              placeholder="например, группа-12"
              aria-label="Seed варианта"
            />
          </label>
          <button type="button" onClick={applySeed} className="btn-primary">Собрать по seed</button>
          <button type="button" onClick={newVariant} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" /> Новый вариант
          </button>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-[var(--muted)]">Темы (ничего не выбрано — все)</legend>
          <div className="flex flex-wrap gap-2">
            {PRACTICE_TOPICS.map((topic) => {
              const active = topics.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTopic(topic.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-medium " +
                    (active ? "border-indigo-600 bg-indigo-600 text-white" : "border-[var(--border)] text-slate-700 hover:border-indigo-300")
                  }
                  title={topic.hint}
                >
                  {topic.label}
                </button>
              );
            })}
          </div>
          {/* Честная связь с планом: ссылка ставится только там, где в плане
              кафедры есть дословная тема, иначе так и написано. */}
          <details className="mt-2 rounded-xl border border-[var(--border)] bg-slate-50/60 px-3 py-2 text-xs print:hidden">
            <summary className="cursor-pointer font-semibold text-slate-600">Как темы связаны с планом кафедры</summary>
            <ul className="mt-2 space-y-1">
              {PRACTICE_TOPICS.map((topic) => {
                const link = planLinkFor(topic.id);
                return (
                  <li key={topic.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-slate-700">{topic.label}:</span>
                    {link?.anchor ? (
                      <a href={CHEM_PLAN_HREF} className="text-indigo-600 hover:underline">
                        {planAnchorLabel(link.anchor)} · {link.note}
                      </a>
                    ) : (
                      <span className="text-slate-500">{link?.note ?? "вне плана кафедры"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-medium text-[var(--muted)]">Уровень</span>
            <select
              value={String(difficulty)}
              onChange={(event) => { const value = event.target.value; setDifficulty(value === "mixed" ? "mixed" : Number(value) as PracticeDifficulty); resetResults(); }}
              className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5"
            >
              {DIFFICULTIES.map((level) => (
                <option key={String(level)} value={String(level)}>
                  {level === "mixed" ? "смешанный" : difficultyLabel(level)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="font-medium text-[var(--muted)]">Задач</span>
            <select
              value={count}
              onChange={(event) => { setCount(Number(event.target.value)); resetResults(); }}
              className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5"
            >
              {[3, 6, 10, 15].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button type="button" onClick={() => printCurrentView()} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
              <Printer className="h-3.5 w-3.5" /> Печать / PDF
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-[var(--muted)]">
          Вариант <span className="font-mono">{variant.seed.toString(36)}</span> · задач {variant.questions.length} ·
          проверено {answered}, верно {correct}
        </p>
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={checkAll} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            Проверить заполненные
          </button>
          <button type="button" onClick={resetResults} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">
            <RotateCcw className="h-3.5 w-3.5" /> Сбросить ответы
          </button>
        </div>
      </div>

      <ol className="space-y-3">
        {variant.questions.map((question, index) => {
          const check = checks[question.id];
          const showSteps = revealed[question.id];
          const status = check && "status" in check ? check.status : "empty";
          return (
            <li key={question.id} className="card space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white">{index + 1}</span>
                <span className="font-semibold">{TOPIC_LABEL[question.topic]}</span>
                <span>· {difficultyLabel(question.difficulty)}</span>
              </div>
              <p className="text-[15px] leading-7">{question.prompt}</p>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <label className="flex items-center gap-2">
                  <span className="sr-only">Ответ на задачу {index + 1}</span>
                  <input
                    value={answers[question.id] || ""}
                    onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                    onKeyDown={(event) => { if (event.key === "Enter") checkOne(question.id); }}
                    inputMode="decimal"
                    placeholder={`Ответ, ${question.answer.unit}`}
                    className="w-44 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm"
                  />
                </label>
                <button type="button" onClick={() => checkOne(question.id)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">
                  Проверить
                </button>
                <button
                  type="button"
                  onClick={() => setRevealed((current) => ({ ...current, [question.id]: !current[question.id] }))}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  {showSteps ? "Скрыть решение" : "Показать решение"}
                </button>
                {status === "correct" && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--status-ok-fg)]">
                    <CheckCircle2 className="h-4 w-4" /> верно
                  </span>
                )}
                {status === "incorrect" && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--status-critical-fg)]">
                    <XCircle className="h-4 w-4" /> {check && "hint" in check ? check.hint : "неверно"}
                  </span>
                )}
                {status === "invalid" && (
                  <span className="text-xs font-semibold text-[var(--status-warn-fg)]">{check && "message" in check ? check.message : "Проверьте формат"}</span>
                )}
              </div>

              {(showSteps || (check && check.status !== "correct")) && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 text-sm leading-6">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Решение</div>
                  <ol className="list-decimal space-y-1 pl-5">
                    {question.steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  <div className="text-xs text-slate-500">
                    Ответ: <span className="font-semibold text-slate-700">{String(question.answer.value.toFixed(3)).replace(".", ",")} {question.answer.unit}</span>
                  </div>
                  {question.notes.map((note) => <p key={note} className="text-xs text-slate-500">· {note}</p>)}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-[var(--muted)]">
        Задачи генерируются по seed: тот же seed и настройки всегда дают тот же вариант. Числа в решениях считаются по
        атомным массам снимка периодической таблицы, а не берутся из готового списка ответов.
      </p>
    </section>
  );
}

export default PracticeRunner;
