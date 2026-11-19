"use client";

/**
 * ИИ-расход (волна 3, п.18): сводка журнала ai_call_log поверх RPC
 * `medbiohim_ai_call_stats` (миграция 20261115_ai_call_log.sql).
 *
 * Агрегаты считает БД — страница только рисует разрезы: день, функция,
 * провайдер, модель. Полный список вызовов не показываем: журнал идёт в БД
 * напрямую и может насчитывать тысячи строк.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Loader2, RefreshCw } from "lucide-react";
import { hasToken } from "@/lib/api";
import { adminAiUsage } from "@/lib/api/admin";
import { describeApiError } from "@/lib/errors";
import { SplitTable, ms, pct, type SplitRow } from "@/components/admin/AiUsageTable";

type UsageStats = {
  days: number;
  totals: SplitRow & { key?: string };
  by_day: SplitRow[];
  by_feature: SplitRow[];
  by_provider: SplitRow[];
  by_model: SplitRow[];
};
type Limits = Record<string, number | null>;

const FEATURE_LABELS: Record<string, string> = {
  tutor_chat: "Ответы тьютора",
  oral_exam: "Устный экзамен",
  notes_file: "Конспект из файла",
  lecture_cloze: "Конспект с пропусками",
  card_pack: "Паки карточек",
  lecture_generate: "Черновики лекций",
  telegram_sort: "Сортировка Telegram",
  diagnostics: "Диагностика провайдеров",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default function AdminAiUsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [limits, setLimits] = useState<Limits>({});
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (window_: number) => {
    if (!hasToken()) return;
    setLoading(true);
    setError("");
    const response = await adminAiUsage(window_);
    setLoading(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    setStats(response.data.stats || null);
    setLimits(response.data.limits || {});
  }, []);

  useEffect(() => {
    void load(7);
  }, [load]);

  if (!hasToken()) {
    return (
      <main className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">ИИ-расход</h1>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </main>
    );
  }

  const todayStart = new Date().setHours(0, 0, 0, 0);
  const dayLabel = (key: string) => {
    const t = new Date(key + "T00:00:00").getTime();
    if (Math.abs(t - todayStart) < DAY_MS / 2) return "сегодня";
    return new Date(key + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  return (
    <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
            <ArrowLeft className="h-4 w-4" /> В админ-панель
          </Link>
          <h1 className="mt-2 inline-flex items-center gap-2 text-2xl font-extrabold">
            <Bot className="h-6 w-6 text-[var(--primary)]" /> ИИ-расход
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Вызовы ИИ-провайдеров по журналу платформы: маршруты, функции, провайдеры, задержки. Пишет воркер с service_role.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => { const next = Number(e.target.value); setDays(next); void load(next); }}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            aria-label="Период"
          >
            <option value={1}>1 день</option>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
          <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={loading} onClick={() => void load(days)}>
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Обновить
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="card p-4 text-sm text-[var(--status-critical-fg)]">
          <b className="block font-semibold">Журнал недоступен</b>
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !stats ? (
        <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Читаем журнал…</p>
      ) : null}

      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Вызовов за {stats.days} дн.</div>
              <div className="mt-1 text-2xl font-bold text-indigo-600">{stats.totals?.calls ?? 0}</div>
            </div>
            <div className="card">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Успешных</div>
              <div className="mt-1 text-2xl font-bold text-[var(--status-ok-fg)]">{pct(stats.totals?.ok ?? 0, stats.totals?.calls ?? 0)}</div>
            </div>
            <div className="card">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Отказы провайдеров</div>
              <div className="mt-1 text-2xl font-bold">{stats.totals?.errors ?? 0}</div>
            </div>
            <div className="card">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Средняя задержка</div>
              <div className="mt-1 text-2xl font-bold">{ms(stats.totals?.avg_latency_ms ?? 0)}</div>
              <div className="text-xs text-slate-400">p95 {ms(stats.totals?.p95_latency_ms ?? 0)}</div>
            </div>
          </div>

          <SplitTable title="По функциям" rows={stats.by_feature || []} labels={FEATURE_LABELS} />
          <SplitTable title="По провайдерам" rows={stats.by_provider || []} />
          <SplitTable title="По моделям" rows={stats.by_model || []} />
          <SplitTable title="По дням" rows={stats.by_day || []} formatters={{ "По дням": dayLabel }} />

          {Object.keys(limits).length ? (
            <div className="card p-4">
              <div className="text-sm font-bold">Суточные квоты</div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                {Object.entries(limits).map(([feature, limit]) => (
                  <span key={feature} className="text-[var(--muted)]">
                    {FEATURE_LABELS[feature] || feature}: <b className="text-[var(--text)]">{limit === null ? "без лимита" : limit}</b>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-xs text-[var(--muted)]">
            «Лимит» — запросы, отклонённые суточной квотой (до провайдера не дошли). Полные записи журнала с attempt-ами — таблица ai_call_log в Supabase (только service_role).
          </p>
        </>
      ) : !error ? (
        <div className="card p-6 text-sm text-[var(--muted)]">
          Журнал пуст: миграция 20261115_ai_call_log не применена или вызовов ещё не было.
        </div>
      ) : null}
    </main>
  );
}
