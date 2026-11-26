"use client";

/**
 * Справочник электронных эффектов: что делает заместитель с кольцом и связью.
 *
 * Один экран без переходов: теория ±I/±M, поиск по названию и формуле, фильтр
 * по знаку эффекта и роду ориентанта, карточки заместителей и вход в
 * опубликованный тест по теме 1.2 — разбирать то же самое на вопросах.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";

import {
  EFFECT_ENTRIES,
  EFFECT_FILTERS,
  EFFECT_THEORY,
  EFFECT_TEST,
  filterEffects,
  type EffectEntry,
  type EffectFilter,
  type Reactivity,
} from "@/lib/chemistry/effects";

// Знак эффекта — смысл, а не декор: цвета берутся из семантических токенов
// темы (--status-*), чтобы тёмная тема и проверка контраста работали одинаково.
const EFFECT_STYLES: Record<string, string> = {
  "-I": "border-sky-200 bg-sky-50 text-sky-800",
  "+I": "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
  "-M": "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
  "+M": "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
};

const REACTIVITY_LABELS: Record<Reactivity, string> = {
  activate: "активирует кольцо",
  deactivate: "деактивирует кольцо",
  neutral: "почти не меняет активность",
};

function EffectBadge({ sign, strength }: { sign: string; strength?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-bold " +
        (EFFECT_STYLES[sign] || "border-[var(--border)] text-slate-700")
      }
    >
      {sign.replace("-", "−")}
      {strength ? <span className="font-medium opacity-70">{strength}</span> : null}
    </span>
  );
}

function EntryCard({ entry }: { entry: EffectEntry }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-base font-bold text-slate-900">{entry.group}</span>
        <span className="text-sm text-[var(--muted)]">{entry.name}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.inductive ? <EffectBadge sign={entry.inductive} strength={entry.inductiveStrength} /> : null}
        {entry.mesomeric ? <EffectBadge sign={entry.mesomeric} strength={entry.mesomericStrength} /> : null}
        {entry.orientation ? (
          <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-2 py-0.5 text-xs font-semibold text-slate-700">
            ориентант {entry.orientation === "I" ? "I рода · орто/пара" : "II рода · мета"}
          </span>
        ) : null}
        {entry.reactivity ? (
          <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
            {REACTIVITY_LABELS[entry.reactivity]}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-700">{entry.note}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        <span className="font-semibold">Кислотность и основность:</span> {entry.shifts}
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        <span className="font-semibold">Примеры:</span> {entry.examples}
      </p>
    </article>
  );
}

export function EffectsReference({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EffectFilter>("all");

  const items = useMemo(() => filterEffects(query, filter), [query, filter]);

  return (
    <section className={className || "space-y-4"}>
      <div className="grid gap-2 sm:grid-cols-2">
        {EFFECT_THEORY.map((card) => (
          <article key={card.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-extrabold text-indigo-700">
                {card.badge}
              </span>
              <h3 className="text-sm font-bold text-slate-900">{card.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{card.text}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{card.example}</p>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Нитро, −OH, фенол, галоген, мета…"
            aria-label="Поиск по эффектам и заместителям"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-300"
          />
        </label>

        <div className="mobile-scroll-x mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {EFFECT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={
                "shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold transition " +
                (filter === item.id
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-[var(--border)] text-slate-700 hover:border-indigo-300")
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="mt-1 text-xs text-[var(--muted)]">
          Показано {items.length} из {EFFECT_ENTRIES.length} заместителей
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {items.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          Ничего не нашлось. Попробуйте «нитро», «+M», «фенол» или сбросьте фильтр.
        </p>
      ) : null}

      <div className="rounded-2xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] p-4">
        <p className="text-sm font-bold text-[var(--status-ok-fg)]">Проверить на тестах</p>
        <p className="mt-1 text-xs leading-5 text-[var(--status-ok-fg)]">
          {EFFECT_TEST.title} · {EFFECT_TEST.questions} вопросов с эталонами.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/tests/preparation/${EFFECT_TEST.id}?mode=prepare&count=20`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--status-ok-fg)] px-3 py-2 text-sm font-bold text-white"
          >
            Тренировка · 20 вопросов <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/tests/bank/${EFFECT_TEST.id}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--status-ok-border)] bg-[var(--card)] px-3 py-2 text-sm font-bold text-[var(--status-ok-fg)]"
          >
            Все вопросы темы
          </Link>
        </div>
      </div>
    </section>
  );
}

export default EffectsReference;
