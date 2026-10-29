"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listCalculators,
  computeCalculator,
  type CalculatorDef,
  type CalcField,
  type CalcStep,
} from "@/lib/features-api";
import { Calculator, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import { ErrorState } from "@/components/ui/ErrorState";

type ComputeView = {
  result: Record<string, unknown>;
  interpretation: string;
  warnings: string[];
  steps: CalcStep[];
  approximate: boolean;
  notes: string[];
};

export default function CalculatorsPage() {
  const [items, setItems] = useState<CalculatorDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComputeView | null>(null);
  const [category, setCategory] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await listCalculators();
    setLoading(false);
    if (!res.ok) {
      setLoadError(describeApiError(res.error));
      return;
    }
    const list = res.data.items || [];
    setItems(list);
    setActiveId((current) =>
      current && list.some((i) => i.id === current) ? current : list[0]?.id ?? null
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(
    () => (category === "all" ? items : items.filter((i) => i.category === category)),
    [items, category]
  );

  const active = items.find((i) => i.id === activeId) || null;

  useEffect(() => {
    if (!active) return;
    const init: Record<string, string> = {};
    active.fields.forEach((f) => {
      if (f.default !== undefined) init[f.key] = String(f.default);
      else if (f.type === "select" && f.options?.[0]) init[f.key] = f.options[0].value;
      else init[f.key] = "";
    });
    setValues(init);
    setResult(null);
    setError(null);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onCompute() {
    if (!active) return;
    setComputing(true);
    setError(null);
    setResult(null);
    const input: Record<string, string | number> = {};
    for (const f of active.fields) {
      const raw = values[f.key];
      if ((raw === undefined || raw === "") && f.optional) continue;
      if (f.type === "number") {
        input[f.key] = raw === "" ? "" : Number(raw);
      } else {
        input[f.key] = raw ?? "";
      }
    }
    const res = await computeCalculator(active.id, input);
    setComputing(false);
    if (!res.ok) {
      setError(describeApiError(res.error));
      return;
    }
    setResult({
      result: res.data.result,
      interpretation: res.data.interpretation,
      warnings: res.data.warnings || [],
      steps: res.data.steps || [],
      approximate: Boolean(res.data.approximate),
      notes: res.data.notes || [],
    });
  }

  function renderField(f: CalcField) {
    if (f.type === "select") {
      return (
        <select
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
          value={values[f.key] ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
        >
          {(f.options || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="number"
        step={f.step ?? "any"}
        min={f.min}
        max={f.max}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
        value={values[f.key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
        placeholder={f.optional ? "необязательно" : ""}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Загрузка калькуляторов…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <ErrorState
          title="Не удалось загрузить калькуляторы"
          message={loadError}
          retry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Calculator className="h-7 w-7 text-[var(--primary)]" />
          Калькуляторы
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Клинические и фармацевтические расчёты для всех дисциплин: почки, дозы, шкалы, лаборатория.
          Расчёты справочные и учебные, а не диагноз.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            category === "all"
              ? "bg-[var(--primary)] text-white"
              : "border border-[var(--border)] hover:bg-[var(--primary-soft)]"
          }`}
        >
          Все
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
              category === c
                ? "bg-[var(--primary)] text-white"
                : "border border-[var(--border)] hover:bg-[var(--primary-soft)]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                activeId === c.id
                  ? "bg-[var(--primary)] text-white shadow"
                  : "hover:bg-[var(--primary-soft)]"
              }`}
            >
              <div className="font-medium leading-snug">{c.name}</div>
              <div className={`mt-0.5 text-[11px] capitalize ${activeId === c.id ? "text-white/80" : "text-[var(--muted)]"}`}>
                {c.category}
                {c.approximate ? " · приблизительно" : ""}
              </div>
            </button>
          ))}
        </aside>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
          {!active ? (
            <p className="text-[var(--muted)]">Выберите калькулятор</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{active.name}</h2>
                {active.approximate && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    приблизительно
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{active.description}</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {active.fields.map((f) => (
                  <label key={f.key} className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {f.label}
                      {f.optional ? " (опц.)" : ""}
                    </span>
                    {renderField(f)}
                    {f.hint && (
                      <span className="block text-[11px] leading-snug text-[var(--muted)]">{f.hint}</span>
                    )}
                  </label>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onCompute()}
                  disabled={computing}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                >
                  {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  Рассчитать
                </button>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {result && (
                <div className="mt-5 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--success)]">
                    <CheckCircle2 className="h-4 w-4" /> Результат
                    {result.approximate && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        приблизительно
                      </span>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(result.result).map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{k}</div>
                        <div className="break-words text-lg font-bold tabular-nums">{String(v)}</div>
                      </div>
                    ))}
                  </div>

                  <p className="text-sm leading-relaxed">{result.interpretation}</p>

                  {result.steps.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Пошаговое решение
                      </div>
                      <ol className="space-y-2">
                        {result.steps.map((s, i) => (
                          <li
                            key={`${i}-${s.label}`}
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                          >
                            <div className="text-xs font-semibold">
                              {i + 1}. {s.label}
                            </div>
                            <div className="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-[var(--muted)]">
                              {s.formula}
                            </div>
                            <div className="mt-1 break-words text-sm font-semibold tabular-nums">{s.value}</div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {result.warnings.length > 0 && (
                    <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="flex gap-1.5">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}

                  {result.notes.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-[var(--muted)]">
                      {result.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}

                  <p className="text-[11px] text-[var(--muted)]">
                    Расчёты справочные. Клинические решения принимает врач / преподаватель по актуальным рекомендациям.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
