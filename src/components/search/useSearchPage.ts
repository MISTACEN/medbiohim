"use client";

/** Глобальный поиск: запрос, подсказки с задержкой, фильтры и результаты. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { globalSearch, suggestSearch, type SearchHit, type SearchSuggestion } from "@/lib/features-api";
import { listSubjectsCatalog } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { normalizeLibraryText } from "@/lib/library";
import {
  DEFAULT_EXAMPLES,
  TYPE_ALIASES,
  librarySuggestions,
  loadLectureIndex,
  searchLectures,
  withLibrary,
  type LectureSearchItem,
} from "@/components/search/model";

export type SearchState = ReturnType<typeof useSearchPage>;

export function useSearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchHit[]>([]);
  const [lectureHits, setLectureHits] = useState<LectureSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [subjects, setSubjects] = useState<Array<{ name: string; slug: string }>>([]);

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestHint, setSuggestHint] = useState("");
  const [suggestEmpty, setSuggestEmpty] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [intentHint, setIntentHint] = useState("");
  const [examples, setExamples] = useState<string[]>(DEFAULT_EXAMPLES);
  const suggestSeq = useRef(0);

  const run = useCallback(async (query: string, type?: string, subjectFilter?: string) => {
    const qq = query.trim();
    if (!qq) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setSuggestOpen(false);
    setSuggestEmpty(false);
    const res = await globalSearch(qq, { limit: 30, type: type || undefined, subject_slug: subjectFilter || undefined });
    setLoading(false);
    // конспекты ищутся на клиенте по лёгкому индексу — независимо от API
    void loadLectureIndex().then((index) => setLectureHits(searchLectures(index, qq)));
    if (!res.ok) {
      setError(describeApiError(res.error));
      const fallback = withLibrary([], qq, type, subjectFilter);
      setItems(fallback);
      setTotal(fallback.length);
      return;
    }
    const merged = withLibrary(res.data.items || [], qq, type, subjectFilter);
    setItems(merged);
    setTotal(Math.max(Number(res.data.total || 0), merged.length));
    setIntentHint(String(res.data.intent?.hint || ""));
    if (res.data.examples?.length) setExamples(res.data.examples);
  }, []);

  const initialQuery = (searchParams.get("q") || "").trim();
  const initialType = TYPE_ALIASES[(searchParams.get("type") || "").trim().toLowerCase()] || "";
  const initialSubject = (searchParams.get("subject_slug") || "").trim();

  useEffect(() => {
    if (!initialQuery || searched) return;
    setQ(initialQuery);
    setTypeFilter(initialType);
    setSubjectSlug(initialSubject);
    void run(initialQuery, initialType, initialSubject);
  }, [searched, run, initialQuery, initialType, initialSubject]);

  // Список предметов — из каталога, а не из зашитых шести названий.
  useEffect(() => {
    void listSubjectsCatalog().then((result) => {
      if (result.ok) {
        const list = (result.data as { items?: Array<{ name?: string; slug?: string }> })?.items || [];
        // Дедупликация по слагу: у предмета бывает несколько активных строк
        // (курсы/семестры), а пункты фильтра ключуются слагом.
        const seen = new Set<string>();
        setSubjects(
          list
            .map((item) => ({ name: String(item.name || ""), slug: String(item.slug || "") }))
            .filter((item) => item.name && item.slug)
            .filter((item) => (seen.has(item.slug) ? false : (seen.add(item.slug), true)))
        );
      }
    });
  }, []);

  // Подсказки с задержкой: не дёргаем API на каждую букву и игнорируем
  // устаревшие ответы, если пользователь уже напечатал другое.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setSuggestHint("");
      setSuggestEmpty(false);
      return;
    }
    const seq = suggestSeq.current + 1;
    suggestSeq.current = seq;
    setSuggestLoading(true);
    const timer = setTimeout(async () => {
      const res = await suggestSearch(term, 8);
      if (seq !== suggestSeq.current) return;
      setSuggestLoading(false);
      const local = librarySuggestions(term);
      const remote = res.ok ? res.data.items || [] : [];
      const seen = new Set(local.map((item) => normalizeLibraryText(item.title)));
      const merged = [...local, ...remote.filter((item) => !seen.has(normalizeLibraryText(item.title)))]
        .filter((item, index, list) => list.findIndex((other) => normalizeLibraryText(other.title) === normalizeLibraryText(item.title)) === index)
        .slice(0, 8);
      setSuggestions(merged);
      setSuggestEmpty(res.ok && merged.length === 0);
      setSuggestOpen(merged.length > 0 || (res.ok && merged.length === 0));
      setActiveSuggestion(-1);
      if (!res.ok) return;
      setSuggestHint(String(res.data.hint || ""));
      if (res.data.examples?.length) setExamples(res.data.examples);
    }, 220);
    return () => {
      clearTimeout(timer);
      setSuggestLoading(false);
    };
  }, [q]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (suggestOpen && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      router.push(suggestions[activeSuggestion].href);
      return;
    }
    void run(q, typeFilter, subjectSlug);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!suggestOpen && suggestions.length) setSuggestOpen(true);
      setActiveSuggestion((current) => (suggestions.length ? (current + 1) % suggestions.length : -1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((current) => (suggestions.length ? (current - 1 + suggestions.length) % suggestions.length : -1));
      return;
    }
    if (e.key === "Escape") {
      setSuggestOpen(false);
      setActiveSuggestion(-1);
    }
  }

  function applyExample(example: string) {
    setQ(example);
    setTypeFilter("");
    setSubjectSlug("");
    void run(example);
  }

  return {
    router,
    q,
    setQ,
    loading,
    items,
    lectureHits,
    total,
    error,
    searched,
    typeFilter,
    setTypeFilter,
    subjectSlug,
    setSubjectSlug,
    subjects,
    suggestions,
    suggestOpen,
    setSuggestOpen,
    suggestLoading,
    suggestHint,
    suggestEmpty,
    activeSuggestion,
    setActiveSuggestion,
    intentHint,
    examples,
    run,
    onSubmit,
    onKeyDown,
    applyExample,
  };
}
