"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { readRuns, summarizeRuns, type SimulationSummary } from "@/lib/learning/progress";

/** Локальный прогресс симуляций в общей странице прогресса. */
export default function SimulationProgressCard() {
  const [summary, setSummary] = useState<SimulationSummary | null>(null);

  useEffect(() => {
    setSummary(summarizeRuns(readRuns()));
  }, []);

  if (!summary) return null;

  if (summary.runs === 0) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="h-4 w-4 text-[var(--primary)]" /> Симуляции
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Пока нет пройденных моделей: результат появится после проверки понимания.
          </p>
        </div>
        <Link
          href="/labs/simulations"
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:border-[var(--primary)]"
        >
          Открыть симуляции
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="h-4 w-4 text-[var(--primary)]" /> Симуляции
        </p>
        <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]">
          сохраняется на устройстве
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span>
          запусков: <b>{summary.runs}</b>
        </span>
        <span>
          средний результат: <b>{summary.averagePercent}%</b>
        </span>
        <span>
          предметов: <b>{summary.subjects}</b>
        </span>
      </div>
      <Link
        href="/labs/simulations"
        className="mt-3 inline-block text-xs font-semibold text-[var(--primary)] hover:underline"
      >
        Продолжить в симуляциях →
      </Link>
    </div>
  );
}
