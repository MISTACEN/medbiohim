"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ExternalPlatforms from "@/components/university/ExternalPlatforms";
import { ExternalPlatformStats } from "@/components/university/ExternalPlatformLinks";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Landmark,
  Library,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

type Faculty = {
  id: string;
  title: string;
  program: string | null;
  code: string | null;
  url: string;
};

type FeedItem = {
  title: string;
  url: string;
  date: string | null;
  source: string;
};

type Feed = {
  source: string;
  label: string;
  items: FeedItem[];
  error: string | null;
  cached?: boolean;
};

type Overview = {
  ok: boolean;
  fetched_at: string;
  portal: {
    name: string;
    url: string;
    eios_url: string;
    testing_url: string;
    library_url: string;
  };
  disclaimer: string;
  schedule: {
    index_url: string;
    faculties: Faculty[];
    note: string;
  };
  feeds: Record<"news" | "announcements" | "events", Feed>;
  error?: string;
};

type ScheduleItem = {
  title: string;
  url: string;
  course: string | null;
  semester: string | null;
  kind: string;
  context: string | null;
};

type FacultySchedule = {
  ok: boolean;
  faculty: Faculty;
  fetched_at: string;
  source: string;
  items: ScheduleItem[];
  error?: string;
};

const OFFICIAL_LINKS = [
  {
    title: "Сайт ДВГМУ",
    description: "Официальные новости, документы, структура вуза и приёмная кампания.",
    href: "https://www.fesmu.ru/",
    icon: Landmark,
    badge: "Официальный сайт",
    tone: "indigo",
  },
  {
    title: "ЕИОС",
    description: "Электронная информационно-образовательная среда: расписание, материалы, оценки.",
    href: "https://eios.fesmu.ru/WebApp/#/",
    icon: GraduationCap,
    badge: "Личный кабинет",
    tone: "violet",
  },
  {
    title: "Расписание",
    description: "PDF-файлы факультетов: занятия, лекции, экзамены и ликвидация задолженности.",
    href: "https://www.fesmu.ru/ucheba/raspisanie/",
    icon: CalendarDays,
    badge: "Официальные PDF",
    tone: "sky",
  },
  {
    title: "Электронная библиотека",
    description: "Учебники, методички и полнотекстовые ресурсы библиотеки ДВГМУ.",
    href: "https://elib.fesmu.ru/",
    icon: Library,
    badge: "Библиотека",
    tone: "emerald",
  },
  {
    title: "Тестирование ДВГМУ",
    description: "Оригинальная система тестирования. Вход — по ссылке из ЕИОС, а не по паролю в MEDBIOHIM.",
    href: "http://test.fesmu.ru:8080/",
    icon: ClipboardCheck,
    badge: "Оригинальные тесты",
    tone: "amber",
  },
  {
    title: "Новости и объявления",
    description: "Публичные новости, объявления и анонсы мероприятий университета.",
    href: "https://www.fesmu.ru/press-center/news/",
    icon: BookOpen,
    badge: "Публичный архив",
    tone: "rose",
  },
] as const;



const FEED_TABS = [
  { id: "news", label: "Новости" },
  { id: "announcements", label: "Объявления" },
  { id: "events", label: "Анонсы" },
] as const;

type FeedKind = (typeof FEED_TABS)[number]["id"];

function formatDate(value: string | null | undefined): string {
  if (!value) return "Дата не указана";
  const parsed = /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  }
  return value;
}

function toneClasses(tone: string): string {
  const map: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
  };
  return map[tone] || "bg-slate-50 text-slate-700 border-slate-100";
}

