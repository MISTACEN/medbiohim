"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, RotateCcw, TrendingUp } from "lucide-react";
import { useApiRequest } from "@/hooks/useApiRequest";
import { getTrainerStats } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ErrorState } from "@/components/ui/ErrorState";

type TopicStat = { topic: string; attempts: number; correct: number; accuracy: number | null };
type Mistake = { card_id: string; topic: string | null };

/**
 * FA6: личная статистика тренажёра — точность по темам из уже пишущихся
 * ответов и очередь «повторить ошибки» (ссылка открывает тренажёр сразу
 * на этих карточках, deep-link ?cards= из атласа).
 */
export function TrainerStatsCard() {
  const [cardLimit] = useState(20);
  const { data, loading, error, reload } = useApiRequest(async (signal) => {
    const res = await getTrainerStats({ signal });
    return res.ok ? res.data : { error: describeApiError(res.error) };
  }, []);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-busy="true" />;
  }
  if (error || !data || (data as any).error) {
    return <ErrorState message={String((data as any)?.error || error || "Не удалось загрузить статистику")} retry={reload} />;
  }

  const summary = (data as any).summary || { answered: 0, correct: 0, accuracy: null, cards: 0 };
  const byTopic: TopicStat[] = (data as any).by_topic || [];
  const mistakes: Mistake[] = (data as any).mistakes || [];

  if (!summary.answered) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500" style={{ borderColor: "var(--border)" }}>
        <BarChart3 className="mx-auto mb-2 h-6 w-6 text-slate-300" />
        Статистика появится после первых ответов в тренажёре.
      </div>
    );
  }

  const weakest = byTopic.filter((t) => t.accuracy != null).slice(0, 5);
  const mistakeIds = mistakes.slice(0, cardLimit).map((m) => m.card_id);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          Моя статистика
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">ответов: {summary.answered}</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
            точность: {summary.accuracy != null ? summary.accuracy + "%" : "—"}
          </span>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">карточек: {summary.cards}</span>
        </div>
      </div>

      {weakest.length > 0 && (
        <div className="mt-4 space-y-2">
          {weakest.map((topic) => {
            const accuracy = topic.accuracy ?? 0;
            return (
              <div key={topic.topic} className="text-sm">
                <div className="flex justify-between text-slate-600">
                  <span className="truncate pr-2">{topic.topic}</span>
                  <span className="tabular-nums">{accuracy}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={"h-full rounded-full " + (accuracy >= 80 ? "bg-emerald-500" : accuracy >= 50 ? "bg-amber-500" : "bg-rose-500")}
                    style={{ width: `${Math.max(3, accuracy)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mistakes.length > 0 && (
        <div className="mt-4 rounded-xl bg-orange-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-orange-900">
              Ошибок на повторение: {mistakes.length}
            </span>
            <Link
              href={"/trainers/feed/histology?cards=" + encodeURIComponent(mistakeIds.join(","))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
            >
              <RotateCcw className="h-4 w-4" /> Повторить ошибки
            </Link>
          </div>
          <p className="mt-1 text-xs text-orange-800">
            Карточки, где последний ответ был неверным или пропущенным. Самые старые ошибки — первыми.
          </p>
        </div>
      )}
    </div>
  );
}
