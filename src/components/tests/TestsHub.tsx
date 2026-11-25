"use client";

/**
 * Каталог тестов: назначения → поиск → банки.
 *
 * Раньше на одном экране одновременно жили режимы, количество вопросов,
 * пирамида, разделы, полные банки и карточки с двумя кнопками. Студент
 * настраивал прохождение дважды (в списке и на экране запуска) и листал
 * десятки экранов. Теперь список отвечает только за выбор банка:
 * режим, количество и пирамида — на `/tests/preparation/[id]`.
 *
 * Данные, группировка и deep-ссылки остались прежними: контракты API не
 * менялись, поэтому старые адреса (`?open=`, `?topic=`, `?start=1`,
 * `?view=chemistry`) работают как раньше.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, SlidersHorizontal } from "lucide-react";
import {
  getTestCurriculumMap,
  hasToken,
  listTests,
  type ApiTest,
} from "@/lib/api";
import { resolveSubjectSlug, subjectSlugMatches } from "@/lib/subjectSlug";
import { useApiRequest } from "@/hooks/useApiRequest";
import { AssignedTests } from "@/components/tests/AssignedTests";
import { TestsHubFullBanks } from "@/components/tests/TestsHubFullBanks";
import { BankRow } from "@/components/tests/hub/BankRow";
import { ContinueCard } from "@/components/tests/hub/ContinueCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";

import {
  UUID,
  aliasMap,
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
  type ModuleGroup,
  type SubjectOption,
  type TestItem,
  type TestsLoad,
} from "./tests-hub-model";

const EMPTY_ALIASES = new Map<string, string[]>();

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
  hideHeader = false,
  hideAssigned = false,
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
  /** Тест из deep-ссылки (?open=): группа раскрывается, строка подсвечивается. */
  highlightTestId?: string;
  /** Страница сама рисует шапку (новая страница тестов) — не дублируем h1. */
  hideHeader?: boolean;
  /** Назначения рисует страница выше (блок «Назначено преподавателем» первым). */
  hideAssigned?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const [tests, setTests] = useState<TestItem[]>([]);
  const [aliases, setAliases] = useState<Map<string, string[]>>(EMPTY_ALIASES);
  const [hiddenCopies, setHiddenCopies] = useState(0);
  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [focusTopic, setFocusTopic] = useState(initialTopicId.trim());
  const [highlight, setHighlight] = useState("");
  // Группы — аккордеон: раскрыта только нужная тема, а не все 30 подряд.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [groupLimit, setGroupLimit] = useState(8);
  const [showFullBanks, setShowFullBanks] = useState(true);
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    setFocusTopic(initialTopicId.trim());
  }, [initialTopicId]);

  const scoped = Boolean(subjectId || subjectSlug || subjectName);
  const resolvedSlug = resolveSubjectSlug(subjectSlug, subjectName) || subjectSlug;

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
      setTests([]);
      return;
    }
    if (!testsLoad?.ready) return;
    const canonical = testsLoad.tests.filter((test) => !test.duplicateOf);
    setTests(canonical);
    setAliases(aliasMap(testsLoad.tests));
    setHiddenCopies(testsLoad.tests.length - canonical.length);
    setCurriculum(testsLoad.curriculum);
  }, [testsLoad, testsError]);

  const loading = testsLoading || !testsLoad?.ready;
  const error = testsError ?? "";

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

  const topicFiltered = useMemo(() => {
    if (!focusTopic) return filtered;
    return filtered.filter((test) => test.topicId === focusTopic);
  }, [filtered, focusTopic]);

  const levelFiltered = useMemo(() => {
    if (levelFilter == null) return topicFiltered;
    return topicFiltered.filter((test) => test.knowledgeLevel === levelFilter);
  }, [topicFiltered, levelFilter]);

  useEffect(() => {
    if (!autoStart || startedRef.current || !focusTopic) return;
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

  const { fullTests, subMap: subTests, mega: fullMega, manuals: fullManuals } = useMemo(
    () => splitFullTests(levelFiltered, tests),
    [levelFiltered, tests],
  );

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
      const { fetchContentJson } = await import("@/lib/content-json");
      const out: Record<string, ManualSection[]> = {};
      await Promise.all(
        slugs.map(async (slug) => {
          try {
            const json = await fetchContentJson<Record<string, unknown>>(
              `/content/physiology/${slug}.json`,
              { signal: controller.signal },
            );
            out[slug] = parseManualSections(json);
          } catch {
            /* нет файла методички — просто без подразделов */
          }
        }),
      );
      if (!controller.signal.aborted) setManualSections(out);
    })();
    return () => {
      controller.abort();
    };
  }, [manualSlugsKey]);

  const groups = useMemo(
    () => groupTopics(levelFiltered, moduleFilter, topicMeta),
    [levelFiltered, moduleFilter, topicMeta],
  );

  // Deep-ссылка ?open=<id>: раскрываем группу с этим банком и подсвечиваем строку.
  useEffect(() => {
    const target = highlightTestId.trim();
    if (!target || loading) return;
    setHighlight(target);
    const group = groups.find((item) => item.tests.some((test) => test.id === target));
    if (group) setOpenGroups((prev) => ({ ...prev, [group.key]: true }));
    const timer = setTimeout(() => setHighlight(""), 6000);
    return () => clearTimeout(timer);
  }, [highlightTestId, loading, groups]);

  useEffect(() => {
    if (!highlight) return;
    const element = document.querySelector(`[data-test-card="${highlight}"]`);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  const totalQuestions = countRegularQuestions(levelFiltered);
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
      {!embedded && <ContinueCard />}
      {!embedded && !hideAssigned && <AssignedTests />}

      {!embedded && !hideHeader && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Банки вопросов</p>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-950">
              {scoped ? subjectLabel(resolvedSlug, subjectName) : "Тесты по предметам"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Выберите банк — режим, количество вопросов и проверку настроите на следующем экране.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
              {levelFiltered.length} {plural(levelFiltered.length, "банк", "банка", "банков")}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
              {totalQuestions} {plural(totalQuestions, "вопрос", "вопроса", "вопросов")}
            </span>
            {hiddenCopies > 0 && (
              <span
                className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-500"
                title="Банки с тем же составом вопросов под другими названиями скрыты"
              >
                копий: {hiddenCopies}
              </span>
            )}
          </div>
        </header>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти тему, банк или источник…"
              className="min-h-11 w-full rounded-xl border border-[var(--input-border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-50 p-1">
            <span className="shrink-0 px-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
              Пирамида
            </span>
            {[null, 1, 2, 3].map((lv) => (
              <button
                key={String(lv)}
                type="button"
                onClick={() => setLevelFilter(lv)}
                className={
                  "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold transition " +
                  (levelFilter === lv ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white")
                }
              >
                {lv === null ? "Все" : lv === 1 ? "База" : lv === 2 ? "Понимание" : "Применение"}
              </button>
            ))}
          </div>
        </div>

        {!scoped && subjects.length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Предмет">
            <button
              type="button"
              onClick={() => { setSubjectFilter("all"); setModuleFilter("all"); }}
              className={
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition " +
                (subjectFilter === "all"
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-[var(--border)] text-slate-700 hover:border-indigo-300")
              }
            >
              Все предметы · {enriched.length}
            </button>
            {subjects.map((subject) => (
              <button
                key={subject.key}
                type="button"
                onClick={() => { setSubjectFilter(subject.key); setModuleFilter("all"); }}
                className={
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition " +
                  (subjectFilter === subject.key
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-[var(--border)] text-slate-700 hover:border-indigo-300")
                }
              >
                {subject.label} · {subject.count}
              </button>
            ))}
          </div>
        )}

        {focusTopic ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
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

        {showModuleFilter && (
          <details className="mt-2 border-t border-[var(--border)] pt-2">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-slate-600">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Разделы:{moduleFilter === "all" ? "все" : modules.find((m) => m.key === moduleFilter)?.title}
              <span className="font-normal text-[var(--muted)]">({modules.length})</span>
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setModuleFilter("all")}
                className={
                  "rounded-full border px-3 py-1 text-xs font-bold transition " +
                  (moduleFilter === "all"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-[var(--border)] text-slate-600 hover:border-indigo-300")
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
                    "rounded-full border px-3 py-1 text-xs font-bold transition " +
                    (moduleFilter === module.key
                      ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                      : "border-[var(--border)] text-slate-600 hover:border-indigo-300")
                  }
                >
                  {module.title} <span className="font-normal opacity-70">{module.count}</span>
                </button>
              ))}
            </div>
          </details>
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
        <div className="space-y-2">
          <TestsHubFullBanks
            fullTests={fullTests}
            fullMega={fullMega}
            fullManuals={fullManuals}
            manualSections={manualSections}
            subTests={subTests}
            tests={tests}
            showFullBanks={showFullBanks}
            setShowFullBanks={setShowFullBanks}
          />

          {groups.slice(0, groupLimit).map((group) => {
            const open = search.trim().length > 0 || openGroups[group.key] === true;
            return (
              <section
                key={group.key}
                className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.key]: !open }))}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50 sm:px-4"
                >
                  <div className="min-w-0 flex-1">
                    {(!scoped || !group.tests.every((test) => test.isFallbackModule)) && (
                      <div className="truncate text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                        {group.moduleTitle}
                      </div>
                    )}
                    <h2 className="truncate text-sm font-extrabold leading-snug text-slate-950 sm:text-base">
                      {group.title}
                    </h2>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
                      <span>{group.tests.length} {plural(group.tests.length, "банк", "банка", "банков")}</span>
                      <span>{group.questionCount} {plural(group.questionCount, "вопрос", "вопроса", "вопросов")}</span>
                      {group.plannedDate && <span>Занятие: {dateLabel(group.plannedDate)}</span>}
                      {group.isExtra && <span className="font-semibold text-[var(--status-warn-fg)]">Вне плана</span>}
                    </div>
                  </div>
                  <ChevronDown
                    className={"h-5 w-5 shrink-0 text-slate-400 transition " + (open ? "rotate-180" : "")}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div className="border-t border-[var(--border)]">
                    {group.tests.map((test) => (
                      <BankRow
                        key={test.id}
                        test={test}
                        aliases={aliases.get(test.id) || []}
                        highlight={highlight === test.id}
                        showSubject={!scoped}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {groups.length > groupLimit && (
            <button
              type="button"
              onClick={() => setGroupLimit((value) => value + 20)}
              className="w-full rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] py-3 text-sm font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              Показать ещё {Math.min(20, groups.length - groupLimit)} из {groups.length - groupLimit} тем
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default TestsHub;