export default function UniversityPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFeed, setActiveFeed] = useState<FeedKind>("news");
  const [selectedFaculty, setSelectedFaculty] = useState<string>("lechebnyy");
  const [schedules, setSchedules] = useState<Record<string, FacultySchedule>>({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleQuery, setScheduleQuery] = useState("");

  async function loadOverview() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/university", { cache: "no-store" });
      const data = (await response.json()) as Overview;
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setOverview(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить данные ФЕСМУ");
    } finally {
      setLoading(false);
    }
  }

  async function loadFaculty(id: string) {
    if (schedules[id]) return;
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const response = await fetch(`/api/university?faculty=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await response.json()) as FacultySchedule;
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setSchedules((previous) => ({ ...previous, [id]: data }));
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : "Расписание факультета временно недоступно");
    } finally {
      setScheduleLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    void loadFaculty(selectedFaculty);
  }, [selectedFaculty]);

  const currentFeed = overview?.feeds?.[activeFeed];
  const currentSchedule = schedules[selectedFaculty];

  const groupedSchedule = useMemo(() => {
    const items = (currentSchedule?.items || []).filter((item) => {
      const query = scheduleQuery.trim().toLowerCase();
      if (!query) return true;
      return `${item.title} ${item.course || ""} ${item.semester || ""} ${item.kind}`.toLowerCase().includes(query);
    });
    const groups = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      const key = item.course || "Общие материалы";
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const na = Number.parseInt(a, 10);
      const nb = Number.parseInt(b, 10);
      if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b, "ru");
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    });
  }, [currentSchedule, scheduleQuery]);

  return (
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
              <a href="https://www.fesmu.ru/" target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-2">
                Официальный сайт <ArrowUpRight className="h-4 w-4" />
              </a>
              <a href="https://eios.fesmu.ru/WebApp/#/" target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
                Войти в ЕИОС <ExternalLink className="h-4 w-4" />
              </a>
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
          <button type="button" onClick={() => void loadOverview()} className="ml-auto shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700">
            Повторить
          </button>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Официальные ресурсы</h2>
            <p className="text-xs text-slate-500">Ссылки ведут на домены ДВГМУ и открываются в новой вкладке.</p>
          </div>
          {overview && (
            <span className="hidden text-xs text-slate-400 sm:inline">
              Проверено {formatDate(overview.fetched_at)}
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OFFICIAL_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${toneClasses(item.tone)}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-indigo-500" />
                </div>
                <div className="mt-3 font-semibold text-slate-900">{item.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
                <span className={`mt-3 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses(item.tone)}`}>
                  {item.badge}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <section id="schedule" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarDays className="h-5 w-5 text-indigo-600" /> Расписание факультетов
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Официальные PDF. MEDBIOHIM не изменяет файлы и не подставляет расписание из других источников.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={overview?.schedule.index_url || "https://www.fesmu.ru/ucheba/raspisanie/"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Первоисточник <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {currentSchedule && (
              <button type="button" onClick={() => { setSchedules((previous) => { const next = { ...previous }; delete next[selectedFaculty]; return next; }); void loadFaculty(selectedFaculty); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <RefreshCw className="h-3.5 w-3.5" /> Обновить
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(overview?.schedule.faculties || []).map((faculty) => (
            <button
              key={faculty.id}
              type="button"
              onClick={() => setSelectedFaculty(faculty.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                selectedFaculty === faculty.id
                  ? "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50"
              }`}
            >
              <span className="block text-sm font-semibold">{faculty.title}</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                {[faculty.code, faculty.program].filter(Boolean).join(" · ") || "Официальная страница"}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={scheduleQuery}
              onChange={(event) => setScheduleQuery(event.target.value)}
              placeholder="Найти файл: экзамен, 3 курс, лекции…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-300"
            />
          </div>
          <div className="text-xs text-slate-400">
            {currentSchedule ? `${currentSchedule.items.length} файлов · ${formatDate(currentSchedule.fetched_at)}` : "Загрузка…"}
          </div>
        </div>

        {scheduleLoading && !currentSchedule ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Читаем официальную страницу факультета…
          </div>
        ) : scheduleError && !currentSchedule ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {scheduleError}
            <a href={overview?.schedule.index_url || "https://www.fesmu.ru/ucheba/raspisanie/"} target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">
              Открыть первоисточник
            </a>
          </div>
        ) : groupedSchedule.length === 0 ? (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {scheduleQuery ? "По этому запросу файлов нет." : "На странице факультета пока нет PDF-файлов."}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groupedSchedule.map(([course, items]) => (
              <div key={course}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">{course}</span>
                  <span className="text-[11px] text-slate-400">{items.length}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {items.map((item) => (
                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition hover:border-indigo-200 hover:bg-white">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-indigo-700">{item.title}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <span className="font-medium text-indigo-600">{item.kind}</span>
                          {item.semester && <span>{item.semester}</span>}
                          {item.context && <span>{item.context}</span>}
                        </span>
                      </span>
                      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <BookOpen className="h-5 w-5 text-indigo-600" /> Публичные новости и объявления
            </h2>
            <p className="mt-1 text-xs text-slate-500">Заголовки и даты с официального сайта. Полный текст — по ссылке на ФЕСМУ.</p>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {FEED_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFeed(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeFeed === tab.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем публичные данные…
          </div>
        ) : currentFeed?.error ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {currentFeed.error}. <a href={currentFeed.source} target="_blank" rel="noreferrer" className="font-semibold underline">Открыть раздел на сайте ДВГМУ</a>
          </div>
        ) : (currentFeed?.items?.length || 0) === 0 ? (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Публичных материалов сейчас нет. <a href={currentFeed?.source || "https://www.fesmu.ru/press-center/news/"} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600">Проверить на сайте</a>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {currentFeed?.items.map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3 py-3">
                <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 group-hover:text-indigo-700">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{item.date || "Дата не указана"} · {currentFeed.label}</span>
                </span>
                <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
              </a>
            ))}
          </div>
        )}

        {overview && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>Источник: {FEED_TABS.find((tab) => tab.id === activeFeed)?.label.toLowerCase()} ФЕСМУ</span>
            <span>·</span>
            <span>получено {formatDate(overview.fetched_at)}</span>
            {currentFeed?.cached && <span className="rounded-full bg-slate-100 px-2 py-0.5">кэш 30 мин</span>}
          </div>
        )}
      </section>

      <ExternalPlatforms />

      <ExternalPlatformStats />

      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-900">
              <ClipboardCheck className="h-5 w-5" /> Сбор тестов из оригинальной системы
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
              Вопросы собираются только по действию пользователя из его собственной сессии в{" "}
              <a href="http://test.fesmu.ru:8080/" target="_blank" rel="noreferrer" className="font-semibold underline">test.fesmu.ru</a>.
              Расширение Bridge извлекает текст и варианты, вы отмечаете правильные ответы, затем проверяете JSON
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
            <a href="http://test.fesmu.ru:8080/" target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
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
            <b className="text-slate-800">Локальные проверки.</b> Импорт и preview — локальные операции. Они не
            означают, что вопрос уже проверен преподавателем или официальной системой.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <span>Источник официальных данных: {overview?.portal.name || "ДВГМУ"}</span>
        <div className="flex gap-3">
          <a href={overview?.portal.url || "https://www.fesmu.ru/"} target="_blank" rel="noreferrer" className="hover:text-indigo-600">fesmu.ru</a>
          <a href={overview?.portal.eios_url || "https://eios.fesmu.ru/WebApp/#/"} target="_blank" rel="noreferrer" className="hover:text-indigo-600">eios.fesmu.ru</a>
          <a href={overview?.portal.library_url || "https://elib.fesmu.ru/"} target="_blank" rel="noreferrer" className="hover:text-indigo-600">elib.fesmu.ru</a>
        </div>
      </div>
    </main>
  );
}
