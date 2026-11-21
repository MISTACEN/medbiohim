"use client";

/**
 * Статистика диагностикума: общий результат, разбивка по режимам и разделам,
 * слабые разделы и очередь повторения.
 *
 * Ошибки не превращаются в отдельный «второй тренажёр»: это deep-link `?cards=`
 * в существующий тренажёр гистологии.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, RotateCcw } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import {
  getDiagnosticumMistakes,
  getDiagnosticumStats,
  type DiagnosticumMistake,
  type DiagnosticumStats as Stats,
} from "@/lib/diagnosticum-api";

export function DiagnosticumStats({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [mistakes, setMistakes] = useState<DiagnosticumMistake[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([getDiagnosticumStats(), getDiagnosticumMistakes()])
      .then(([statsResult, mistakesResult]) => {
        if (!alive) return;
        if (statsResult.ok) {
          setStats(statsResult.data);
          setError(null);
        } else {
          setError(describeApiError(statsResult.error));
        }
        if (mistakesResult.ok) setMistakes(mistakesResult.data.items || []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) {
    return <p className="text-sm text-slate-400">Статистика недоступна: {error}</p>;
  }
  if (!stats) {
    return <div className="h-20 animate-pulse rounded-2xl bg-slate-100" aria-busy="true" />;
  }
  if (!stats.answered) {
    return (
      <div
        className="rounded-2xl border border-dashed p-5 text-center text-sm text-slate-500"
        style={{ borderColor: "var(--border)" }}
      >
        <BarChart3 className="mx-auto mb-2 h-6 w-6 text-slate-300" />
        Статистика появится после первых ответов в диагностикуме.
      </div>
    );
  }

  const repeatHref =
    "/trainers/feed/histology?cards=" + encodeURIComponent(mistakes.map((item) => item.card_id).join(","));

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          Мой диагностикум
        </h2>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">ответов: {stats.answered}</span>
          <span className="rounded-full bg-[var(--status-ok-bg)] px-3 py-1 text-[var(--status-ok-fg)]">
            верно: {stats.correct_rate}%
          </span>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">
            средний балл: {stats.avg_score}
          </span>
          {stats.hints ? (
            <span className="rounded-full bg-[var(--status-warn-bg)] px-3 py-1 text-[var(--status-warn-fg)]">
              подсказок: {stats.hints}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {stats.by_section.map((item) => (
          <div key={item.section} className="text-sm">
            <div className="flex justify-between text-slate-600">
              <span className="truncate pr-2">{item.section}</span>
              <span className="tabular-nums">
                {item.correct}/{item.total}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={
                  "h-full rounded-full " +
                  (item.correct_rate >= 80
                    ? "bg-[var(--status-ok-fg)]"
                    : item.correct_rate >= 50
                      ? "bg-[var(--status-warn-fg)]"
                      : "bg-[var(--status-critical-fg)]")
                }
                style={{ width: `${Math.max(3, item.correct_rate)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {stats.weak_sections.length ? (
        <p className="rounded-xl bg-[var(--status-warn-bg)] px-3 py-2 text-xs text-[var(--status-warn-fg)]">
          Стоит повторить: {stats.weak_sections.join(", ")}. Выберите раздел выше и начните задание.
        </p>
      ) : null}

      {mistakes.length ? (
        <div className="rounded-xl bg-orange-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-orange-900">
              Ошибок на повторение: {mistakes.length}
            </span>
            <Link
              href={repeatHref}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
            >
              <RotateCcw className="h-4 w-4" /> Повторить ошибки
            </Link>
          </div>
          <p className="mt-1 text-xs text-orange-800">
            Карточки, где диагностика не сошлась. Откроются в тренажёре гистологии с уже выбранным
            набором — подписи, структуры и методичка на месте.
          </p>
        </div>
      ) : null}
    </div>
  );
}
