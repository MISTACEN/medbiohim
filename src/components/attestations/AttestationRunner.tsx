"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  ListChecks,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import type { Attestation, AttestationItem, AttestationType } from "@/types/attestations";
import { ATTESTATION_TYPE_LABELS } from "@/types/attestations";

type Progress = {
  read: string[];
  correct: string[];
  tasks: string[];
};

const EMPTY: Progress = { read: [], correct: [], tasks: [] };

const TYPE_STYLE: Record<AttestationType, { stamp: string; ring: string; soft: string }> = {
  colloquium: { stamp: "bg-indigo-600", ring: "ring-indigo-200", soft: "bg-indigo-50 text-indigo-700" },
  exam: { stamp: "bg-[var(--status-critical-fg)]", ring: "ring-rose-200", soft: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]" },
  credit: { stamp: "bg-[var(--status-ok-fg)]", ring: "ring-emerald-200", soft: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" },
  test: { stamp: "bg-sky-600", ring: "ring-sky-200", soft: "bg-sky-50 text-sky-700" },
  control: { stamp: "bg-[var(--status-warn-fg)]", ring: "ring-amber-200", soft: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" },
};

function itemLabel(item: AttestationItem) {
  if (item.kind === "test") return "Тест";
  if (item.kind === "task") return "Задача";
  return "Теория";
}

export default function AttestationRunner({ attestation }: { attestation: Attestation }) {
  const storageKey = `attestation-progress:${attestation.subject_slug}:${attestation.slug}`;
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Progress>;
        setProgress({
          read: Array.isArray(parsed.read) ? parsed.read : [],
          correct: Array.isArray(parsed.correct) ? parsed.correct : [],
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        });
      }
    } catch {
      /* localStorage may be unavailable — progress stays in memory */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [progress, storageKey, hydrated]);

  const stages = useMemo(() => attestation.stages || [], [attestation.stages]);
  const stage = stages[stageIndex];
  const totals = useMemo(() => {
    const items = stages.flatMap((s) => s.items);
    return {
      items: items.length,
      tests: items.filter((i) => i.kind === "test").length,
      tasks: items.filter((i) => i.kind === "task").length,
      theory: items.filter((i) => i.kind === "theory").length,
    };
  }, [stages]);

  const done = progress.read.length + progress.correct.length + progress.tasks.length;
  const percent = totals.items ? Math.round((done / totals.items) * 100) : 0;
  const style = TYPE_STYLE[attestation.type] || TYPE_STYLE.colloquium;
  const passScore = attestation.pass_score ?? 70;
  const passed = percent >= passScore;

  const mark = useCallback((field: keyof Progress, id: string, value: boolean) => {
    setProgress((current) => {
      const set = new Set(current[field]);
      if (value) set.add(id);
      else set.delete(id);
      return { ...current, [field]: [...set] };
    });
  }, []);

  function toggleOption(item: AttestationItem, index: number) {
    setAnswers((current) => {
      const saved = current[item.id] || [];
      const next = saved.includes(index) ? saved.filter((i) => i !== index) : [...saved, index];
      return { ...current, [item.id]: next };
    });
    setChecked((current) => ({ ...current, [item.id]: false }));
  }

  function checkTest(item: AttestationItem) {
    const correct = [...(item.correct || [])].sort().join(",");
    const picked = [...(answers[item.id] || [])].sort().join(",");
    const isRight = correct === picked && picked !== "";
    setChecked((current) => ({ ...current, [item.id]: true }));
    mark("correct", item.id, isRight);
  }

  const reset = () => {
    setProgress(EMPTY);
    setAnswers({});
    setChecked({});
    setRevealed({});
    setDrafts({});
    setStageIndex(0);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/subjects/${attestation.subject_slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> К предмету
        </Link>
        <div className="flex items-center gap-2">
          {passed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-ok-bg)] px-3 py-1 text-xs font-bold text-[var(--status-ok-fg)] ring-1 ring-emerald-200">
              <BadgeCheck className="h-3.5 w-3.5" /> Порог {passScore}% пройден
            </span>
          )}
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Сбросить прогресс
          </button>
        </div>
      </div>

      {/* Exam sheet header */}
      <header className="relative overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-100 via-violet-50 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${style.soft}`}>
                <ClipboardList className="h-3.5 w-3.5" /> {ATTESTATION_TYPE_LABELS[attestation.type]}
              </span>
              {attestation.subject_name && (
                <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  {attestation.subject_name}
                </span>
              )}
              {attestation.course_number != null && (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {attestation.course_number} курс{attestation.semester != null ? ` · ${attestation.semester} семестр` : ""}
                </span>
              )}
            </div>
            <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[2.6rem]">
              {attestation.title}
            </h1>
            {attestation.description && (
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">{attestation.description}</p>
            )}
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-xs">
              {[
                { label: "Этапов", value: stages.length },
                { label: "Вопросов", value: totals.items },
                { label: "Тестов", value: totals.tests },
                { label: "Задач", value: totals.tasks },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="font-semibold uppercase tracking-wider text-slate-400">{stat.label}</dt>
                  <dd className="mt-0.5 font-mono text-lg font-semibold text-[var(--text)]">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative flex w-full max-w-[210px] flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)]/70 p-4">
            <div className="relative grid h-28 w-28 place-items-center">
              <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200/70" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(percent, 1) * 3.267} 327`}
                  className={passed ? "text-[var(--status-ok-fg)]" : "text-indigo-500"}
                />
              </svg>
              <div className="absolute text-center">
                <div className="font-mono text-xl font-bold leading-none text-[var(--text)]">{percent}%</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">готово</div>
              </div>
            </div>
            <p className="text-center text-[11px] leading-4 text-slate-400">
              {done} из {totals.items} материалов · порог {passScore}%
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* Stage rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2">
            <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Программа</div>
            <ol className="space-y-0.5">
              {stages.map((entry, index) => {
                const active = index === stageIndex;
                const stageDone = entry.items.filter((item) =>
                  item.kind === "test" ? progress.correct.includes(item.id) : item.kind === "task" ? progress.tasks.includes(item.id) : progress.read.includes(item.id)
                ).length;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setStageIndex(index)}
                      className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition ${
                        active ? "bg-indigo-50 text-indigo-900" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold ${
                          active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-5">{entry.title}</span>
                        <span className={`mt-0.5 block text-[11px] ${active ? "text-indigo-500" : "text-slate-400"}`}>
                          {stageDone}/{entry.items.length} изучено
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="mt-3 hidden rounded-2xl border border-dashed border-[var(--border)] p-3 text-[11px] leading-5 text-slate-400 lg:block">
            Отмечайте теорию, решайте тесты и задачи — прогресс сохраняется в этом браузере.
          </div>
        </aside>

        {/* Stage body */}
        <main className="min-w-0">
          {stage && (
            <section className="space-y-4" aria-live="polite">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                    Этап {String(stageIndex + 1).padStart(2, "0")} / {String(stages.length).padStart(2, "0")}
                  </div>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[var(--text)]">{stage.title}</h2>
                  {stage.description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{stage.description}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  {stage.items.some((item) => item.kind === "theory") && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <BookOpen className="h-3 w-3" /> теория
                    </span>
                  )}
                  {stage.items.some((item) => item.kind === "test") && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-600">
                      <ListChecks className="h-3 w-3" /> тесты
                    </span>
                  )}
                  {stage.items.some((item) => item.kind === "task") && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-warn-bg)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--status-warn-fg)]">
                      <Sparkles className="h-3 w-3" /> задачи
                    </span>
                  )}
                </div>
              </div>

              {stage.items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-slate-400">
                  В этом этапе пока нет материалов.
                </div>
              )}

              <div className="space-y-4">
                {stage.items.map((item, index) => {
                  const isTest = item.kind === "test";
                  const isTask = item.kind === "task";
                  const isTheory = item.kind === "theory";
                  const isChecked = checked[item.id] === true;
                  const picked = answers[item.id] || [];
                  const isCorrect =
                    isTest && [...(item.correct || [])].sort().join(",") === [...picked].sort().join(",") && picked.length > 0;
                  const isRead = progress.read.includes(item.id);
                  const isTaskDone = progress.tasks.includes(item.id);

                  return (
                    <article
                      key={item.id}
                      className={`group rounded-2xl border bg-[var(--card)] p-5 transition sm:p-6 ${
                        isTest && isChecked
                          ? isCorrect
                            ? "border-[var(--status-ok-border)]"
                            : "border-[var(--status-critical-border)]"
                          : "border-[var(--border)] hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <span className="font-mono text-[11px] font-bold text-slate-300">
                            {String(stageIndex + 1)}.{String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isRead || isTaskDone || (isTest && progress.correct.includes(item.id))
                                ? "bg-[var(--status-ok-fg)]"
                                : isTest && isChecked
                                  ? "bg-[var(--status-critical-fg)]"
                                  : "bg-slate-200"
                            }`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{itemLabel(item)}</span>
                            {isTheory && isRead && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--status-ok-fg)]">
                                <Check className="h-3 w-3" /> изучено
                              </span>
                            )}
                            {isTask && isTaskDone && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--status-ok-fg)]">
                                <Check className="h-3 w-3" /> решено
                              </span>
                            )}
                          </div>

                          <h3 className={`mt-1.5 text-[15px] font-semibold leading-6 text-[var(--text)] ${isTheory ? "font-serif text-lg" : ""}`}>
                            {item.title}
                          </h3>

                          {item.body && (
                            <div className={`mt-3 text-sm leading-7 text-slate-600 ${isTheory ? "border-l-2 border-indigo-100 pl-4" : ""}`}>
                              <ChemRichText text={item.body} className="space-y-2" />
                            </div>
                          )}

                          {isTest && (
                            <div className="mt-4 space-y-2">
                              {(item.options || []).map((option, optionIndex) => {
                                const active = picked.includes(optionIndex);
                                const right = (item.correct || []).includes(optionIndex);
                                const tone = isChecked
                                  ? right
                                    ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/60"
                                    : active
                                      ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/60"
                                      : "border-[var(--border)] bg-transparent"
                                  : active
                                    ? "border-indigo-300 bg-indigo-50/60"
                                    : "border-[var(--border)] hover:border-slate-300 hover:bg-slate-50/60";
                                return (
                                  <button
                                    key={optionIndex}
                                    type="button"
                                    onClick={() => toggleOption(item, optionIndex)}
                                    className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${tone}`}
                                  >
                                    <span
                                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border font-mono text-[10px] font-bold ${
                                        active ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300 text-slate-400"
                                      }`}
                                    >
                                      {String.fromCharCode(1040 + optionIndex)}
                                    </span>
                                    <div className="text-sm leading-6 text-slate-700">
                                      <ChemRichText text={option} className="space-y-1" />
                                    </div>
                                    {isChecked && right && <CheckCircle2 className="ml-auto mt-1 h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" />}
                                    {isChecked && active && !right && <X className="ml-auto mt-1 h-4 w-4 shrink-0 text-[var(--status-critical-fg)]" />}
                                  </button>
                                );
                              })}

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => checkTest(item)}
                                  disabled={picked.length === 0}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
                                >
                                  Проверить
                                </button>
                                {isChecked && (
                                  <span className={`text-xs font-semibold ${isCorrect ? "text-[var(--status-ok-fg)]" : "text-[var(--status-critical-fg)]"}`}>
                                    {isCorrect ? "Верно" : "Есть ошибка — посмотрите выделенные варианты"}
                                  </span>
                                )}
                              </div>
                              {isChecked && item.explanation && (
                                <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-500">
                                  <ChemRichText text={item.explanation} className="space-y-1" />
                                </div>
                              )}
                            </div>
                          )}

                          {isTask && (
                            <div className="mt-4 space-y-2">
                              <textarea
                                value={drafts[item.id] || ""}
                                onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                                placeholder="Запишите решение или ответ…"
                                rows={3}
                                className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)]/60 px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setRevealed((current) => ({ ...current, [item.id]: !current[item.id] }))}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                                >
                                  <Eye className="h-3.5 w-3.5" /> {revealed[item.id] ? "Скрыть эталон" : "Показать эталон"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => mark("tasks", item.id, !isTaskDone)}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    isTaskDone ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-slate-900 text-white hover:bg-slate-700"
                                  }`}
                                >
                                  <Check className="h-3.5 w-3.5" /> {isTaskDone ? "Решено" : "Отметить решённой"}
                                </button>
                              </div>
                              {revealed[item.id] && item.answer && (
                                <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/50 px-3.5 py-3 text-sm leading-6 text-[var(--status-ok-fg)]">
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--status-ok-fg)]">Эталонный ответ</div>
                                  <ChemRichText text={item.answer} className="space-y-1" />
                                </div>
                              )}
                            </div>
                          )}

                          {isTheory && item.answer && (
                            <button
                              type="button"
                              onClick={() => setRevealed((current) => ({ ...current, [item.id]: !current[item.id] }))}
                              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                            >
                              <Eye className="h-3.5 w-3.5" /> {revealed[item.id] ? "Скрыть конспект ответа" : "Конспект ответа"}
                            </button>
                          )}
                          {isTheory && revealed[item.id] && item.answer && (
                            <div className="mt-2 rounded-xl bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-600">
                              <ChemRichText text={item.answer} className="space-y-2" />
                            </div>
                          )}
                          {isTheory && !item.answer && (
                            <button
                              type="button"
                              onClick={() => mark("read", item.id, !isRead)}
                              className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                isRead ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border border-[var(--border)] text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" /> {isRead ? "Изучено" : "Отметить изученным"}
                            </button>
                          )}
                          {isTheory && item.answer && (
                            <button
                              type="button"
                              onClick={() => mark("read", item.id, !isRead)}
                              className={`ml-2 mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                isRead ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border border-[var(--border)] text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" /> {isRead ? "Изучено" : "Отметить изученным"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStageIndex((current) => Math.max(0, current - 1))}
                  disabled={stageIndex === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" /> Назад
                </button>
                <button
                  type="button"
                  onClick={() => setStageIndex((current) => Math.min(stages.length - 1, current + 1))}
                  disabled={stageIndex >= stages.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
                >
                  Следующий этап <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
