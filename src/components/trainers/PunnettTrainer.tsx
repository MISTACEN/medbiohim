"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Grid3x3, Info, RotateCcw, Sigma } from "lucide-react";

import {
  solvePunnett,
  type PunnettResult,
} from "@/lib/genetics/punnett";

const PRESETS: Array<{ label: string; a: string; b: string }> = [
  { label: "Моногибридное Aa × Aa", a: "Aa", b: "Aa" },
  { label: "Анализирующее Aa × aa", a: "Aa", b: "aa" },
  { label: "Дигибридное AaBb × AaBb", a: "AaBb", b: "AaBb" },
  { label: "AaBb × aabb", a: "AaBb", b: "aabb" },
];

function formatPercent(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} %`;
}

export function PunnettTrainer() {
  const [parentA, setParentA] = useState("Aa");
  const [parentB, setParentB] = useState("Aa");
  const [submitted, setSubmitted] = useState<{ a: string; b: string }>({ a: "Aa", b: "Aa" });

  const result: PunnettResult = useMemo(
    () => solvePunnett({ parentA: submitted.a, parentB: submitted.b }),
    [submitted],
  );

  function solve(a: string, b: string) {
    setParentA(a);
    setParentB(b);
    setSubmitted({ a, b });
  }

  function submit() {
    setSubmitted({ a: parentA.trim(), b: parentB.trim() });
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <Grid3x3 className="h-5 w-5 text-[var(--primary)]" />
          Решётка Пеннета
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Введите генотипы родителей (1–2 гена, например Aa или AaBb) и получите гаметы, решётку
          Пеннета, расщепление по генотипам и фенотипам при полном доминировании.
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Родитель 1
            </span>
            <input
              value={parentA}
              onChange={(event) => setParentA(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Aa"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wider outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Родитель 2
            </span>
            <input
              value={parentB}
              onChange={(event) => setParentB(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Aa"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wider outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => solve(preset.a, preset.b)}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={submit}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white"
          >
            <FlaskConical className="h-4 w-4" /> Скрестить
          </button>
          <button
            type="button"
            onClick={() => solve("Aa", "Aa")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-bold text-slate-700"
          >
            <RotateCcw className="h-4 w-4" /> Сбросить
          </button>
        </div>
      </div>

      {!result.ok ? (
        <div className="rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm font-semibold text-[var(--status-warn-fg)]">
          {result.error}
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Шаг 1. Гаметы родителей
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Каждый родитель даёт по одной аллели из каждой пары. У родителя 1 — {result.gametesA.length}{" "}
              варианта гамет, у родителя 2 — {result.gametesB.length}, всего возможных потомков:{" "}
              {result.offspringCount}.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="text-slate-500">Гаметы 1:</span>
              {result.gametesA.map((gamete) => (
                <span
                  key={`a-${gamete}`}
                  className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-[var(--primary-dark)]"
                >
                  {gamete}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="text-slate-500">Гаметы 2:</span>
              {result.gametesB.map((gamete) => (
                <span
                  key={`b-${gamete}`}
                  className="rounded-full bg-[var(--status-ok-bg)] px-3 py-1 text-[var(--status-ok-fg)]"
                >
                  {gamete}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Шаг 2. Решётка Пеннета
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              По строкам — гаметы родителя 1, по столбцам — родителя 2. В клетках — генотипы
              потомков.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-64 border-collapse text-center text-sm">
                <thead>
                  <tr>
                    <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                      ×
                    </th>
                    {result.gametesB.map((gamete) => (
                      <th
                        key={`col-${gamete}`}
                        className="border border-slate-200 bg-[var(--status-ok-bg)] px-3 py-2 font-bold text-[var(--status-ok-fg)]"
                      >
                        {gamete}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.grid.map((row, rowIndex) => (
                    <tr key={`row-${result.gametesA[rowIndex]}`}>
                      <th className="border border-slate-200 bg-[var(--primary-soft)] px-3 py-2 font-bold text-[var(--primary-dark)]">
                        {result.gametesA[rowIndex]}
                      </th>
                      {row.map((cell) => (
                        <td
                          key={`${cell.gameteA}-${cell.gameteB}`}
                          className="border border-slate-200 px-3 py-2 font-bold text-slate-800"
                        >
                          {cell.genotype}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                <Sigma className="h-4 w-4" /> Шаг 3а. Расщепление по генотипам
              </h3>
              <ul className="mt-3 space-y-2">
                {result.genotypes.map((item) => (
                  <li
                    key={item.genotype}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2 text-sm"
                  >
                    <span className="font-bold text-slate-800">{item.genotype}</span>
                    <span className="text-slate-600">
                      {item.count}/{result.offspringCount} · {formatPercent(item.probability)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                <Sigma className="h-4 w-4" /> Шаг 3б. Расщепление по фенотипам
              </h3>
              <ul className="mt-3 space-y-2">
                {result.phenotypes.map((item) => (
                  <li
                    key={item.phenotype}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2 text-sm"
                  >
                    <span>
                      <span className="font-bold text-slate-800">{item.phenotype}</span>
                      <span className="ml-2 text-xs text-slate-500">{item.description}</span>
                    </span>
                    <span className="whitespace-nowrap text-slate-600">
                      {item.count}/{result.offspringCount} · {formatPercent(item.probability)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
              <p>
                Расчёт основан на законах Менделя: правило единообразия первого поколения, закон
                расщепления (3:1 при моногибридном скрещивании) и закон независимого
                комбинирования (9:3:3:1 при дигибридном) — при полном доминировании.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default PunnettTrainer;
