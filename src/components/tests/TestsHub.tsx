"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  Play,
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
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";

type Mode = "prepare" | "solve" | "exam" | "sequential";

type CurriculumTopic = {
  topic_id?: string;
  title?: string;
  question_count?: number;
  test_count?: number;
  planned_date?: string | null;
  is_extra?: boolean;
  order_index?: number;
};

type CurriculumModule = {
  module_id?: string;
  title?: string;
  order_index?: number;
  topics?: CurriculumTopic[];
};

type CurriculumSubject = {
  subject_id?: string;
  subject_name?: string;
  unclassified_questions?: number;
  modules?: CurriculumModule[];
};

type TestItem = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  moduleId: string;
  moduleTitle: string;
  topicId: string;
  topicTitle: string;
  moduleKey: string;
  topicKey: string;
  moduleRank: number;
  isFallbackModule: boolean;
  questionCount: number;
  source: string;
  orderIndex: number;
};

type TopicGroup = {
  key: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  plannedDate: string | null;
  isExtra: boolean;
  moduleOrder: number;
  topicOrder: number;
  questionCount: number;
  tests: TestItem[];
};

type ModuleGroup = {
  key: string;
  title: string;
  count: number;
  topics: number;
  order: number;
  fallback: boolean;
};

type SubjectOption = {
  key: string;
  label: string;
  slug: string;
  count: number;
};

/**
 * D9: совокупный результат загрузки хаба тестов. `ready: false` — версия
 * «ещё не готовы» (идёт bootstrap авторизации), страница показывает скелетон.
 */
type TestsLoad =
  | { ready: false }
  | { ready: true; tests: TestItem[]; curriculum: CurriculumSubject[] };

const MAIN_SUBJECT_LABELS: Record<string, string> = {
  histology: "Гистология",
  physiology: "Физиология",
  organic_chemistry: "Органическая химия",
  chemistry_organic_physical: "Органическая химия",
};

const MAIN_SUBJECT_ORDER = ["histology", "physiology", "organic_chemistry"];

