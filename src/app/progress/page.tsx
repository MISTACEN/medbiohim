"use client";

import { useEffect, useState } from "react";
import { getProgress } from "@/lib/api";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { Award, Loader2 } from "lucide-react";
import { ServiceNoticeBanner } from "@/components/ui/ServiceNoticeBanner";

type ProgressPayload = {
  overall_pct?: number;
  homework?: { total: number; done: number; percent?: number; items?: unknown[] };
  tests?: { attempts: number; finished?: number; avg_score?: number | null; items?: unknown[] };
  note?: string;
  degraded?: boolean;
  service_notice?: string;
  service_notice_title?: string;
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
            degraded: true,
            service_notice: "Данные прогресса временно недоступны. Повторите попытку позже.",
            service_notice_title: "Прогресс недоступен",
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
        <p className="page-subtitle">Реальный расчёт по ДЗ и тестам</p>
      </div>

      {(data?.degraded || data?.service_notice || data?.note === "degraded") && (
        <ServiceNoticeBanner
          title={data?.service_notice_title || "Что-то пошло не так"}
          message={
            data?.service_notice ||
            "Раздел прогресса временно работает в ограниченном режиме. Скоро всё починят."
          }
        />
      )}

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

      {data && !data.degraded && !data.service_notice && (
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
              {tests.finished ?? 0}/{tests.attempts} завершено
            </p>
          </div>
          <div className="card flex flex-col items-center justify-center py-6">
            <RadialProgress value={hwPct} label="ДЗ" color="#F59E0B" />
            <p className="mt-2 text-xs text-slate-500">
              {hw.done}/{hw.total} сдано
            </p>
          </div>
        </div>
      )}

      <div className="card flex items-start gap-3">
        <Award className="mt-0.5 h-5 w-5 text-indigo-600" />
        <div>
          <div className="font-semibold">Как считается</div>
          <p className="mt-1 text-sm text-slate-500">
            Общий прогресс — среднее по домашним заданиям и тестам. Данные с backend;
            при сбое показывается ограниченный режим.
          </p>
        </div>
      </div>
    </div>
  );
}
