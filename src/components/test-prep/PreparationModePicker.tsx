"use client";

/**
 * Экран запуска банка: режим, объём и проверка в одном месте.
 *
 * Раньше режим выбирался в списке банков, а потом ещё раз здесь — и на обоих
 * экранах висели свои настройки. Теперь у банка один вход: выбрать режим,
 * сколько вопросов взять и нажать «Начать». Всё, что не влияет на запуск,
 * убрано под «Состав и вопросы».
 */
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  ClipboardCheck,
  GraduationCap,
  ListOrdered,
  Loader2,
  Play,
  Settings2,
} from "lucide-react";

import { LoadingBar } from "@/components/ui/LoadingBar";
import { InlineBank } from "@/components/test-prep/InlineBank";
import type { Experience } from "@/components/test-prep/view";
import type { PreparationController } from "@/components/test-prep/usePreparation";

type Option = {
  id: Experience;
  title: string;
  short: string;
  desc: string;
  Icon: typeof Play;
};

const OPTIONS: Option[] = [
  {
    id: "prepare",
    title: "Подготовка",
    short: "проверка сразу",
    desc: "Отвечаете и сразу видите вердикт, эталон и пояснение.",
    Icon: Play,
  },
  {
    id: "solve",
    title: "Решение",
    short: "проверка в конце",
    desc: "Отвечаете подряд, эталоны открываются после завершения.",
    Icon: ListOrdered,
  },
  {
    id: "control",
    title: "Контрольный",
    short: "без подсказок",
    desc: "Как на занятии: без эталонов и без разбора до конца.",
    Icon: ClipboardCheck,
  },
  {
    id: "exam",
    title: "Экзамен",
    short: "строго",
    desc: "Без номеров вопросов и эталонов, с учётом лимита времени.",
    Icon: GraduationCap,
  },
];

const COUNTS = [10, 20, 50];

export function PreparationModePicker({ page }: { page: PreparationController }) {
  const { loading, error, meta, limit, setLimit, startExperience, id, returnHref } = page;
  const [experience, setExperience] = useState<Experience>("prepare");
  const [wholeBank, setWholeBank] = useState(false);
  // Банк грузится только после раскрытия: пока он не нужен, экран запуска
  // не тянет список из сотен вопросов.
  const [bankOpen, setBankOpen] = useState(false);

  const selected = OPTIONS.find((option) => option.id === experience) || OPTIONS[0];
  const startLabel = wholeBank ? "Весь банк подряд" : `Начать · ${limit}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28 sm:space-y-5">
      <LoadingBar active={loading} />

      <Link
        href={returnHref || "/tests"}
        className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {returnHref ? "Вернуться в предмет" : "К тестам"}
      </Link>

      <header>
        {meta?.subject && (
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{meta.subject}</p>
        )}
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-950">
          {meta?.title || "Тест"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Выберите режим и объём — настройка одна на весь банк.
          Свободная подготовка не уходит преподавателю.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Settings2 className="h-4 w-4 text-indigo-600" /> Режим
        </div>
        <div role="radiogroup" aria-label="Режим прохождения" className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map(({ id: value, title, short, desc, Icon }) => {
            const active = !wholeBank && experience === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setExperience(value);
                  setWholeBank(false);
                }}
                className={
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition " +
                  (active
                    ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-indigo-300")
                }
              >
                <span
                  className={
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
                    (active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")
                  }
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                    {title}
                    <span className="text-[11px] font-semibold text-[var(--muted)]">· {short}</span>
                    {active && <Check className="ml-auto h-4 w-4 text-indigo-600" />}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          role="radio"
          aria-checked={wholeBank}
          onClick={() => {
            setWholeBank((value) => !value);
            setExperience("prepare");
          }}
          className={
            "mt-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition " +
            (wholeBank
              ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] ring-1 ring-[var(--status-ok-border)]"
              : "border-[var(--border)] hover:border-[var(--status-ok-border)]")
          }
        >
          <span
            className={
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
              (wholeBank ? "bg-[var(--status-ok-fg)] text-white" : "bg-slate-100 text-slate-600")
            }
          >
            <BookOpenCheck className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-slate-900">Весь банк подряд</span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
              Вопросы идут строго по порядку, прогресс сохраняется: удобно закрыть банк целиком.
            </span>
          </span>
          {wholeBank && <Check className="h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" />}
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-extrabold text-slate-900">Сколько вопросов взять</div>
          <span className="text-xs text-[var(--muted)]">
            {wholeBank ? "весь банк" : "случайная выборка"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {COUNTS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={wholeBank}
              onClick={() => setLimit(value)}
              className={
                "min-h-10 rounded-xl border px-3 py-2 text-sm font-bold transition disabled:opacity-40 " +
                (limit === value && !wholeBank
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-[var(--border)] text-slate-700 hover:border-indigo-300")
              }
            >
              {value}
            </button>
          ))}
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="number"
              min={1}
              max={200}
              disabled={wholeBank}
              value={limit}
              onChange={(event) => setLimit(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
              className="min-h-10 w-20 rounded-xl border border-[var(--input-border)] bg-[var(--card)] px-3 py-2 disabled:opacity-40"
              aria-label="Своё количество вопросов"
            />
            <span className="text-xs text-[var(--muted)]">своё</span>
          </label>
        </div>
        {!wholeBank && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Если вопросов в банке меньше — будут использованы все.
          </p>
        )}
      </div>

      <details
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm sm:p-4"
        onToggle={(event) => setBankOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-extrabold text-slate-900">
          <BookOpenCheck className="h-4 w-4 text-[var(--status-ok-fg)]" />
          Состав банка и вопросы
          <span className="ml-auto text-xs font-semibold text-indigo-600">{bankOpen ? "скрыть" : "открыть"}</span>
        </summary>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Все вопросы с эталонами — здесь же: можно отфильтровать по теме и вернуться к запуску
          без потери настроек.
        </p>
        {bankOpen && (
          <div className="mt-3">
            <InlineBank id={id} />
          </div>
        )}
      </details>

      {/* Липкая панель запуска: на телефоне кнопка всегда под рукой. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--card)]/95 px-3 py-2 backdrop-blur sm:static sm:rounded-2xl sm:border sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <div className="min-w-0 flex-1 text-xs text-[var(--muted)]">
            <span className="block truncate font-bold text-slate-900">
              {wholeBank ? "Весь банк подряд" : selected.title}
            </span>
            <span className="block truncate">
              {wholeBank ? "вопросы по порядку" : `${limit} вопросов · ${selected.short}`}
            </span>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => startExperience(experience, wholeBank ? "sequential" : "count")}
            className="btn-primary inline-flex min-h-11 shrink-0 items-center gap-2 px-4 text-sm disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {startLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
