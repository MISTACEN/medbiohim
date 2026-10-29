"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Microscope,
  Save,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import {
  getQuestion,
  hasToken,
  listFavorites,
  listNotes,
  listQuestions,
  listQuestionSubjects,
  toggleFavorite,
  upsertNote,
  type BankQuestion,
} from "@/lib/api";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import { QuestionReport } from "@/components/QuestionReport";
import { useAuth } from "@/components/auth/AuthProvider";
import { resolveSubjectSlug, subjectDisplayName } from "@/lib/subjectSlug";
import { useApiRequest } from "@/hooks/useApiRequest";

type SubjectOption = {
  id: string;
  slug: string;
  label: string;
};

const PAGE_SIZE = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAIN_SUBJECT_ORDER = ["histology", "physiology", "organic_chemistry"];

const KINDS = [
  { value: "", label: "Все типы" },
  { value: "mcq", label: "Тесты" },
  { value: "open", label: "Открытые" },
  { value: "theory", label: "Теория" },
];

function plural(n: number, one: string, few: string, many: string) {
  const value = Math.abs(n) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

function subjectRank(slug: string) {
  const canonical = resolveSubjectSlug(slug);
  const index = MAIN_SUBJECT_ORDER.indexOf(canonical);
  return index === -1 ? 99 : index;
}

function questionTypeLabel(type?: string | null) {
  const value = String(type || "").trim().toLowerCase();
  if (!value) return "";
  if (["mc", "mcq", "single", "single_choice", "single-choice"].includes(value)) return "Тест";
  if (["open", "text", "short_answer", "short-answer"].includes(value)) return "Открытый";
  if (value === "task") return "Задача";
  if (value === "theory") return "Теория";
  if (value === "practical") return "Практика";
  if (value === "main") return "Основной";
  if (value === "ticket") return "Билетный";
  if (["true_false", "truefalse", "true-false"].includes(value)) return "Верно/неверно";
  if (["matching", "match"].includes(value)) return "Соответствие";
  return value.toUpperCase();
}

function optionText(option: any) {
  return typeof option === "string" ? option : String(option?.label ?? "");
}

function optionKey(option: any, index: number) {
  if (typeof option === "string") return String.fromCharCode(65 + index);
  return option?.key != null && String(option.key).trim() ? String(option.key) : String.fromCharCode(65 + index);
}

function answerPreview(value: any) {
  const answer = String(value ?? "").trim();
  if (!answer || /^\d{1,2}$/.test(answer)) return "";
  return answer;
}

function optionIsCorrect(option: any) {
  return typeof option !== "string" && option?.correct === true;
}

function isChoiceQuestion(question: any) {
  const type = String(question?.type || "").trim().toLowerCase();
  const options = Array.isArray(question?.options) ? question.options : [];
  if (["open", "text", "short_answer", "short-answer", "theory"].includes(type)) return false;
  if (["mc", "mcq", "single", "single_choice", "single-choice", "multiple_choice", "multiple-choice"].includes(type)) {
    return options.length > 0;
  }
  // Unknown types: a single option is usually a placeholder such as
  // "(открытый/соответствие)", not a real answer choice.
  return options.length > 1;
}

function officialAnswerText(question: any) {
  const answer = String(question?.answer || "").trim();
  if (!answer) return "Эталон пока пуст";
  if (!isChoiceQuestion(question) && /^\d{1,2}$/.test(answer)) return `См. ключ (${answer})`;
  return answer;
}

function correctOptionIndexes(question: any) {
  const options = Array.isArray(question?.options) ? question.options : [];
  if (!options.length) return [];
  const explicit = options.flatMap((option: any, index: number) => (optionIsCorrect(option) ? [index] : []));
  if (explicit.length) return explicit;
  if (typeof question?.correct === "number" && question.correct >= 0 && question.correct < options.length) {
    return [question.correct];
  }
  return [];
}

function correctOptionIndex(question: any) {
  return correctOptionIndexes(question)[0] ?? -1;
}

function referenceText(question: any) {
  const display = String(question?.answer_display || "").trim();
  if (display) return display;
  const indexes = correctOptionIndexes(question);
  if (indexes.length) {
    return indexes
      .map((index: number) => `${optionKey(question.options[index], index)}) ${optionText(question.options[index])}`)
      .join("; ");
  }
  return officialAnswerText(question);
}

function PracticePageInner() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<BankQuestion | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [showAnswer, setShowAnswer] = useState(true);
  const [draft, setDraft] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [savedNote, setSavedNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [filtersReady, setFiltersReady] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const openSequence = useRef(0);

  // Older subject pages link with `subject=<uuid>`. Keep that deep link
  // contract while also accepting the explicit subject_id/subject_slug form.
  const legacySubject = searchParams.get("subject") || "";
  const initialId = searchParams.get("subject_id") || (UUID.test(legacySubject) ? legacySubject : "");
  const initialSlug = searchParams.get("subject_slug") || (!initialId ? legacySubject : "");
  useEffect(() => {
    if (initialId) setSubjectId(initialId);
    if (initialSlug) setSubjectSlug(resolveSubjectSlug(initialSlug));
    setFiltersReady(true);
  }, [initialId, initialSlug]);

  const { data: subjectsLoad, loading: subjectsLoading } = useApiRequest<{ subjects: SubjectOption[]; error: string | null }>(async () => {
    if (!hasToken()) return { subjects: [], error: null };
    try {
      const result: any = await listQuestionSubjects();
      if (!result.ok) {
        return { subjects: [], error: result.error?.message || "Не удалось загрузить предметы." };
      }
      const map = new Map<string, SubjectOption>();
      for (const raw of result.data?.items || []) {
        const id = String(raw.subject_id || "");
        const slug = resolveSubjectSlug(raw.subject_slug, raw.subject);
        const key = id || slug;
        if (!key) continue;
        map.set(key, { id, slug, label: subjectDisplayName(slug, raw.subject) });
      }
      const next = Array.from(map.values()).sort((a, b) => {
        const rank = subjectRank(a.slug) - subjectRank(b.slug);
        return rank !== 0 ? rank : a.label.localeCompare(b.label, "ru");
      });
      return { subjects: next, error: null };
    } catch {
      return { subjects: [], error: "Не удалось загрузить предметы." };
    }
  }, [user?.id], { enabled: !authLoading });

  const subjects = useMemo(() => subjectsLoad?.subjects ?? [], [subjectsLoad]);
  const subjectsError = subjectsLoad?.error ?? null;

  const { data: countsLoad } = useApiRequest<{ all: number | null; counts: Record<string, number> }>(async () => {
    if (!hasToken() || !subjects.length) return { all: null, counts: {} };
    try {
      const [allResult, ...rows]: any[] = await Promise.all([
        listQuestions({ limit: 1, include_answer: 1 }),
        ...subjects.map((subject) => listQuestions({
          subject_id: subject.id || undefined,
          subject_slug: subject.id ? undefined : (subject.slug || undefined),
          limit: 1,
          include_answer: 1,
        }).then((result: any) => [
          subject.id || subject.slug,
          result.ok ? Number(result.data?.total || 0) : 0,
        ] as const)),
      ]);
      return {
        all: allResult?.ok ? Number(allResult.data?.total || 0) : null,
        counts: Object.fromEntries(rows),
      };
    } catch {
      return { all: null, counts: {} };
    }
  }, [subjects, user?.id], { enabled: !authLoading });

  const allQuestionsTotal = countsLoad?.all ?? null;
  const subjectCounts = countsLoad?.counts ?? {};

  const { data: fetchedFavoriteIds } = useApiRequest<Set<string>>(async () => {
    if (!hasToken()) return new Set<string>();
    const result: any = await listFavorites();
    if (!result.ok) return new Set<string>();
    return new Set(
      (result.data?.items || [])
        .filter((item: any) => item.target_type === "question")
        .map((item: any) => String(item.target_id)),
    );
  }, [user?.id], { enabled: !authLoading });

  useEffect(() => {
    if (fetchedFavoriteIds) setFavoriteIds(fetchedFavoriteIds);
  }, [fetchedFavoriteIds]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data: listLoad, loading, reload: reloadList } = useApiRequest<{
    items: BankQuestion[];
    total: number;
    error: string | null;
  }>(async () => {
    if (!hasToken()) return { items: [], total: 0, error: null };
    try {
      const result: any = await listQuestions({
        subject_id: subjectId || undefined,
        subject_slug: subjectId ? undefined : (subjectSlug || undefined),
        kind: kind || undefined,
        q: debouncedQuery || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        include_answer: 1,
      });
      if (!result.ok) {
        return { items: [], total: 0, error: result.error?.message || "Не удалось загрузить вопросы." };
      }
      return { items: result.data?.items || [], total: Number(result.data?.total || 0), error: null };
    } catch {
      return { items: [], total: 0, error: "Не удалось загрузить вопросы." };
    }
  }, [filtersReady, subjectId, subjectSlug, kind, debouncedQuery, page, user?.id], { enabled: filtersReady && !authLoading });

  const items = listLoad?.items ?? [];
  const total = listLoad?.total ?? 0;
  const queryError = listLoad?.error ?? null;

  useEffect(() => {
    // A question from the previous filter should not stay open when the
    // subject/type/search changes. Bumping the sequence also cancels an
    // in-flight detail request for that question.
    openSequence.current += 1;
    setPage(0);
    setSelected(null);
    setSelectedLoading(false);
  }, [subjectId, subjectSlug, kind, debouncedQuery]);

  const subjectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const subject of subjects) {
      if (subject.id) map.set(subject.id, subject.label);
    }
    return map;
  }, [subjects]);

  const activeSubject = subjects.find((subject) => (
    subjectId ? subject.id === subjectId : subjectSlug ? subject.slug === subjectSlug : false
  )) || null;
  const activeSubjectLabel = activeSubject?.label
    || (subjectSlug ? subjectDisplayName(subjectSlug) : subjectId ? "Выбранный предмет" : "Все предметы");
  const activeKind = KINDS.find((item) => item.value === kind) || KINDS[0];
  const hasFilters = Boolean(subjectId || subjectSlug || kind || debouncedQuery);
  const subjectTotal = Object.values(subjectCounts).reduce((sum, value) => sum + value, 0);

  function selectSubject(subject: SubjectOption | null) {
    setSubjectId(subject?.id || "");
    setSubjectSlug(subject?.slug || "");
    setPage(0);
  }

  function resetFilters() {
    setSubjectId("");
    setSubjectSlug("");
    setKind("");
    setQuery("");
    setDebouncedQuery("");
    setPage(0);
  }

  function scrollDetailIntoView() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    }
  }

  async function openQuestion(id: string) {
    const sequence = ++openSequence.current;
    setSelectedLoading(true);
    setShowAnswer(true);
    setDraft("");
    setActionError(null);
    setSavedMessage(null);
    scrollDetailIntoView();
    try {
      const [questionResult, notesResult]: any[] = await Promise.all([getQuestion(id), listNotes()]);
      if (sequence !== openSequence.current) return;
      if (!questionResult.ok) {
        setActionError(questionResult.error?.message || "Не удалось открыть вопрос.");
        setSelectedLoading(false);
        return;
      }
      setSelected(questionResult.data?.question || null);
      const mine = notesResult.ok
        ? (notesResult.data?.items || []).find(
            (item: any) => item.target_type === "question" && String(item.target_id) === String(id),
          )
        : null;
      setSavedNote(String(mine?.text || ""));
      setSelectedLoading(false);
      scrollDetailIntoView();
    } catch {
      if (sequence !== openSequence.current) return;
      setActionError("Не удалось открыть вопрос.");
      setSelectedLoading(false);
    }
  }

  async function toggleSelectedFavorite() {
    if (!selected) return;
    const result: any = await toggleFavorite("question", selected.id);
    if (!result.ok) {
      setActionError(result.error?.message || "Не удалось изменить избранное.");
      return;
    }
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (result.data?.favorited) next.add(String(selected.id));
      else next.delete(String(selected.id));
      return next;
    });
  }

  async function saveSelectedNote() {
    if (!selected) return;
    setNoteSaving(true);
    setActionError(null);
    setSavedMessage(null);
    const result: any = await upsertNote("question", selected.id, savedNote);
    setNoteSaving(false);
    if (!result.ok) {
      setActionError(result.error?.message || "Не удалось сохранить заметку.");
      return;
    }
    setSavedMessage("Заметка сохранена");
  }

  if (authLoading) {
    return (
      <div className="card flex items-center gap-3 p-8 text-sm text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Загружаю базу вопросов…
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <BookOpenCheck className="mx-auto h-9 w-9 text-indigo-300" />
        <p className="mt-3 font-semibold text-slate-800">Войдите, чтобы открыть базу вопросов.</p>
        <p className="mt-1 text-sm text-slate-500">Вопросы и эталоны доступны без запуска теста.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">База знаний · эталоны</p>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">База вопросов</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Гистология, физиология и органическая химия в одном месте. Выберите предмет и тип вопроса — откройте карточку, чтобы сразу увидеть эталон.
                Микропрепараты с фото и подписями — в отдельном атласе, тренажёр открывается оттуда же.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs">
            <Link
              href="/atlas"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
            >
              <Microscope className="h-3.5 w-3.5" /> Атлас микропрепаратов
            </Link>
            <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
              {total} {plural(total, "вопрос", "вопроса", "вопросов")}
            </span>
            {subjects.length > 0 && (
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                {subjects.length} {plural(subjects.length, "предмет", "предмета", "предметов")}
              </span>
            )}
            {favoriteIds.size > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold text-[var(--status-warn-fg)] shadow-sm">
                <Star className="h-3.5 w-3.5 fill-current" /> {favoriteIds.size}
              </span>
            )}
          </div>
        </div>
      </section>

      {queryError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">
          <span>{queryError}</span>
          <button
            type="button"
            onClick={reloadList}
            className="rounded-lg border border-[var(--status-critical-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)]"
          >
            Повторить
          </button>
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{actionError}</div>
      )}
      {subjectsError && (
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">{subjectsError}</div>
      )}

      <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" aria-label="Предмет">
          <button
            type="button"
            onClick={() => selectSubject(null)}
            className={
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition " +
              (!subjectId && !subjectSlug
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
            }
          >
            Все предметы
            {(allQuestionsTotal ?? subjectTotal) > 0 && (
              <span className={"rounded-full px-2 py-0.5 text-xs " + (!subjectId && !subjectSlug ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                {allQuestionsTotal ?? subjectTotal}
              </span>
            )}
          </button>
          {subjectsLoading ? (
            <span className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаю предметы…
            </span>
          ) : (
            subjects.map((subject) => {
              const count = subjectCounts[subject.id || subject.slug];
              const active = subjectId ? subject.id === subjectId : Boolean(subjectSlug && subject.slug === subjectSlug);
              return (
                <button
                  key={subject.id || subject.slug}
                  type="button"
                  onClick={() => selectSubject(subject)}
                  className={
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition " +
                    (active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
                  }
                >
                  {subject.label}
                  {typeof count === "number" && (
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 md:flex-wrap" aria-label="Тип вопроса">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            {KINDS.map((item) => (
              <button
                key={item.value || "all"}
                type="button"
                onClick={() => setKind(item.value)}
                className={
                  "shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition sm:text-sm " +
                  (kind === item.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-[var(--border)] bg-[var(--card)] text-slate-600 hover:border-indigo-300")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="relative block w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти вопрос по тексту…"
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            />
          </label>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 text-xs text-slate-500">
            <span>
              Показано: <b className="text-slate-700">{activeSubjectLabel}</b>
              {kind ? ` · ${activeKind.label}` : ""}
              {debouncedQuery ? ` · «${debouncedQuery}»` : ""}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 font-semibold text-slate-700 hover:border-indigo-300"
            >
              Сбросить
            </button>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div ref={listRef} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700">
              {loading ? "Ищу вопросы…" : `Найдено: ${total}`}
            </div>
            <div className="text-xs text-slate-500">Страница {page + 1}</div>
          </div>

          <div className="card p-2 sm:p-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="animate-pulse rounded-xl border border-[var(--border)] p-3">
                    <div className="h-3 w-24 rounded bg-slate-200" />
                    <div className="mt-3 h-4 w-full rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-2/3 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
                <Search className="h-8 w-8 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-800">Ничего не найдено</p>
                <p className="mt-1 text-sm text-slate-500">Измените предмет, тип вопроса или поисковый запрос.</p>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item: any) => {
                  const active = String(selected?.id || "") === String(item.id);
                  const itemSubject = subjectsById.get(String(item.subject_id || ""))
                    || (item.subject ? String(item.subject) : activeSubjectLabel);
                  const typeLabel = questionTypeLabel(item.type);
                  const preview = item.has_answer ? answerPreview(item.answer) : "";
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void openQuestion(item.id)}
                        className={
                          "w-full rounded-xl border px-3 py-3 text-left transition " +
                          (active
                            ? "border-indigo-300 bg-indigo-50/80"
                            : "border-transparent hover:border-indigo-200 hover:bg-indigo-50/40")
                        }
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{itemSubject}</span>
                          {typeLabel && (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{typeLabel}</span>
                          )}
                          {item.has_answer ? (
                            <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 font-semibold text-[var(--status-ok-fg)]">Ответ есть</span>
                          ) : (
                            <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 font-semibold text-[var(--status-warn-fg)]">Без ответа</span>
                          )}
                          {favoriteIds.has(String(item.id)) && <Star className="h-3.5 w-3.5 fill-current text-[var(--status-warn-fg)]" />}
                        </div>
                        <div className="mt-2 line-clamp-3 text-sm font-semibold leading-5 text-slate-900">
                          {item.text || item.stem || "Вопрос"}
                        </div>
                        {preview && (
                          <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--status-ok-fg)]">
                            <span className="font-semibold">Ответ:</span> {preview}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              Страница {page + 1} · вопросы {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Назад
              </button>
              <button
                type="button"
                disabled={(page + 1) * PAGE_SIZE >= total || loading}
                onClick={() => setPage((value) => value + 1)}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
              >
                Далее <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={detailRef}
          className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto"
        >
          {selectedLoading ? (
            <div className="card flex min-h-[320px] items-center justify-center p-8 text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загружаю вопрос…
            </div>
          ) : !selected ? (
            <div className="card hidden min-h-[320px] flex-col items-center justify-center p-8 text-center lg:flex">
              <BookOpenCheck className="h-9 w-9 text-indigo-300" />
              <p className="mt-3 font-semibold text-slate-800">Выберите вопрос из списка</p>
              <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                Правильный ответ доступен сразу — тест запускать не нужно. Можно сохранить заметку и добавить вопрос в избранное.
              </p>
            </div>
          ) : (
            <article className="card space-y-4 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                      {selected.subject_slug || selected.subject_name
                        ? subjectDisplayName(selected.subject_slug, selected.subject_name)
                        : activeSubjectLabel}
                    </span>
                    {selected.topic && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{String(selected.topic)}</span>
                    )}
                    {questionTypeLabel(selected.type) && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                        {questionTypeLabel(selected.type)}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-extrabold leading-snug text-slate-950">
                    <ChemRichText text={selected.text || selected.stem || "Вопрос"} />
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void toggleSelectedFavorite()}
                    className={
                      "rounded-xl border p-2 " +
                      (favoriteIds.has(String(selected.id))
                        ? "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
                        : "border-[var(--border)] bg-[var(--card)] text-slate-500 hover:text-[var(--status-warn-fg)]")
                    }
                    aria-label="Добавить в избранное"
                    title="Избранное"
                  >
                    <Star className={"h-4 w-4 " + (favoriteIds.has(String(selected.id)) ? "fill-current" : "")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-slate-500 lg:hidden"
                    aria-label="К списку"
                    title="К списку"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <QuestionReport questionId={String(selected.id)} />

              <div className="space-y-2 rounded-xl border border-[var(--border)] bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Моя заметка</div>
                <textarea
                  value={savedNote}
                  onChange={(event) => setSavedNote(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                  placeholder="Что нужно запомнить по этому вопросу…"
                />
                <button
                  type="button"
                  disabled={noteSaving}
                  onClick={() => void saveSelectedNote()}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {noteSaving ? "Сохранение…" : "Сохранить заметку"}
                </button>
                {savedMessage && <div className="text-xs font-semibold text-[var(--status-ok-fg)]">{savedMessage}</div>}
              </div>

              {isChoiceQuestion(selected) ? (
                <div className="space-y-2">
                  {selected.options.map((option: any, index: number) => {
                    const isSelected = draft === String(index);
                    const isCorrect = correctOptionIndexes(selected).includes(index);
                    const stateClass = showAnswer && isCorrect
                      ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]"
                      : showAnswer && isSelected && !isCorrect
                        ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]"
                        : isSelected
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-[var(--border)] bg-white";
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setDraft(String(index))}
                        className={"flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition " + stateClass}
                      >
                        <span className={
                          "mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold " +
                          (showAnswer && isCorrect ? "bg-[var(--status-ok-fg)] text-white" : "bg-white text-slate-500")
                        }>
                          {optionKey(option, index)}
                        </span>
                        <span className="min-w-0 flex-1">{optionText(option)}</span>
                        {showAnswer && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-[var(--border)] p-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Ваш ответ (черновик)…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              )}

              <button
                type="button"
                className="btn-primary inline-flex items-center gap-2 text-sm"
                onClick={() => setShowAnswer((value) => !value)}
              >
                {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showAnswer ? "Скрыть эталон" : "Показать эталон"}
              </button>

              {showAnswer && (
                <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/80 p-4 text-sm text-slate-800">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--status-ok-fg)]">
                    Официальный ответ
                  </div>
                  {isChoiceQuestion(selected) && correctOptionIndexes(selected).length ? (
                    <p className="whitespace-pre-wrap font-semibold">{referenceText(selected)}</p>
                  ) : (
                    <ChemRichText text={referenceText(selected)} asHtml />
                  )}
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Загрузка…</div>}>
      <PracticePageInner />
    </Suspense>
  );
}
