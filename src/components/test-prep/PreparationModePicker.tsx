"use client";

/** Экран выбора режима: тренировка, самопроверка, контрольный, экзамен, устный. */
import Link from "next/link";
import { LoadingBar } from "@/components/ui/LoadingBar";
import type { PreparationController } from "@/components/test-prep/usePreparation";

export function PreparationModePicker({ page }: { page: PreparationController }) {
  const { loading, error, meta, limit, setLimit, startExperience, id, returnHref } = page;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <LoadingBar active={loading} />
      <Link
        href={returnHref || "/tests"}
        className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
      >
        {returnHref ? "← Вернуться в предмет" : "← К тестам"}
      </Link>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{meta?.subject || "Проверка знаний"}</p>
        <h1 className="page-title">{meta?.title || "Тест"}</h1>
        <p className="page-subtitle">Выберите режим прохождения. Настройки действуют только для этого банка.</p>
      </div>
      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { id: "prepare" as const, title: "Тренировка", desc: "Проверка сразу после каждого ответа" },
          { id: "solve" as const, title: "Самопроверка", desc: "Проверка после завершения" },
          { id: "control" as const, title: "Контрольный", desc: "Как экзамен: без подсказок и эталонов" },
          { id: "exam" as const, title: "Экзамен", desc: "Строго, с учётом времени и лимитов" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={loading}
            onClick={() => startExperience(option.id, "count")}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50"
          >
            <span className="block font-extrabold text-slate-900">{option.title}</span>
            <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">{option.desc}</span>
            <span className="mt-3 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
              {limit} случайных вопросов
            </span>
          </button>
        ))}
        <Link
          href={`/tests/preparation/${encodeURIComponent(id)}/oral?count=${limit}${returnHref ? `&return=${encodeURIComponent(returnHref)}` : ""}`}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
        >
          <span className="block font-extrabold text-slate-900">Устный ответ</span>
          <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">Отвечайте вслух — ИИ-экзаменатор оценит и задаст уточняющий вопрос</span>
          <span className="mt-3 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
            {limit} случайных вопросов
          </span>
        </Link>
      </div>
      <div className="card space-y-4 p-5">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-800">Сколько случайных вопросов</span>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            className="w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          />
          <span className="text-xs text-[var(--muted)]">если вопросов в банке меньше — будут использованы все</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => startExperience("prepare", "sequential")}
            className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-4 py-3 text-sm font-bold text-[var(--status-ok-fg)] disabled:opacity-50"
          >
            Пройти весь банк подряд
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => startExperience("prepare", "full")}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            Полный тест в случайном порядке
          </button>
        </div>
      </div>
    </div>
  );
}
