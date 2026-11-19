"use client";

import Link from "next/link";
import {
  AlertCircle,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import FeedList from "@/components/university/FeedList";
import { ImportsProvider } from "@/components/university/ImportsProvider";
import OzizCatalogSection from "@/components/university/OzizCatalog";
import ExamQuestionsIndex from "@/components/university/ExamQuestionsIndex";
import DepartmentsCatalog from "@/components/university/DepartmentsCatalog";
import SavedImports from "@/components/university/SavedImports";
import SchedulePanel from "@/components/university/SchedulePanel";
import ServiceGrid from "@/components/university/ServiceGrid";
import { formatDateTime } from "@/components/university/format";
import { UniversityHero, UniversityImportGuide, UniversityPlatformNote } from "@/components/university/UniversityHero";
import { useUniversityHub } from "@/components/university/useUniversityHub";

export default function UniversityPage() {
  const hub = useUniversityHub();
  const { overview, loading, error, loadOverview, schedule, portal } = hub;

  return (
    <ImportsProvider>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <UniversityHero overview={overview} />

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Публичные данные ФЕСМУ временно недоступны</div>
              <div className="mt-1 text-xs">{error}. Официальные ссылки ниже продолжают работать.</div>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Повторить
            </button>
          </div>
        )}

        <ServiceGrid services={overview?.services} fetchedAt={overview?.fetched_at} />

        <SchedulePanel
          faculties={schedule?.faculties}
          summaries={schedule?.faculty_summaries}
          indexUrl={schedule?.index_url}
          documents={schedule?.documents}
          note={schedule?.note}
          documentsFetchedAt={schedule?.fetched_at}
          documentsCached={schedule?.cached}
          documentsStale={schedule?.stale}
          documentsError={schedule?.error}
          onRetryDocuments={() => void loadOverview()}
        />

        <OzizCatalogSection />

        <ExamQuestionsIndex />

        <DepartmentsCatalog />

        <FeedList feeds={overview?.feeds} loading={loading && !overview} retrying={loading} onRetry={() => void loadOverview()} />

        <SavedImports />

        <UniversityPlatformNote />

        <UniversityImportGuide portal={portal} />

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
