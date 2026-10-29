"use client";

import { useEffect, useState } from "react";
import { getProgress } from "@/lib/api";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { Award, Loader2 } from "lucide-react";
import { ServiceNoticeBanner } from "@/components/ui/ServiceNoticeBanner";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";

type ProgressPayload = {
  overall_pct?: number | null;
  homework?: { total: number; done: number; percent?: number; items?: unknown[] };
  tests?: { attempts: number; finished?: number; avg_score?: number | null; items?: unknown[] };
  note?: string;
  degraded?: boolean;
  service_notice?: string;
  service_notice_title?: string;
};

export default function ProgressPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading) return;
      setLoading(true);
      try {
        const res = await getProgress(undefined, user?.groupId);
        if (cancelled) return;
        if (res.ok) {
          setData(res.data as ProgressPayload);
          setError(null);
        } else {
          setError(describeApiError(res.error));
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
  }, [authLoading, user?.groupId]);

  const hw = data?.homework;
  const tests = data?.tests;
  const overall = data?.overall_pct ?? null;
  const hasProgressData = Boolean(data && !data.degraded && !data.service_notice && overall !== null && hw && tests);
  const hwPct = hw?.percent ?? (hw && hw.total ? Math.round((hw.done / hw.total) * 100) : 0);
  const testPct = tests && tests.attempts > 0 ? Math.round(((tests.finished ?? 0) / tests.attempts) * 100) : 0;
  const avg = tests?.avg_score != null ? Math.round(Number(tests.avg_score)) : null;

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

      {hasProgressData && hw && tests && overall !== null && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card flex flex-col items-center justify-center py-6">
            <RadialProgress value={overall} label="общий" />
          </div>
          <div className="card flex flex-col items-center justify-center py-6">
            {avg !== null ? <RadialProgress value={avg} label="балл" color="#10B981" /> : <div className="text-3xl font-bold text-slate-400">—</div>}
            <p className="mt-2 text-xs text-slate-500">{avg !== null ? "среднее по тестам" : "пока нет оценённых попыток"}</p>
          </div>
          <div className="card flex flex-col items-center justify-center py-6">
            {tests.attempts > 0 ? <RadialProgress value={testPct} label="тесты" color="#6366F1" /> : <div className="text-3xl font-bold text-slate-400">—</div>}
            <p className="mt-2 text-xs text-slate-500">
              {tests.finished ?? 0}/{tests.attempts} завершено
            </p>
          </div>
          <div className="card flex flex-col items-center justify-center py-6">
            {hw.total > 0 ? <RadialProgress value={hwPct} label="ДЗ" color="#F59E0B" /> : <div className="text-3xl font-bold text-slate-400">—</div>}
            <p className="mt-2 text-xs text-slate-500">
              {hw.total > 0 ? String(hw.done) + "/" + String(hw.total) + " сдано" : "пока нет заданий"}
            </p>
          </div>
        </div>
      )}

      {!loading && data && !data.degraded && !data.service_notice && !hasProgressData && (
        <div className="card text-sm text-slate-500">Пока недостаточно данных для расчёта прогресса.</div>
      )}

      <div className="card flex items-start gap-3">
        <Award className="mt-0.5 h-5 w-5 text-indigo-600" />
        <div>
          <div className="font-semibold">Как считается</div>
          <p className="mt-1 text-sm text-slate-500">
            Общий показатель повторяет расчёт backend: выполнение домашних заданий и доля завершённых попыток тестирования. При отсутствии попыток или заданий соответствующая карточка показывает прочерк, а при ошибке API значения не подменяются нулями.
          </p>
        </div>
      </div>
    </div>
  );
}
