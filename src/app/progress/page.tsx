"use client";

import Link from "next/link";
import { getProgress, getProgressSummary } from "@/lib/api";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { Award, Target } from "lucide-react";
import { ServiceNoticeBanner } from "@/components/ui/ServiceNoticeBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard, SkeletonCards } from "@/components/ui/Skeleton";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";

type SubjectSummary = {
  subject_id: string;
  name: string | null;
  slug: string | null;
  test_attempts: number;
  test_accuracy: number | null;
  trainer_answered: number;
  trainer_accuracy: number | null;
  attendance?: { present: number; total: number; percent: number } | null;
  srs?: { total: number; due: number };
};

type SummaryPayload = {
  subjects: SubjectSummary[];
  focus: Array<{ subject_id: string; name: string | null; slug: string | null; accuracy: number; source: string }>;
  activity30: Array<{ date: string; count: number }>;
  srs: { total: number; due: number };
};

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

  const { data, loading } = useApiRequest<{
    payload: ProgressPayload | null;
    error: string | null;
  }>(async () => {
    try {
      const res = await getProgress(undefined, user?.groupId);
      if (res.ok) return { payload: res.data as ProgressPayload, error: null };
      return {
        payload: {
          degraded: true,
          service_notice: "Данные прогресса временно недоступны. Повторите попытку позже.",
          service_notice_title: "Прогресс недоступен",
        },
        error: describeApiError(res.error),
      };
    } catch {
      return { payload: null, error: "Не удалось загрузить прогресс" };
    }
  }, [user?.groupId], { enabled: !authLoading });

  const payload = data?.payload ?? null;
  const loadError = data?.error ?? null;

  // FA3: сводка v2 — независимый запрос; сбой не роняет базовые карточки.
  const { data: summaryData, loading: summaryLoading } = useApiRequest<{ summary: SummaryPayload | null; error: string | null }>(
    async (signal) => {
      const res = await getProgressSummary({ signal });
      return res.ok ? { summary: res.data as SummaryPayload, error: null } : { summary: null, error: describeApiError(res.error) };
    },
    [user?.groupId],
    { enabled: !authLoading }
  );
  const summary = summaryData?.summary ?? null;

  const hw = payload?.homework;
  const tests = payload?.tests;
  const overall = payload?.overall_pct ?? null;
  const hasProgressData = Boolean(payload && !payload.degraded && !payload.service_notice && overall !== null && hw && tests);
  const hwPct = hw?.percent ?? (hw && hw.total ? Math.round((hw.done / hw.total) * 100) : 0);
  const testPct = tests && tests.attempts > 0 ? Math.round(((tests.finished ?? 0) / tests.attempts) * 100) : 0;
  const avg = tests?.avg_score != null ? Math.round(Number(tests.avg_score)) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Прогресс</h1>
        <p className="page-subtitle">Реальный расчёт по ДЗ и тестам</p>
      </div>

      {(payload?.degraded || payload?.service_notice || payload?.note === "degraded") && (
        <ServiceNoticeBanner
          title={payload?.service_notice_title || "Что-то пошло не так"}
          message={
            payload?.service_notice ||
            "Раздел прогресса временно работает в ограниченном режиме. Скоро всё починят."
          }
        />
      )}

      {loading && <SkeletonCards count={4} />}
      {loadError && (
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">
          {loadError}
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

      {!loading && payload && !payload.degraded && !payload.service_notice && !hasProgressData && (
        <EmptyState
          icon={Target}
          title="Пока недостаточно данных для расчёта прогресса"
          description="Как только появятся попытки тестов, сданные ДЗ и отметки посещаемости — здесь появится расчёт по предметам."
        />
      )}

      {/* FA3: сводка «что подтянуть» из попыток, тренажёров, посещаемости и SRS */}
      {summaryLoading && <SkeletonCard height={120} />}
      {summary && (
        <>
          {summary.focus.length > 0 && (
            <div className="card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Target className="h-5 w-5 text-[var(--status-critical-fg)]" />
                Что подтянуть
              </h2>
              <ul className="mt-3 space-y-2">
                {summary.focus.map((item) => (
                  <li key={item.subject_id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-[var(--status-critical-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-critical-fg)] tabular-nums">{item.accuracy}%</span>
                    <Link href={`/subjects/${item.slug || item.subject_id}`} className="font-medium text-indigo-700 hover:underline">
                      {item.name || "Предмет"}
                    </Link>
                    <span className="text-xs text-slate-500">по {item.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.subjects.length > 0 && (
            <div className="card p-5">
              <h2 className="text-lg font-bold text-slate-900">По предметам</h2>
              <div className="mt-3 space-y-4">
                {summary.subjects.map((s) => {
                  const accuracy = s.test_accuracy ?? s.trainer_accuracy;
                  return (
                    <div key={s.subject_id}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <Link href={`/subjects/${s.slug || s.subject_id}`} className="font-medium text-slate-800 hover:text-indigo-700">
                          {s.name || "Предмет"}
                        </Link>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {s.test_accuracy != null && <span>тесты: {s.test_accuracy}% ({s.test_attempts})</span>}
                          {s.trainer_accuracy != null && <span>тренажёр: {s.trainer_accuracy}% ({s.trainer_answered})</span>}
                          {s.attendance && <span>посещаемость: {s.attendance.percent}% ({s.attendance.present}/{s.attendance.total}, самоотчёт)</span>}
                          {s.srs && s.srs.due > 0 && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[var(--status-warn-fg)]">SRS к повтору: {s.srs.due}</span>}
                        </span>
                      </div>
                      {accuracy != null && (
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={"h-full rounded-full " + (accuracy >= 80 ? "bg-[var(--status-ok-fg)]" : accuracy >= 50 ? "bg-[var(--status-warn-fg)]" : "bg-[var(--status-critical-fg)]")}
                            style={{ width: `${Math.max(3, accuracy)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {summary.activity30.some((day) => day.count > 0) && (
            <div className="card p-5">
              <h2 className="text-lg font-bold text-slate-900">Активность за 30 дней</h2>
              <p className="mt-1 text-xs text-slate-500">Попытки тестов и ответы в тренажёре по дням.</p>
              <div className="mt-3 flex h-16 items-end gap-1" role="img" aria-label="Активность за 30 дней">
                {summary.activity30.map((day) => {
                  const max = Math.max(...summary.activity30.map((d) => d.count), 1);
                  const height = day.count ? Math.max(8, Math.round((day.count / max) * 100)) : 4;
                  return (
                    <div
                      key={day.date}
                      className={"flex-1 rounded-t " + (day.count ? "bg-indigo-500" : "bg-slate-100")}
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.count}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {summary.srs.total > 0 && (
            <div className="card p-4 text-sm text-slate-600">
              Карточки SRS: всего {summary.srs.total}, к повтору{" "}
              <b className={summary.srs.due ? "text-[var(--status-warn-fg)]" : "text-[var(--status-ok-fg)]"}>{summary.srs.due}</b> —{" "}
              <Link href="/cards" className="font-semibold text-indigo-600">повторить в карточках</Link>.
            </div>
          )}
        </>
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
