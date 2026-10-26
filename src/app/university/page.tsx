"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import FeedList from "@/components/university/FeedList";
import { ImportsProvider } from "@/components/university/ImportsProvider";
import SavedImports from "@/components/university/SavedImports";
import SchedulePanel from "@/components/university/SchedulePanel";
import ServiceGrid from "@/components/university/ServiceGrid";
import type { UniversityOverview } from "@/components/university/types";
import { formatDateTime } from "@/components/university/format";
import {
  AlertCircle,
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

export default function UniversityPage() {
  const [overview, setOverview] = useState<UniversityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/university", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as UniversityOverview | null;
      if (!data) throw new Error(`HTTP ${response.status}`);
      // §2: `ok:true` with per-section errors; `ok:false` only when nothing at all was produced.
      if (data.ok === false && !data.feeds && !data.schedule) throw new Error(data.error || `HTTP ${response.status}`);
      setOverview(data);
      if (data.ok === false) setError(data.error || "Публичные данные ФЕСМУ временно недоступны");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить данные ФЕСМУ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const schedule = overview?.schedule;
  const portal = overview?.portal;

  return (
    <ImportsProvider>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <header className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm">
                <Landmark className="h-3.5 w-3.5" />
                Университетский хаб
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                ДВГМУ и учёба — в одном месте
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Быстрый вход в официальные ресурсы, публичное расписание, новости и тестирование.
                MEDBIOHIM остаётся удобной учебной платформой, а первоисточник всегда открывается рядом.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={portal?.url || "https://www.fesmu.ru/"} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-2">
                  Официальный сайт <ArrowUpRight className="h-4 w-4" />
                </a>
                <a href={portal?.eios_url || "https://eios.fesmu.ru/WebApp/#/"} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
                  Войти в ЕИОС <ExternalLink className="h-4 w-4" />
                </a>
                <Link href="/university/saved" className="btn-secondary inline-flex items-center gap-2">
                  Сохранённое <Bookmark className="h-4 w-4" />
                </Link>
                <Link href="/university/import" className="btn-secondary inline-flex items-center gap-2">
                  Импорт тестов <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm shadow-sm lg:max-w-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Без подмены источника
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Официальные данные помечены ссылкой на ФЕСМУ. Мы не выдаём локальные проверки за
                production-проверенные сервисы вуза и не сохраняем пароль ЕИОС.
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Данные портала получены {formatDateTime(overview?.fetched_at)}.
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Публичные данные ФЕСМУ временно недоступны</div>
              <div className="mt-1 text-xs">{error}. Официальные ссылки ниже продолжают работать.</div>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Повторить
            </button>
          </div>
        )}

        <ServiceGrid services={overview?.services} fetchedAt={overview?.fetched_at} />

        <SchedulePanel
          faculties={schedule?.faculties}
          indexUrl={schedule?.index_url}
          documents={schedule?.documents}
          note={schedule?.note}
          documentsFetchedAt={schedule?.fetched_at}
          documentsCached={schedule?.cached}
          documentsStale={schedule?.stale}
          documentsError={schedule?.error}
          onRetryDocuments={() => void loadOverview()}
        />

        <FeedList feeds={overview?.feeds} loading={loading && !overview} retrying={loading} onRetry={() => void loadOverview()} />

        <SavedImports />

        <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-violet-900">
                <ExternalLink className="h-5 w-5" /> NeoFamily и Школа Сеченова — внутри предметов
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-violet-900/80">
                Эти платформы не про вуз, а про учебные темы, поэтому их разделы теперь живут на
                странице предмета во вкладке «Платформы»: биология, гистология, физиология и химия
                показывают только свои симуляции и тренажёры.
              </p>
            </div>
            <Link href="/subjects" className="btn-secondary inline-flex items-center gap-2">
              Открыть предметы <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-900">
                <ClipboardCheck className="h-5 w-5" /> Сбор тестов из оригинальной системы
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
                Вопросы собираются только по действию пользователя из его собственной сессии в{" "}
                <a href={portal?.testing_url || "http://test.fesmu.ru:8080/"} target="_blank" rel="noreferrer" className="font-semibold underline">
                  test.fesmu.ru
                </a>
                . Расширение Bridge извлекает текст и варианты, вы отмечаете правильные ответы, затем проверяете JSON
                на странице импорта. Пароль ЕИОС не сохраняется.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-amber-800">
                <span className="rounded-full bg-white/80 px-2.5 py-1">1. Открыть тест</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1">2. Считать вопрос</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1">3. Проверить preview</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1">4. Импортировать</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/university/import" className="btn-primary inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500">
                Открыть импорт <ChevronRight className="h-4 w-4" />
              </Link>
              <a href={portal?.testing_url || "http://test.fesmu.ru:8080/"} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
                Оригинальные тесты <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Info className="h-4 w-4 text-slate-500" /> Что важно знать
          </h2>
          <div className="mt-3 grid gap-3 text-xs leading-relaxed text-slate-600 md:grid-cols-3">
            <p>
              <b className="text-slate-800">Первоисточник.</b> У каждой карточки есть ссылка на ФЕСМУ или внешнюю
              платформу. Если данные расходятся, приоритет у официального сайта.
            </p>
            <p>
              <b className="text-slate-800">Без автоматического входа.</b> MEDBIOHIM не запрашивает пароль ЕИОС и не
              обходит авторизацию, CAPTCHA или платный доступ.
            </p>
            <p>
              <b className="text-slate-800">Сохранение — по вашему действию.</b> Кнопка «Сохранить» доступна после входа
              в MEDBIOHIM и хранит только ссылку и заголовок. Сбой сохранения не влияет на сам хаб.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>Источник официальных данных: {portal?.name || "ДВГМУ"} · получено {formatDateTime(overview?.fetched_at)}</span>
          <div className="flex gap-3">
            <a href={portal?.url || "https://www.fesmu.ru/"} target="_blank" rel="noreferrer" className="hover:text-indigo-600">fesmu.ru</a>
            <a href={portal?.eios_url || "https://eios.fesmu.ru/WebApp/#/"} target="_blank" rel="noreferrer" className="hover:text-indigo-600">eios.fesmu.ru</a>
            <a href={portal?.library_url || "https://elib.fesmu.ru/"} target="_blank" rel="noreferrer" className="hover:text-indigo-600">elib.fesmu.ru</a>
          </div>
        </div>
      </main>
    </ImportsProvider>
  );
}
