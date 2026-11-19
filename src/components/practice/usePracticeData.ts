"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { useAuth } from "@/components/auth/AuthProvider";
import { resolveSubjectSlug, subjectDisplayName } from "@/lib/subjectSlug";
import { useApiRequest } from "@/hooks/useApiRequest";

import { KINDS, PAGE_SIZE, UUID, subjectRank, type SubjectOption } from "./model";

/**
 * Данные и действия страницы «База вопросов».
 *
 * Состояние фильтров, загрузка предметов/списка/счётчиков и работа с
 * избранным и заметками живут здесь, а разметка — в компонентах списка,
 * фильтров и карточки вопроса.
 */
export function usePracticeData() {
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

  return {
    authLoading,
    query, setQuery,
    debouncedQuery,
    subjectId, subjectSlug,
    kind, setKind,
    subjects, subjectsLoading, subjectsError,
    subjectCounts, allQuestionsTotal, subjectTotal,
    subjectsById,
    items, total, loading, reloadList, queryError,
    page, setPage,
    hasFilters, activeSubjectLabel, activeKind,
    selectSubject, resetFilters,
    selected, selectedLoading, openQuestion,
    showAnswer, setShowAnswer,
    draft, setDraft,
    favoriteIds, toggleSelectedFavorite,
    savedNote, setSavedNote, noteSaving, savedMessage,
    saveSelectedNote,
    actionError,
    detailRef, listRef,
  };
}
