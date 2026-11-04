"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FlaskConical } from "lucide-react";
import {
  moduleHref,
  modulesForSubject,
  relationFor,
  resolveSubjectAreaKey,
  subjectAreaName,
} from "@/lib/learning/modules";
import { readRuns, summarizeRuns, type SimulationRun } from "@/lib/learning/progress";

/** Модели, применимые к предмету: одна реализация, контекст из дисциплины. */
export default function SubjectSimulations({ slug, name }: { slug?: string | null; name?: string | null }) {
  const areaKey = useMemo(() => resolveSubjectAreaKey({ slug, name }), [slug, name]);
  const simulations = useMemo(
    () => modulesForSubject(areaKey, { functions: ["simulation"] }),
    [areaKey],
  );

  const [runs, setRuns] = useState<SimulationRun[]>([]);
  useEffect(() => {
    setRuns(readRuns());
  }, []);

  const summary = useMemo(() => summarizeRuns(runs), [runs]);

  if (!areaKey || !simulations.length) return null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FlaskConical className="h-5 w-5 text-[var(--primary)]" />
            Интерактивные модели
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Подобраны для {subjectAreaName(areaKey).toLowerCase()}. Результаты сохраняются на этом
            устройстве и не зависят от того, из какого предмета открыта модель.
          </p>
        </div>
        <Link
          href={`/labs/simulations?subject=${encodeURIComponent(areaKey)}`}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:border-[var(--primary)]"
        >
          Все симуляции
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {simulations.map((module) => {
          const slugValue = module.simulationSlug;
          if (!slugValue) return null;
          const best = summary.bestBySlug[slugValue];
          const relation = relationFor(module, areaKey);
          return (
            <Link
              key={module.id}
              href={moduleHref(module, { subjectKey: areaKey })}
              className="group flex items-start justify-between gap-2 rounded-xl border border-[var(--border)] p-3 hover:border-[var(--primary)]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{module.title}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {best === undefined ? "Ещё не проходили" : `Лучший результат: ${best}%`}
                </span>
                {relation?.reason ? (
                  <span className="mt-1 block text-[11px] leading-4 text-[var(--muted)]">{relation.reason}</span>
                ) : null}
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
