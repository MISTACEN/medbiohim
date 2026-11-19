"use client";

import type { ApiTest } from "@/lib/api";
import type { BankContext } from "./model";

type Props = {
  test: ApiTest;
  questionCount: number;
  context: BankContext;
};

/** Шапка банка: название теста и контекст занятия из deep-ссылки. */
export function BankHeader({ test, questionCount, context }: Props) {
  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-indigo-500">Банк вопросов</div>
      <h1 className="mt-2 text-2xl font-extrabold">{String(test.title || "Тест")}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {questionCount} вопросов. Здесь можно изучить весь банк с ответами или выбрать режим прохождения.
      </p>
      {(context.subject || context.module || context.topic) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {context.subject && (
            <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-indigo-700 shadow-sm">{context.subject}</span>
          )}
          {context.module && context.module !== context.subject && (
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 shadow-sm">{context.module}</span>
          )}
          {context.topic && (
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 shadow-sm">{context.topic}</span>
          )}
        </div>
      )}
    </section>
  );
}
