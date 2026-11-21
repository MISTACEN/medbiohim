"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  Clock,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  Microscope,
  Play,
  Repeat,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  getTestCurriculumMap,
  hasToken,
  listTests,
  type ApiTest,
} from "@/lib/api";
import { resolveSubjectSlug, subjectSlugMatches } from "@/lib/subjectSlug";
import { fetchContentJson } from "@/lib/content-json";
import { useApiRequest } from "@/hooks/useApiRequest";
import { AssignedTests } from "@/components/tests/AssignedTests";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";

import {
  MODES,
  UUID,
  buildBankHref,
  buildHref,
  buildRangeHref,
  buildTopicMeta,
  countRegularQuestions,
  dateLabel,
  enrichTests,
  groupTopics,
  mapApiTests,
  parseManualSections,
  plural,
  splitFullTests,
  subjectLabel,
  subjectRank,
  type CurriculumSubject,
  type ManualSection,
  type Mode,
  type ModuleGroup,
  type SubjectOption,
  type TestItem,
  type TestsLoad,
  type TopicMeta,
} from "./tests-hub-model";
export function TestsHub({
  subjectId = "",
  subjectSlug = "",
  subjectName = "",
  course,
  semester,
  embedded = false,
  initialTopicId = "",
  autoStart = false,
  highlightTestId = "",
}: {
  subjectId?: string;
  subjectSlug?: string;
  subjectName?: string;
  course?: number | null;
  semester?: number | null;
  embedded?: boolean;
  /** Тема из ссылки карточки модуля: показывает только её банки. */
  initialTopicId?: string;
  /** Сразу открыть тренировку первой темы (переход из карточки модуля). */
  autoStart?: boolean;
  /** Тест из deep-ссылки (?open=): карточка подсвечивается и скроллится в вид. */
  highlightTestId?: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const [tests, setTests] = useState<TestItem[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);
  const [mode, setMode] = useState<Mode>("prepare");
  const [count, setCount] = useState(10);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [focusTopic, setFocusTopic] = useState(initialTopicId.trim());
  const [highlight, setHighlight] = useState("");
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    setFocusTopic(initialTopicId.trim());
  }, [initialTopicId]);

  const scoped = Boolean(subjectId || subjectSlug || subjectName);
  const resolvedSlug = resolveSubjectSlug(subjectSlug, subjectName) || subjectSlug;

  // D9: ручной useEffect с cancelled-флагом заменён на useApiRequest —
  // запросы меню тестов отменяются при unmount и смене зависимостей.
  const { data: testsLoad, loading: testsLoading, error: testsError } = useApiRequest<TestsLoad>(
    async (signal) => {
      try {
        if (authLoading) return { ready: false } as TestsLoad;
        if (!hasToken()) return { ready: true, tests: [], curriculum: [] };
        const requestSubjectId = UUID.test(subjectId) ? subjectId : undefined;
        const requestSubjectSlug = requestSubjectId ? undefined : (subjectSlug || undefined);
        const [testsRes, mapRes] = await Promise.all([
          listTests(requestSubjectId, user?.groupId, requestSubjectSlug, course ?? undefined, semester ?? undefined, { signal }),
          getTestCurriculumMap(requestSubjectId, user?.groupId, { signal }),
        ]);
        if (!testsRes.ok) throw new Error(describeApiError(testsRes.error) || "Не удалось загрузить меню тестов.");
        const rows: ApiTest[] = Array.isArray(testsRes.data?.items) ? testsRes.data.items : [];
        const mapped = mapApiTests(rows as unknown as Array<Record<string, unknown>>);
        return {
          ready: true,
          tests: mapped,
          curriculum: mapRes.ok && Array.isArray(mapRes.data?.items) ? mapRes.data.items : [],
        };
      } catch (cause) {
        throw new Error(cause instanceof Error && cause.message ? cause.message : "Не удалось загрузить меню тестов.");
      }
    },
    [authLoading, user?.groupId, subjectId, subjectSlug, resolvedSlug, course, semester]
  );

  useEffect(() => {
    if (testsError) {
      // Как и раньше: при ошибке меню тестов пустеет вместо устаревшего списка.
      setTests([]);
      return;
    }
    if (!testsLoad?.ready) return;
    setTests(testsLoad.tests);
    setCurriculum(testsLoad.curriculum);
  }, [testsLoad, testsError]);

  const loading = testsLoading || !testsLoad?.ready;
  const error = testsError ?? "";

  // Deep-ссылка ?open=<id> с главной: как только меню тестов загрузилось,
  // подсвечиваем карточку на несколько секунд и скроллим к ней.
  useEffect(() => {
    const target = highlightTestId.trim();
    if (!target || loading) return;
    setHighlight(target);
    const timer = setTimeout(() => setHighlight(""), 5000);
    return () => clearTimeout(timer);
  }, [highlightTestId, loading]);

  useEffect(() => {
    if (!highlight) return;
    const element = document.querySelector(`[data-test-card="${highlight}"]`);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  const topicMeta = useMemo(() => buildTopicMeta(curriculum), [curriculum]);

  const enriched = useMemo(() => enrichTests(tests, topicMeta), [tests, topicMeta]);

  const scopedTests = useMemo(() => {
    if (!scoped) return enriched;
    return enriched.filter((test) => {
      if (subjectId && test.subjectId && test.subjectId === subjectId) return true;
      if (subjectSlug && subjectSlugMatches(test.subjectSlug, subjectSlug)) return true;
      if (subjectName && test.subjectName && test.subjectName.toLowerCase() === subjectName.toLowerCase()) return true;
      return false;
    });
  }, [enriched, scoped, subjectId, subjectSlug, subjectName]);

  const subjects = useMemo<SubjectOption[]>(() => {
    const map = new Map<string, SubjectOption>();
    for (const test of enriched) {
      const key = test.subjectId || test.subjectSlug || test.subjectName || "other";
      const label = subjectLabel(test.subjectSlug, test.subjectName);
      const current = map.get(key);
      if (current) current.count += 1;
      else map.set(key, { key, label, slug: test.subjectSlug, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => {
      const rank = subjectRank(a.slug, a.label) - subjectRank(b.slug, b.label);
      return rank !== 0 ? rank : a.label.localeCompare(b.label, "ru");
    });
  }, [enriched]);

  // Фильтр по предмету действует и на общей /tests (пилюли «Гистология 23…»),
  // а не только внутри страницы предмета — раньше он игнорировался без scoped.
  const bySubject = useMemo(() => {
    if (subjectFilter === "all") return scopedTests;
    return scopedTests.filter((test) => {
      const key = test.subjectId || test.subjectSlug || test.subjectName || "other";
      return key === subjectFilter;
    });
  }, [scopedTests, subjectFilter]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bySubject;
    return bySubject.filter((test) =>
      [test.title, test.topicTitle, test.moduleTitle, test.subjectName, test.source]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [bySubject, search]);

  // Переход из карточки модуля: показываем банки конкретной темы.
  const topicFiltered = useMemo(() => {
    if (!focusTopic) return filtered;
    return filtered.filter((test) => test.topicId === focusTopic);
  }, [filtered, focusTopic]);

  // Пирамида знаний: фильтр по уровню (ЭТАП 6).
  const levelFiltered = useMemo(() => {
    if (levelFilter == null) return topicFiltered;
    return topicFiltered.filter((test) => test.knowledgeLevel === levelFilter);
  }, [topicFiltered, levelFilter]);

  // Автозапуск тренировки: первая тема открывает свой банк сразу. `return`
  // несёт текущий адрес предмета без `start`, чтобы после завершения
  // вернуться именно туда, откуда пришли.
  useEffect(() => {
    if (!autoStart || startedRef.current || !focusTopic) return;
    // Свободная подготовка стартует с САМОГО КРУПНОГО банка предмета
    // (полный банк темы), а не с первой попавшейся темы из списка.
    const first = [...levelFiltered].sort((a, b) => b.questionCount - a.questionCount)[0];
    if (!first) return;
    startedRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("start");
    const returnTo = `${url.pathname}${url.search}`;
    const count = Math.max(1, Math.min(200, first.questionCount || 10));
    const subject = encodeURIComponent(subjectName || resolvedSlug || "");
    router.replace(
      `/tests/preparation/${encodeURIComponent(first.id)}?mode=prepare&count=${count}&subject=${subject}&return=${encodeURIComponent(returnTo)}`,
    );
  }, [autoStart, focusTopic, levelFiltered, router, subjectName, resolvedSlug]);

  const modules = useMemo<ModuleGroup[]>(() => {
    const map = new Map<string, ModuleGroup>();
    for (const test of levelFiltered) {
      const key = test.moduleKey;
      const current = map.get(key);
      if (current) current.count += 1;
      else map.set(key, {
        key,
        title: test.moduleTitle,
        count: 1,
        topics: 0,
        order: test.moduleRank,
        fallback: test.isFallbackModule,
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title, "ru");
    });
  }, [levelFiltered]);

  useEffect(() => {
    if (moduleFilter === "all") return;
    if (!modules.some((module) => module.key === moduleFilter)) setModuleFilter("all");
  }, [modules, moduleFilter]);

  // Разделы «Полных тестов» (phys_full:*): мега-микс + методички, отдельная
  // первая секция; phys_sub:* — ссылки внутри секции, не отдельные карточки.
  const { fullTests, subMap: subTests, mega: fullMega, manuals: fullManuals } = useMemo(
    () => splitFullTests(levelFiltered, tests),
    [levelFiltered, tests],
  );

  // Разделы и подразделы методички: те же диапазоны вопросов, что в пособии.
  const [manualSections, setManualSections] = useState<Record<string, ManualSection[]>>({});
  const manualSlugsKey = Array.from(new Set(fullManuals.map((test) => (test.source || "").replace(/^phys_full:/, ""))))
    .filter((slug) => slug && slug !== "physiology")
    .sort()
    .join(",");
  useEffect(() => {
    const slugs = manualSlugsKey ? manualSlugsKey.split(",") : [];
    if (!slugs.length) return;
    const controller = new AbortController();
    (async () => {
      const out: Record<string, ManualSection[]> = {};
      await Promise.all(
        slugs.map(async (slug) => {
          try {
            // Контент — через канон content-json (D9): тот же no-cache-политик.
            const json = await fetchContentJson<Record<string, unknown>>(
              `/content/physiology/${slug}.json`,
              { signal: controller.signal },
            );
            out[slug] = parseManualSections(json);
          } catch {
            /* нет файла методички — просто без подразделов */
          }
        }),
      );      if (!controller.signal.aborted) setManualSections(out);
    })();
    return () => {
      controller.abort();
    };
  }, [manualSlugsKey]);

  const groups = useMemo(
    () => groupTopics(levelFiltered, moduleFilter, topicMeta),
    [levelFiltered, moduleFilter, topicMeta],
  );

  const totalQuestions = countRegularQuestions(levelFiltered);
  const selectedMode = MODES.find((item) => item.id === mode) || MODES[0];
  const showModuleFilter = modules.length > 1 && modules.some((module) => !module.fallback);
  const hasActiveFilters = Boolean(search.trim()) || moduleFilter !== "all" || (!scoped && subjectFilter !== "all");

  function resetFilters() {
    setSearch("");
    setModuleFilter("all");
    if (subjects.length > 0) setSubjectFilter("all");
  }

  if (authLoading || loading) {
    return (
      <div className="card flex items-center gap-3 p-8 text-sm text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Загружаю меню тестов…
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-[var(--muted)]">Войдите, чтобы открыть тесты и банки вопросов.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {!embedded && <AssignedTests />}
      {!embedded && (
        <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <ClipboardCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Тесты · банки · режимы</p>
                <h1 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">
                  {scoped ? subjectLabel(resolvedSlug, subjectName) : "Тесты по предметам"}
                </h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  {scoped
                    ? "Выберите раздел и тему, затем режим. Один режим применяется ко всем банкам — не нужно настраивать каждую карточку отдельно."
                    : "Гистология, физиология, химия и вероятность со статистикой в одном меню: предмет → раздел → тема → банк. Режим выбирается один раз."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                {levelFiltered.length} {plural(levelFiltered.length, "банк", "банка", "банков")}
              </span>
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                {totalQuestions} {plural(totalQuestions, "вопрос", "вопроса", "вопросов")}
              </span>
            </div>
          </div>
        </header>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>
      )}

      {!scoped && subjects.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Предмет">
          <button
            type="button"
            onClick={() => { setSubjectFilter("all"); setModuleFilter("all"); }}
            className={
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition " +
              (subjectFilter === "all"
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
            }
          >
            Все предметы
            <span className={"rounded-full px-2 py-0.5 text-xs " + (subjectFilter === "all" ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
              {enriched.length}
            </span>
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.key}
              type="button"
              onClick={() => { setSubjectFilter(subject.key); setModuleFilter("all"); }}
              className={
                "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition " +
                (subjectFilter === subject.key
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
              }
            >
              {subject.label}
              <span className={"rounded-full px-2 py-0.5 text-xs " + (subjectFilter === subject.key ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                {subject.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {focusTopic ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <span>Показаны банки выбранной темы.</span>
          <button
            type="button"
            onClick={() => {
              setFocusTopic("");
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.delete("topic");
                window.history.replaceState({}, "", url);
              }
            }}
            className="ml-auto rounded-lg bg-white px-2.5 py-1 font-semibold text-indigo-700 hover:underline"
          >
            Показать все темы
          </button>
        </div>
      ) : null}

      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти тему, банк или источник…"
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          {/* На телефоне режимы и уровни — две прокручиваемые строки: раньше они
              переносились в 4 ряда и отодвигали сам список банков. */}
          <div className="mobile-scroll-x flex items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
            <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-[var(--muted)] sm:block" />
            <span className="hidden shrink-0 text-sm font-semibold text-slate-700 lg:inline">Свободная подготовка · режим:</span>
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.hint}
                onClick={() => setMode(item.id)}
                className={
                  "shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition sm:text-sm " +
                  (mode === item.id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-[var(--border)] bg-[var(--card)] text-slate-600 hover:border-indigo-300")
                }
              >
                {item.label}
                <span className="ml-1 hidden font-normal text-[var(--muted)] sm:inline">· {item.short}</span>
              </button>
            ))}
          </div>
          <div className="mobile-scroll-x flex items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
            <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Пирамида:</span>
            {[null, 1, 2, 3].map((lv) => (
              <button key={String(lv)} type="button" onClick={() => setLevelFilter(lv)}
                className={"shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold " + (levelFilter === lv ? "bg-indigo-600 text-white" : "border border-[var(--border)] text-slate-600 hover:border-indigo-300")}>
                {lv === null ? "Все" : lv === 1 ? "База" : lv === 2 ? "Понимание" : "Применение"}
              </button>
            ))}
          </div>
        </div>

        {mode !== "sequential" && (
          <label className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span className="font-semibold text-slate-700">Сколько вопросов взять:</span>
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
              className="w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
            />
            <span className="min-w-0">случайных вопросов из банка; лишние не добавятся.
              <span className="mt-1 block text-xs font-medium text-indigo-700">
                Свободная подготовка: результат остаётся у вас и не уходит преподавателю.
              </span>
              <span className="mt-1 hidden text-xs text-[var(--muted)] sm:block">
                Назначенные тесты — отдельным блоком выше и всегда идут в ведомость.
              </span>
            </span>
          </label>
        )}

        {showModuleFilter && (
          <div className="mobile-scroll-x flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-[var(--border)] pt-3 lg:flex-wrap lg:overflow-visible" aria-label="Раздел">
            <button
              type="button"
              onClick={() => setModuleFilter("all")}
              className={
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold transition " +
                (moduleFilter === "all"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                  : "border-[var(--border)] bg-[var(--card)] text-slate-600 hover:border-indigo-300")
              }
            >
              Все разделы
            </button>
            {modules.map((module) => (
              <button
                key={module.key}
                type="button"
                onClick={() => setModuleFilter(module.key)}
                className={
                  "rounded-full border px-3 py-1.5 text-xs font-bold transition " +
                  (moduleFilter === module.key
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-[var(--border)] bg-[var(--card)] text-slate-600 hover:border-indigo-300")
                }
              >
                {module.title}
                <span className="ml-1 font-normal opacity-70">{module.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-semibold text-slate-800">
            {enriched.length === 0
              ? scoped
                ? "Для этого предмета пока нет опубликованных тестов."
                : "Пока нет опубликованных тестов."
              : "По выбранным фильтрам ничего не найдено."}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {enriched.length === 0
              ? "Как только тесты появятся, они будут сгруппированы по разделам и темам."
              : "Измените поиск или сбросьте фильтры."}
          </p>
          {hasActiveFilters && enriched.length > 0 && (
            <button type="button" onClick={resetFilters} className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold">
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {fullTests.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/40 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">Полные тесты</div>
                  <h2 className="mt-0.5 text-base font-extrabold text-slate-950">Все вопросы методичек одним заходом</h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{selectedMode.label}</span>
              </header>
              <div className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
                {fullMega && (
                  <article className="flex flex-col gap-3 rounded-xl border border-indigo-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-extrabold leading-snug text-slate-900">🏋️ Все тесты физиологии · мега-микс</h3>
                      <p className="mt-1 text-xs text-[var(--muted)]">{fullMega.questionCount} {plural(fullMega.questionCount, "вопрос", "вопроса", "вопросов")} из всех методичек</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link href={buildHref(fullMega, mode, count)} className="btn-primary inline-flex min-h-10 items-center gap-2 text-sm">
                        <Play className="h-4 w-4" /> {selectedMode.label}
                      </Link>
                      <Link href={buildBankHref(fullMega, mode, count)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-sm font-bold text-[var(--status-ok-fg)] transition hover:bg-[var(--status-ok-bg)]">
                        <BookOpenCheck className="h-4 w-4" /> Банк
                      </Link>
                    </div>
                  </article>
                )}
                {fullManuals.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fullManuals.map((test) => {
                      const slug = (test.source || "").replace(/^phys_full:/, "");
                      const sections = manualSections[slug] || [];
                      const hrefFor = (from: number, to: number) => {
                        const subId = subTests.get(`phys_sub:${slug}:${from}-${to}`);
                        return subId ? buildHref({ ...test, id: subId }, "sequential", count) : buildRangeHref(test, from, to);
                      };
                      return (
                        <article key={test.id} className="rounded-xl border border-indigo-200 bg-white p-3 sm:p-4">
                          <h3 className="text-sm font-extrabold leading-snug text-slate-900">
                            {test.title.replace(/^Полный тест · /, "")}
                          </h3>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {test.questionCount} {plural(test.questionCount, "вопрос", "вопроса", "вопросов")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Link
                              href={buildHref(test, mode, count)}
                              className="btn-primary inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 text-sm sm:flex-none"
                            >
                              <Play className="h-4 w-4" /> {mode === "sequential" ? "Весь банк" : selectedMode.label}
                            </Link>
                            <Link
                              href={buildBankHref(test, mode, count)}
                              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-sm font-bold text-[var(--status-ok-fg)] sm:flex-none"
                            >
                              <BookOpenCheck className="h-4 w-4" /> Банк
                            </Link>
                          </div>
                          {sections.length > 0 && (
                            <details className="group mt-2">
                              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 text-xs font-bold text-indigo-700 marker:hidden">
                                <span className="transition group-open:rotate-90">▸</span>
                                По разделам и подразделам
                              </summary>
                              <div className="mt-2 space-y-2">
                                {sections.map((section, sectionIndex) => {
                                  const first = section.subsections[0];
                                  const last = section.subsections[section.subsections.length - 1];
                                  // «Весь раздел» ведёт в уже существующий банк «Раздел N.»,
                                  // чтобы не плодить второй экземпляр того же набора.
                                  const wholeTest = tests.find((candidate) => {
                                    const source = candidate.source || "";
                                    if (source.startsWith("phys_full:") || source.startsWith("phys_sub:")) return false;
                                    return candidate.questionCount === section.count && new RegExp(`^Раздел ${sectionIndex + 1}\\.`).test(candidate.title);
                                  });
                                  return (
                                    <div key={section.title} className="rounded-lg border border-[var(--border)] bg-slate-50/50 p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 text-[11px] font-semibold leading-snug text-slate-700">
                                          {section.title}
                                          <span className="ml-1 font-normal text-[var(--muted)]">· {section.count}</span>
                                        </div>
                                        {first && last && (
                                          <Link
                                            href={wholeTest ? buildHref(wholeTest, "sequential", count) : first && last ? hrefFor(first.from, last.to) : "#"}
                                            className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-indigo-700"
                                          >
                                            Весь раздел
                                          </Link>
                                        )}
                                      </div>
                                      {section.subsections.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                          {section.subsections.map((sub) => (
                                            <Link
                                              key={sub.title}
                                              href={hrefFor(sub.from, sub.to)}
                                              className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
                                            >
                                              {sub.title} · {sub.count}
                                            </Link>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
          {groups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
              <header className="border-b border-[var(--border)] bg-slate-50/60 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {(!scoped || !group.tests.every((test) => test.isFallbackModule)) && (
                      <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">{group.moduleTitle}</div>
                    )}
                    <h2 className="mt-1 text-base font-extrabold leading-snug text-slate-950 sm:text-lg">{group.title}</h2>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                      <span>{group.tests.length} {plural(group.tests.length, "банк", "банка", "банков")}</span>
                      <span>{group.questionCount} {plural(group.questionCount, "вопрос", "вопроса", "вопросов")}</span>
                      {group.plannedDate && <span>Занятие: {dateLabel(group.plannedDate)}</span>}
                      {group.isExtra && <span className="font-semibold text-[var(--status-warn-fg)]">Вне текущего плана</span>}
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                    {selectedMode.label}
                  </span>
                </div>
              </header>
              <div className="space-y-2 p-3 sm:p-4">
                {group.tests.map((test) => (
                  <article
                    key={test.id}
                    data-test-card={test.id}
                    className={
                      "flex flex-col gap-3 rounded-xl border bg-white p-3 transition sm:flex-row sm:items-center sm:justify-between sm:p-4 " +
                      (highlight === test.id
                        ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-300"
                        : "border-[var(--border)] hover:border-indigo-200")
                    }
                  >
                    <div className="min-w-0">
                      <h3 className="font-bold leading-snug text-slate-900">
                        {test.title.trim().toLowerCase() === group.title.trim().toLowerCase()
                          ? "Тест по теме занятия"
                          : test.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                        <span>{test.questionCount} {plural(test.questionCount, "вопрос", "вопроса", "вопросов")}</span>
                        {test.timeLimitSec != null && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {Math.round(test.timeLimitSec / 60)} мин
                          </span>
                        )}
                        {test.maxAttempts != null && (
                          <span className="inline-flex items-center gap-1">
                            <Repeat className="h-3.5 w-3.5" />
                            до {test.maxAttempts} {plural(test.maxAttempts, "попытки", "попыток", "попыток")}
                          </span>
                        )}
                        {!scoped && <span>{subjectLabel(test.subjectSlug, test.subjectName)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={buildHref(test, mode, count)}
                        className="btn-primary inline-flex min-h-10 items-center gap-2 text-sm"
                      >
                        <Play className="h-4 w-4" />
                        {mode === "sequential" ? "Пройти весь банк" : selectedMode.label}
                      </Link>
                      <Link
                        href={buildBankHref(test, mode, count)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-sm font-bold text-[var(--status-ok-fg)] transition hover:bg-[var(--status-ok-bg)]"
                      >
                        <BookOpenCheck className="h-4 w-4" />
                        Банк
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!embedded && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/tests?view=chemistry"
            className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]">
              <FlaskConical className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-extrabold text-slate-900">Единый банк заданий по химии</span>
              <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">
                Открытые задания и тестовые вопросы с формулами и эталонами — отдельно от тестов по предметам.
              </span>
            </span>
          </Link>
          <Link
            href="/practice"
            className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-extrabold text-slate-900">База вопросов</span>
              <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">
                Посмотреть вопросы и эталоны без запуска теста, сохранить заметки и избранное.
              </span>
            </span>
          </Link>
          <Link
            href="/trainers"
            className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-extrabold text-slate-900">Тренажёры</span>
              <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">
                Гистология в формате карточек: препарат за препаратом, со статистикой прогресса.
              </span>
            </span>
          </Link>
          <Link
            href="/atlas"
            className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]">
              <Microscope className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-extrabold text-slate-900">Атлас микропрепаратов</span>
              <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">
                Все препараты и электронограммы с фильтрами — база перед тренировкой.
              </span>
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}

export default TestsHub;
