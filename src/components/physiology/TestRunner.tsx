"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { answersAsSet, groupHasAnswers, isCorrect, type PhysiologyTestGroup } from "@/lib/physiologyContent";

export default function TestRunner({
  group,
  onExit,
}: {
  group: PhysiologyTestGroup;
  onExit: () => void;
}) {
  const graded = groupHasAnswers(group);
  const total = group.questions.length;
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const question = group.questions[index];
  const correctAnswer = useMemo(() => answersAsSet(question?.answer || ""), [question]);
  const multiple = correctAnswer.length > 1;

  function toggle(option: number) {
    if (checked) return;
    if (multiple) {
      setPicks((current) =>
        current.includes(option) ? current.filter((value) => value !== option) : [...current, option]
      );
      return;
    }
    setPicks([option]);
  }

  function check() {
    if (!picks.length || !graded) return;
    const ok = isCorrect(picks, question.answer);
    if (ok) setScore((value) => value + 1);
    setChecked(true);
  }

  function next() {
    if (index + 1 >= total) {
      setFinished(true);
      return;
    }
    setIndex((value) => value + 1);
    setPicks([]);
    setChecked(false);
  }

  function restart() {
    setIndex(0);
    setPicks([]);
    setChecked(false);
    setScore(0);
    setFinished(false);
  }

  if (finished) {
    const percent = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="card p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Результат</p>
        <p className="mt-2 text-3xl font-extrabold text-slate-900">
          {score} / {total}
        </p>
        <p className="mt-1 text-sm text-slate-600">{percent}% верных ответов</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={restart} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
            <RotateCcw className="h-4 w-4" /> Пройти снова
          </button>
          <button type="button" onClick={onExit} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> К тестам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onExit} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> К списку тестов
        </button>
        <span className="text-xs font-semibold text-slate-500">
          {graded ? `Верно: ${score} · ` : ""}
          Вопрос {index + 1} из {total}
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <p className="mt-4 text-base font-semibold leading-7 text-slate-900">{question.text}</p>
      <p className="mt-1 text-xs text-slate-400">Выберите один или несколько вариантов</p>

      <div className="mt-3 grid gap-2">
        {question.options.map((option, optionIndex) => {
          const number = optionIndex + 1;
          const selected = picks.includes(number);
          const isRight = checked && correctAnswer.includes(number);
          const isWrong = checked && selected && !correctAnswer.includes(number);
          return (
            <button
              key={number}
              type="button"
              onClick={() => toggle(number)}
              className={
                "flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition " +
                (isRight
                  ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                  : isWrong
                    ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
                    : selected
                      ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300")
              }
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
                {number}
              </span>
              <span className="leading-6">{option}</span>
            </button>
          );
        })}
      </div>

      {checked && (
        <div
          className={
            "mt-4 flex items-start gap-2 rounded-xl p-3 text-sm " +
            (isCorrect(picks, question.answer) ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")
          }
        >
          {isCorrect(picks, question.answer) ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>
            {isCorrect(picks, question.answer)
              ? "Верно."
              : `Неверно. Правильный ответ: ${correctAnswer.join(", ")}.`}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {graded ? (
          <button
            type="button"
            onClick={checked ? next : check}
            disabled={!picks.length}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checked ? "Далее" : "Проверить"}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
            Далее <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {!graded && (
          <span className="self-center text-xs text-slate-500">
            В источнике нет машиночитаемого ключа к этому блоку — режим разбора без оценки.
          </span>
        )}
      </div>
    </div>
  );
}
