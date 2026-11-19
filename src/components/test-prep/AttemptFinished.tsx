"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

import type { AttemptRunnerController } from "./useAttemptRunner";

/** Экран завершённой попытки: процент, карточки из теста и из ошибок. */
export function AttemptFinished({ page }: { page: AttemptRunnerController }) {
  const { finished, questions, cardsBusy, cardsNote, makeCards, wrongIds } = page;

  return (
    <main className="mx-auto max-w-md p-8"><div className="card p-6 text-center">
      <h1 className="page-title">Тестирование завершено</h1>
      <div className="my-4 text-5xl font-extrabold text-indigo-600">{finished?.percent ?? "—"}%</div>
      <p className="text-sm text-slate-500">{finished?.score ?? 0} из {finished?.max_score ?? questions.length} верных · результат отправлен преподавателю</p>
      {cardsNote && <p className="mt-3 text-sm text-[var(--status-ok-fg)]">{cardsNote}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          disabled={cardsBusy}
          onClick={() => void makeCards()}
        >
          {cardsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Сделать карточки из теста
        </button>
        {wrongIds.length ? (
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={cardsBusy}
            onClick={() => void makeCards(wrongIds)}
          >
            Карточки по ошибкам ({wrongIds.length})
          </button>
        ) : null}
        <Link href="/tests" className="btn-primary inline-flex">К тестам</Link>
      </div>
    </div></main>
  );
}
