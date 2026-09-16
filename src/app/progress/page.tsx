"use client";

import { useEffect, useState } from "react";
import { getProgress } from "@/lib/api";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { Award, Loader2 } from "lucide-react";

type ProgressPayload = {
  overall_pct?: number;
  homework?: { total: number; done: number; percent?: number; items?: unknown[] };
  tests?: { attempts: number; finished?: number; avg_score?: number | null; items?: unknown[] };
  note?: string;
};

export default function ProgressPage() {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getProgress();
        if (cancelled) return;
        if (res.ok) {
          setData(res.data as ProgressPayload);
          setError(null);
        } else {
          setError(res.error.message);
          setData({
            overall_pct: 0,
            homework: { total: 0, done: 0, percent: 0, items: [] },
            tests: { attempts: 0, finished: 0, avg_score: null, items: [] },
          });
        }
      } catch {
        if (!cancelled) setError("Не удалось загрузить прогресс");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const overall = data?.overall_pct ?? 0;
  const hw = data?.homework ?? { total: 0, done: 0, percent: 0 };
  const tests = data?.tests ?? { attempts: 0, finished: 0, avg_score: null };
  const hwPct = hw.percent ?? (hw.total ? Math.round((hw.done / hw.total) * 100) : 0);
  const testPct =
    tests.attempts > 0
      ? Math.round(((tests.finished ?? 0) / tests.attempts) * 100)
      : 0;
  const avg = tests.avg_score != null ? Math.round(Number(tests.avg_score)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Прогресс</h1>
        <p className="page-subtitle">
          Реальный расчёт по ДЗ и тестам
          {data?.note ? ` · ${data.note}` : ""}
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex flex-col items-center justify-center py-6">
          <RadialProgress value={overall} label="общий" />
        </div>
        <div className="card flex flex-col items-center justify-center py-6">
          <RadialProgress value={avg} label="балл" color="#10B981" />
          <p className="mt-2 text-xs text-slate-500">среднее по тестам</p>
        </div>
        <div className="card flex flex-col items-center justify-center py-6">
          <RadialProgress value={testPct} label="тесты" color="#6366F1" />
          <p className="mt-2 text-xs text-slate-500">
            {tests.finished ?? 0}/{tests.attempts}
          </p>
        </div>
        <div className="card flex flex-col items-center justify-center py-6">
          <RadialProgress value={hwPct} label="ДЗ" color="#8B5CF6" />
          <p className="mt-2 text-xs text-slate-500">
            {hw.done}/{hw.total}
          </p>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <Award className="h-5 w-5 text-primary" /> Сводка
        </div>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            Домашние задания: <strong>{hw.done}</strong> из {hw.total} ({hwPct}%)
          </li>
          <li>
            Попытки тестов: <strong>{tests.attempts}</strong>, завершено{" "}
            <strong>{tests.finished ?? 0}</strong>
          </li>
          <li>
            Средний балл:{" "}
            <strong>{tests.avg_score != null ? tests.avg_score : "—"}</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}
