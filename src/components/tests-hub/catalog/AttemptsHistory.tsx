"use client";

import { History } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { attemptStatusText } from "./model";
import type { TestsCatalogController } from "./useTestsCatalog";

/** Вкладка «История попыток»: последние попытки по всем предметам. */
export function AttemptsHistory({ page }: { page: TestsCatalogController }) {
  const { attempts, attemptsError, attemptsLoading, reloadAttempts } = page;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">История попыток</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Последние завершённые и незавершённые попытки по всем предметам.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{attempts.length}</span>
      </div>

      {attemptsError && (
        <div className="mt-4">
          <ErrorState
            compact
            title="История попыток не загрузилась"
            message={attemptsError}
            retry={() => reloadAttempts()}
          />
        </div>
      )}

      {attemptsLoading ? (
        <div className="mt-4">
          <SkeletonList count={3} rows={1} />
        </div>
      ) : attempts.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            compact
            icon={History}
            title="Попыток пока нет"
            description="Начните с любого банка во вкладке «Тесты и банки» — результат появится здесь сразу после первой попытки."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {attempts.map((attempt: any) => (
            <div key={String(attempt.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-slate-50 px-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800">{String(attempt.test_title || "Тест")}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {attempt.started_at ? String(attempt.started_at).slice(0, 16).replace("T", " ") : "—"} · {attemptStatusText(attempt.status)}
                </div>
              </div>
              <div className="font-bold text-indigo-700">
                {attempt.percent != null ? `${Math.round(Number(attempt.percent))}%` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
