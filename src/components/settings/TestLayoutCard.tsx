"use client";

import clsx from "clsx";

import type { TrainerLayout } from "./useSettingsData";

const LAYOUTS: [TrainerLayout, string, string][] = [
  ["sidebar", "Сайдбар", "Номера и статус слева"],
  ["list", "Списком", "Все задания подряд"],
  ["top", "Верхняя пагинация", "Одно задание + номера сверху"],
];

export type TestLayoutCardProps = {
  trainerLayout: TrainerLayout;
  onSelect: (layout: TrainerLayout) => void;
};

/** Формат отображения тестов с мини-примерами каждого варианта. */
export function TestLayoutCard({ trainerLayout, onSelect }: TestLayoutCardProps) {
  return (
    <section className="card space-y-5 p-5">
      <div>
        <h2 className="text-lg font-semibold">Формат отображения тестов</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Общий параметр для всех тестов и тренировок. Здесь можно сразу увидеть мини-пример каждого варианта.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {LAYOUTS.map(([id, label, hint]) => {
          const active = trainerLayout === id;
          return (
            <button key={id} type="button" onClick={() => onSelect(id)} className={clsx("rounded-2xl border p-3 text-left transition", active ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100" : "border-[var(--border)] hover:bg-slate-50")}>
              <div className="mb-3 rounded-xl border bg-white p-2">
                {id === "sidebar" && (
                  <div className="grid grid-cols-[28%_1fr] gap-2">
                    <div className="space-y-1 rounded-lg bg-slate-100 p-2"><span className="block h-2 rounded bg-indigo-300" /><span className="block h-2 rounded bg-[var(--status-ok-fg)]" /><span className="block h-2 rounded bg-slate-300" /><span className="block h-2 rounded bg-slate-300" /></div>
                    <div className="space-y-2"><span className="block h-3 w-1/2 rounded bg-slate-200" /><span className="block h-14 rounded-lg bg-slate-100" /><span className="block h-3 rounded bg-slate-200" /></div>
                  </div>
                )}
                {id === "list" && (
                  <div className="space-y-1.5"><span className="block h-8 rounded-lg bg-slate-100" /><span className="block h-8 rounded-lg bg-slate-100" /><span className="block h-8 rounded-lg bg-slate-100" /></div>
                )}
                {id === "top" && (
                  <div className="space-y-2"><div className="flex gap-1"><span className="h-3 w-3 rounded-full bg-indigo-400" /><span className="h-3 w-3 rounded-full bg-slate-300" /><span className="h-3 w-3 rounded-full bg-slate-300" /><span className="h-3 w-3 rounded-full bg-slate-300" /></div><span className="block h-16 rounded-lg bg-slate-100" /></div>
                )}
              </div>
              <div className="font-semibold">{label}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
