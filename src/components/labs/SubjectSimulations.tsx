"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FlaskConical } from "lucide-react";
import { SIMULATIONS } from "@/lib/sim/catalog";
import { resolveSubjectAdapter } from "@/lib/learning/subjects";
import { readRuns, summarizeRuns, type SimulationRun } from "@/lib/learning/progress";

/** Компактный блок симуляций на странице предмета + локальный прогресс. */
export default function SubjectSimulations({ slug }: { slug: string }) {
  const simulations = useMemo(() => {
    const allowed = new Set(resolveSubjectAdapter(slug).simulations);
    return SIMULATIONS.filter((simulation) => allowed.has(simulation.slug));
  }, [slug]);

  const [runs, setRuns] = useState<SimulationRun[]>([]);
  useEffect(() => {
    setRuns(readRuns());
  }, []);

  const summary = useMemo(() => summarizeRuns(runs), [runs]);

  if (!simulations.length) return null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FlaskConical className="h-5 w-5 text-[var(--primary)]" />
            Интерактивные модели
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Меняйте параметры и проверяйте механизм. Результаты сохраняются на этом устройстве.
          </p>
        </div>
        <Link
          href={`/labs/simulations?subject=${encodeURIComponent(slug)}`}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:border-[var(--primary)]"
        >
          Все симуляции
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {simulations.map((simulation) => {
          const best = summary.bestBySlug[simulation.slug];
          return (
            <Link
              key={simulation.slug}
              href={`/labs/simulations?slug=${encodeURIComponent(simulation.slug)}&subject=${encodeURIComponent(slug)}`}
              className="group flex items-start justify-between gap-2 rounded-xl border border-[var(--border)] p-3 hover:border-[var(--primary)]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{simulation.title}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {best === undefined ? "Ещё не проходили" : `Лучший результат: ${best}%`}
                </span>
              </span>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>

      {summary.runs > 0 ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Пройдено запусков: {summary.runs} · средний результат {summary.averagePercent}%.
        </p>
      ) : null}
    </section>
  );
}
