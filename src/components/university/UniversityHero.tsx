"use client";

/** Шапка хаба: вход в официальные ресурсы, ЕИОС и сохранённое. */
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { formatDateTime } from "@/components/university/format";
import type { UniversityOverview } from "@/components/university/types";

export function UniversityHero({ overview }: { overview: UniversityOverview | null }) {
  const portal = overview?.portal;

  return (
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
            <ShieldCheck className="h-4 w-4 text-[var(--status-ok-fg)]" /> Без подмены источника
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
  );
}

/** Блок про внешние платформы: они переехали во вкладку «Платформы» предмета. */
export function UniversityPlatformNote() {
  return (
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
  );
}

/** Гайд по сбору тестов из оригинальной системы с шагами импорта. */
export function UniversityImportGuide({ portal }: { portal: UniversityOverview["portal"] }) {
  return (
    <section className="rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/60 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--status-warn-fg)]">
            <ClipboardCheck className="h-5 w-5" /> Сбор тестов из оригинальной системы
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--status-warn-fg)]/80">
            Вопросы собираются только по действию пользователя из его собственной сессии в{" "}
            <a href={portal?.testing_url || "http://test.fesmu.ru:8080/"} target="_blank" rel="noreferrer" className="font-semibold underline">
              test.fesmu.ru
            </a>
            . Расширение Bridge извлекает текст и варианты, вы отмечаете правильные ответы, затем проверяете JSON
            на странице импорта. Пароль ЕИОС не сохраняется.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-[var(--status-warn-fg)]">
            <span className="rounded-full bg-white/80 px-2.5 py-1">1. Открыть тест</span>
            <span className="rounded-full bg-white/80 px-2.5 py-1">2. Считать вопрос</span>
            <span className="rounded-full bg-white/80 px-2.5 py-1">3. Проверить preview</span>
            <span className="rounded-full bg-white/80 px-2.5 py-1">4. Импортировать</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/university/import" className="btn-primary inline-flex items-center gap-2 bg-[var(--status-warn-fg)] hover:bg-[var(--status-warn-fg)]">
            Открыть импорт <ChevronRight className="h-4 w-4" />
          </Link>
          <a href={portal?.testing_url || "http://test.fesmu.ru:8080/"} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
            Оригинальные тесты <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
