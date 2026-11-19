"use client";

import Link from "next/link";
import { BookOpenCheck, ListChecks, Play, RotateCcw } from "lucide-react";

import type { ModeLinks } from "./model";

type Props = {
  modeLinks: ModeLinks;
  questionCount: number;
  progress: any;
  answered: number;
  total: number;
  percent: number;
  completedCorrect: number;
};

/** Секция «Режим прохождения»: ссылки на подготовку/решение/экзамен и прогресс банка. */
export function BankModes({ modeLinks, questionCount, progress, answered, total, percent, completedCorrect }: Props) {
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Режим прохождения</h2>
          <p className="text-sm text-slate-500">Для «весь банк» вопросы идут строго подряд и после завершения показывается 41/41.</p>
        </div>
        {progress && (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <div className="font-semibold">Прогресс всего банка</div>
            <div className="mt-1 text-slate-600">{answered} / {total} · {percent}% · правильно {completedCorrect}</div>
            {progress.completed && <div className="mt-1 font-semibold text-[var(--status-ok-fg)]">Банк полностью пройден</div>}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={modeLinks.practice} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
          <BookOpenCheck className="h-5 w-5 text-indigo-600" />
          <div className="mt-2 font-semibold">Подготовка</div>
          <div className="mt-1 text-xs text-slate-500">случайная выборка, проверка сразу</div>
        </Link>
        <Link href={modeLinks.solve} className="rounded-xl border px-4 py-4">
          <ListChecks className="h-5 w-5 text-slate-700" />
          <div className="mt-2 font-semibold">Решение</div>
          <div className="mt-1 text-xs text-slate-500">случайная выборка, проверка в конце</div>
        </Link>
        <Link href={modeLinks.exam} className="rounded-xl border bg-slate-900 px-4 py-4 text-white">
          <Play className="h-5 w-5" />
          <div className="mt-2 font-semibold">Экзамен</div>
          <div className="mt-1 text-xs text-slate-300">без показа эталонов до конца</div>
        </Link>
        <Link href={modeLinks.sequential} className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-4 py-4">
          <RotateCcw className="h-5 w-5 text-[var(--status-ok-fg)]" />
          <div className="mt-2 font-semibold text-[var(--status-ok-fg)]">Весь банк подряд</div>
          <div className="mt-1 text-xs text-[var(--status-ok-fg)]">1 → {questionCount} без пропусков</div>
        </Link>
      </div>
    </section>
  );
}