const MODES: Array<{ id: Mode; label: string; short: string; hint: string }> = [
  { id: "prepare", label: "Подготовка", short: "Проверка сразу", hint: "Можно отвечать и сразу видеть результат." },
  { id: "solve", label: "Решение", short: "Проверка в конце", hint: "Ответы сохраняются, эталоны — после завершения." },
  { id: "exam", label: "Экзамен", short: "Без эталонов", hint: "Режим экзамена: эталоны не показываются до конца." },
  { id: "sequential", label: "Весь банк", short: "По порядку", hint: "Все вопросы банка подряд, прогресс сохраняется." },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function plural(n: number, one: string, few: string, many: string) {
  const value = Math.abs(n) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

function subjectLabel(slug: string, name: string) {
  return MAIN_SUBJECT_LABELS[resolveSubjectSlug(slug)] || name || slug || "Предмет";
}

function subjectRank(slug: string, name: string) {
  const canonical = resolveSubjectSlug(slug, name);
  const index = MAIN_SUBJECT_ORDER.indexOf(canonical);
  return index === -1 ? 99 : index;
}

function dateLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function buildHref(test: TestItem, mode: Mode, count: number) {
  const params = new URLSearchParams();
  if (mode === "sequential") {
    params.set("flow", "sequential");
    params.set("mode", "prepare");
  } else {
    params.set("mode", mode);
    params.set("count", String(count));
  }
  const subject = subjectLabel(test.subjectSlug, test.subjectName);
  if (subject) params.set("subject", subject);
  return `/tests/preparation/${encodeURIComponent(test.id)}?${params.toString()}`;
}

function buildBankHref(test: TestItem, mode: Mode, count: number) {
  const params = new URLSearchParams();
  if (mode === "sequential") {
    params.set("flow", "sequential");
    params.set("mode", "prepare");
  } else {
    params.set("mode", mode);
    params.set("count", String(count));
  }
  const subject = subjectLabel(test.subjectSlug, test.subjectName);
  if (subject) params.set("subject", subject);
  if (test.moduleTitle && test.moduleTitle !== subject) params.set("module", test.moduleTitle);
  if (test.topicTitle) params.set("topic", test.topicTitle);
  return `/tests/bank/${encodeURIComponent(test.id)}${params.toString() ? `?${params.toString()}` : ""}`;
}

export function TestsHub({
  subjectId = "",
  subjectSlug = "",
  subjectName = "",
  course,
  semester,
  embedded = false,
}: {
  subjectId?: string;
  subjectSlug?: string;
  subjectName?: string;
  course?: number | null;
  semester?: number | null;
  embedded?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const [tests, setTests] = useState<TestItem[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);
  const [mode, setMode] = useState<Mode>("prepare");
  const [count, setCount] = useState(10);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");

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
        const mapped = rows.map((raw: ApiTest, index: number): TestItem => {
          const subjectRow = (raw?.subjects && (Array.isArray(raw.subjects) ? raw.subjects[0] : raw.subjects)) || {};
          const rowSubjectSlug = String(raw?.subject_slug || subjectRow?.slug || "");
          const rowSubjectName = String(raw?.subject_name || subjectRow?.name || "");
          return {
            id: String(raw?.id ?? ""),
            title: String(raw?.title || raw?.name || "Тест"),
            subjectId: String(raw?.subject_id || ""),
            subjectName: rowSubjectName,
            subjectSlug: rowSubjectSlug,
            moduleId: String(raw?.module_id || ""),
            moduleTitle: String(raw?.module_title || ""),
            topicId: String(raw?.topic_id || ""),
            topicTitle: String(raw?.topic_title || ""),
            moduleKey: "",
            topicKey: "",
            moduleRank: 999,
            isFallbackModule: false,
            questionCount: Number(raw?.questions_count ?? raw?.question_count ?? 0),
            source: String(raw?.source_file_name || raw?.source_key || "база тестов"),
            orderIndex: Number(raw?.order_index ?? index),
          };
        }).filter((item) => item.id);
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

  const topicMeta = useMemo(() => {
    const map = new Map<string, { moduleId: string; topicId: string; moduleTitle: string; topicTitle: string; plannedDate: string | null; isExtra: boolean; moduleOrder: number; topicOrder: number }>();
    for (const subject of curriculum) {
      (subject.modules || []).forEach((module, moduleIndex) => {
        (module.topics || []).forEach((topic, topicIndex) => {
          if (!topic.topic_id) return;
          map.set(String(topic.topic_id), {
            moduleId: String(module.module_id || ""),
            topicId: String(topic.topic_id || ""),
            moduleTitle: String(module.title || "Раздел"),
            topicTitle: String(topic.title || "Тема"),
            plannedDate: topic.planned_date ? String(topic.planned_date) : null,
            isExtra: Boolean(topic.is_extra),
            moduleOrder: Number(module.order_index ?? moduleIndex),
            topicOrder: Number(topic.order_index ?? topicIndex),
          });
        });
      });
    }
    return map;
  }, [curriculum]);

  const enriched = useMemo<TestItem[]>(() => {
    return tests.map((test) => {
      const meta = topicMeta.get(test.topicId);
      const subjectKey = test.subjectId || test.subjectSlug || test.subjectName || "other";
      const fallbackSubject = subjectLabel(test.subjectSlug, test.subjectName) || "Без предмета";
      const apiModuleTitle = test.moduleTitle.trim();
      const apiTopicTitle = test.topicTitle.trim();
      const hasModuleMeta = Boolean(meta?.moduleTitle) || Boolean(apiModuleTitle && apiModuleTitle !== "Без раздела");
      const hasTopicMeta = Boolean(meta?.topicTitle) || Boolean(apiTopicTitle && apiTopicTitle !== "Без темы");
      const isFallbackModule = !hasModuleMeta;
      const moduleTitle = hasModuleMeta ? (apiModuleTitle || meta?.moduleTitle || "Раздел") : fallbackSubject;
      const topicTitle = hasTopicMeta ? (apiTopicTitle || meta?.topicTitle || "Тема") : "Банки вопросов";
      const moduleKey = isFallbackModule
        ? `subject:${subjectKey}`
        : (test.moduleId || meta?.moduleId || moduleTitle);
      const topicKey = hasTopicMeta
        ? (test.topicId || meta?.topicId || topicTitle)
        : `${moduleKey}:banks`;
      return {
        ...test,
        moduleTitle,
        topicTitle,
        moduleKey,
        topicKey,
        moduleRank: isFallbackModule
          ? subjectRank(test.subjectSlug, test.subjectName)
          : (meta?.moduleOrder ?? 999),
        isFallbackModule,
      };
    });
  }, [tests, topicMeta]);

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
    if (!scoped || subjectFilter === "all") return scopedTests;
    return scopedTests.filter((test) => {
      const key = test.subjectId || test.subjectSlug || test.subjectName || "other";
      return key === subjectFilter;
    });
  }, [scopedTests, scoped, subjectFilter]);

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

  const modules = useMemo<ModuleGroup[]>(() => {
    const map = new Map<string, ModuleGroup>();
    for (const test of filtered) {
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
  }, [filtered]);

  useEffect(() => {
    if (moduleFilter === "all") return;
    if (!modules.some((module) => module.key === moduleFilter)) setModuleFilter("all");
  }, [modules, moduleFilter]);

  const groups = useMemo<TopicGroup[]>(() => {
    const map = new Map<string, TopicGroup>();
    for (const test of filtered) {
      if (moduleFilter !== "all" && test.moduleKey !== moduleFilter) continue;
      const key = test.topicKey;
      const meta = topicMeta.get(test.topicId);
      const current = map.get(key);
      if (current) {
        current.tests.push(test);
        current.questionCount += test.questionCount;
      } else {
        map.set(key, {
          key,
          moduleId: test.moduleKey,
          moduleTitle: test.moduleTitle,
          title: test.topicTitle,
          plannedDate: meta?.plannedDate || null,
          isExtra: Boolean(meta?.isExtra),
          moduleOrder: test.moduleRank,
          topicOrder: meta?.topicOrder ?? 999,
          questionCount: test.questionCount,
          tests: [test],
        });
      }
    }
    return Array.from(map.values())
      .map((group) => ({
        ...group,
        tests: group.tests.slice().sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title, "ru")),
      }))
      .sort((a, b) => {
        if (a.moduleOrder !== b.moduleOrder) return a.moduleOrder - b.moduleOrder;
        const moduleCompare = a.moduleTitle.localeCompare(b.moduleTitle, "ru");
        if (moduleCompare !== 0) return moduleCompare;
        if (a.topicOrder !== b.topicOrder) return a.topicOrder - b.topicOrder;
        return a.title.localeCompare(b.title, "ru");
      });
  }, [filtered, moduleFilter, topicMeta]);

  const totalQuestions = filtered.reduce((sum, test) => sum + test.questionCount, 0);
  const selectedMode = MODES.find((item) => item.id === mode) || MODES[0];
  const showModuleFilter = modules.length > 1 && modules.some((module) => !module.fallback);
  const hasActiveFilters = Boolean(search.trim()) || moduleFilter !== "all" || (!scoped && subjectFilter !== "all");

  function resetFilters() {
    setSearch("");
    setModuleFilter("all");
    if (!scoped) setSubjectFilter("all");
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
                    : "Гистология, физиология и органическая химия в одном меню: предмет → раздел → тема → банк. Режим выбирается один раз."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                {filtered.length} {plural(filtered.length, "банк", "банка", "банков")}
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
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[var(--muted)]" />
            <span className="text-sm font-semibold text-slate-700">Режим:</span>
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.hint}
                onClick={() => setMode(item.id)}
                className={
                  "rounded-xl border px-3 py-2 text-xs font-bold transition sm:text-sm " +
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
            <span>случайных вопросов из банка; если вопросов меньше — будут использованы все.</span>
          </label>
        )}

        {showModuleFilter && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3" aria-label="Раздел">
            <button
              type="button"
              onClick={() => setModuleFilter("all")}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-bold transition " +
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
                    className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-3 transition hover:border-indigo-200 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                  >
                    <div className="min-w-0">
                      <h3 className="font-bold leading-snug text-slate-900">
                        {test.title.trim().toLowerCase() === group.title.trim().toLowerCase()
                          ? "Тест по теме занятия"
                          : test.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                        <span>{test.questionCount} {plural(test.questionCount, "вопрос", "вопроса", "вопросов")}</span>
                        <span>Источник: {test.source}</span>
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
        </div>
      )}
    </section>
  );
}

export default TestsHub;
