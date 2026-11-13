"use client";

/**
 * «Слабые места» — темы с прогрессом ниже 70% (из /academic/state) плюс
 * рекомендации-долги. Каждая тема ведёт в предмет (вкладка тестов/тренажёров).
 */
import Link from "next/link";
import { Target } from "lucide-react";
import type { AcademicState } from "@/lib/api/types";

export function WeakTopics({ academic }: { academic: AcademicState | null }) {
  const weak = (academic?.weak_topics ?? []).slice(0, 6);
  const debts = (academic?.debts ?? []).slice(0, 4);
  if (!weak.length && !debts.length) return null;

  return (
    <section className="card p-4">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Target className="h-4 w-4 text-[var(--status-warn-fg)]" /> Слабые места
      </h2>
      <p className="mt-0.5 text-xs text-[var(--muted)]">Автоматически: темы с прогрессом ниже 70% и академические долги</p>
      {weak.length ? (
        <ul className="mt-3 space-y-1.5">
          {weak.map((topic, index) => {
            const percent = Number(topic.percent ?? 0);
            return (
              <li key={topic.topic_id || index} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{topic.topic_name || "Тема"}</div>
                  <div className="text-xs text-[var(--muted)]">{topic.subject_name || ""}</div>
                </div>
                <span className={"shrink-0 rounded-full px-2.5 py-1 text-xs font-bold " + (percent < 40 ? "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]" : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]")}>
                  {Math.round(percent)}%
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {debts.length ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--status-critical-bg)] px-3 py-2.5 text-sm text-[var(--status-critical-fg)]">
          <b>Долги:</b>{" "}
          {debts.map((debt, index) => (
            <span key={debt.id || index}>{(debt.subject_name || "Предмет") + (debt.note ? " — " + debt.note : "")}{index < debts.length - 1 ? "; " : ""}</span>
          ))}
          {" "}
          <Link href="/study#assignments" className="font-semibold underline">закрыть в отработках →</Link>
        </div>
      ) : null}
    </section>
  );
}
