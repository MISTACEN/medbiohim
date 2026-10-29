"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileQuestion,
  FileText,
  GraduationCap,
  Library,
  Loader2,
  Microscope,
  Search,
  Sparkles,
} from "lucide-react";
import {
  globalSearch,
  suggestSearch,
  type SearchHit,
  type SearchSuggestion,
} from "@/lib/features-api";
import { listSubjectsCatalog } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { normalizeLibraryText, searchLibrary } from "@/lib/library";

/**
 * Значения должны совпадать со словарём Worker'а (`workers/api/src/routes/search.ts`),
 * иначе фильтр снова начнёт возвращать 422 на любой выбор.
 */
const TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "preparations", label: "Препараты" },
  { value: "materials", label: "Учебники и материалы" },
  { value: "subjects", label: "Предметы" },
  { value: "questions", label: "Вопросы" },
  { value: "tickets", label: "Билеты" },
  { value: "lectures", label: "Лекции" },
];

const TYPE_LABEL: Record<string, string> = {
  preparation: "Микропрепарат",
  subject: "Предмет",
  material: "Материал",
  question: "Вопрос",
  ticket: "Билет",
  lecture: "Лекция",
};

const TYPE_ICON: Record<string, typeof BookOpen> = {
  preparation: Microscope,
  subject: Library,
  material: FileText,
  question: FileQuestion,
  ticket: GraduationCap,
  lecture: BookOpen,
};

const OPEN_LABEL: Record<string, string> = {
  preparation: "Открыть препарат →",
  subject: "Открыть предмет →",
  material: "Открыть материал →",
  lecture: "Открыть лекции →",
  question: "Открыть вопросы →",
  ticket: "Открыть билеты →",
};

const DEFAULT_EXAMPLES = [
  "препарат почка",
  "кровь мазок",
  "учебник по гистологии",
  "учебник по физиологии",
  "билет физиология",
];

/** Старые ссылки с типом «question»/«ticket» продолжают работать. */
const TYPE_ALIASES: Record<string, string> = {
  question: "questions",
  questions: "questions",
  ticket: "tickets",
  tickets: "tickets",
  lecture: "lectures",
  lectures: "lectures",
  material: "materials",
  materials: "materials",
  textbook: "materials",
  textbooks: "materials",
  preparation: "preparations",
  preparations: "preparations",
  subject: "subjects",
  subjects: "subjects",
};

/**
 * Статические пособия (физиология) не лежат в таблице materials, поэтому
 * подмешиваем их на клиенте. Дубли с API отбрасываем по нормализованному
 * названию, фильтры типа и предмета — те же, что у сервера.
 */
function withLibrary(
  hits: SearchHit[],
  query: string,
  type?: string,
  subjectSlug?: string
): SearchHit[] {
  if (type && type !== "materials") return hits;
  const local = searchLibrary(query, subjectSlug || undefined);
  if (!local.length) return hits;
  const seen = new Set(hits.map((hit) => normalizeLibraryText(hit.title)));
  const extra = local.filter((hit) => !seen.has(normalizeLibraryText(hit.title)));
  if (!extra.length) return hits;
  return [...hits, ...extra].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function librarySuggestions(query: string): SearchSuggestion[] {
  return searchLibrary(query).slice(0, 3).map((hit) => ({
    id: hit.href,
    type: hit.type,
    type_label: hit.type_label,
    title: hit.title,
    subject: hit.subject,
    hint: hit.hint,
    href: hit.href,
    count: 1,
  }));
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchHit[]>([]);
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
        setSubjects(
          list
            .map((item) => ({ name: String(item.name || ""), slug: String(item.slug || "") }))
            .filter((item) => item.name && item.slug)
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Search className="h-7 w-7 text-[var(--primary)]" />
          Поиск
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Препараты и электронограммы, учебники и материалы, предметы, вопросы, билеты и лекции — в одном поиске.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setActiveSuggestion(-1); }}
              onKeyDown={onKeyDown}
              onFocus={() => { if (suggestions.length || suggestEmpty) setSuggestOpen(true); }}
              onBlur={() => { setTimeout(() => setSuggestOpen(false), 120); }}
              placeholder="препарат почка, учебник по гистологии, билет физиология…"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestOpen}
              aria-controls="search-suggestions"
              aria-activedescendant={activeSuggestion >= 0 ? `search-suggestion-${activeSuggestion}` : undefined}
              aria-label="Поисковый запрос"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-3 pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
            {suggestLoading && (
              <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />
            )}

            {suggestOpen && (suggestions.length > 0 || suggestEmpty) && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
                <div className="border-b border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted)]">
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {suggestEmpty
                    ? "поиск по препаратам, учебникам и предметам"
                    : `${suggestHint || "подсказки"} · ↑↓ выбрать, Enter открыть`}
                </div>
                <ul id="search-suggestions" role="listbox" aria-label="Подсказки поиска" className="max-h-80 overflow-y-auto">
                  {suggestEmpty && (
                    <li role="presentation" className="px-3 py-3 text-sm">
                      <p className="font-medium">Ничего не найдено</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Проверьте название или выберите пример — поиск идёт по препаратам, учебникам и предметам.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {examples.slice(0, 4).map((example) => (
                          <button
                            key={example}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => applyExample(example)}
                            className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] hover:border-[var(--primary)]"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </li>
                  )}
                  {suggestions.map((item, index) => {
                    const Icon = TYPE_ICON[item.type] || BookOpen;
                    return (
                      <li key={`${item.type}-${item.id}`} id={`search-suggestion-${index}`} role="option" aria-selected={index === activeSuggestion}>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveSuggestion(index)}
                          onClick={() => { setSuggestOpen(false); router.push(item.href); }}
                          className={
                            "flex w-full items-start gap-2.5 px-3 py-2 text-left transition " +
                            (index === activeSuggestion ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--background)]")
                          }
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-snug">{item.title}</span>
                            <span className="mt-0.5 block text-xs text-[var(--muted)]">
                              <span className="font-semibold">{item.type_label}</span>
                              {item.subject ? ` · ${item.subject}` : ""}
                              {item.hint ? ` · ${item.hint}` : ""}
                              {item.count > 1 ? ` · ${item.count} шт.` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Тип результатов"
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={subjectSlug}
            onChange={(e) => setSubjectSlug(e.target.value)}
            aria-label="Фильтр по предмету"
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm"
          >
            <option value="">Все предметы</option>
            {subjects.map((subject) => (
              <option key={subject.slug} value={subject.slug}>{subject.name}</option>
            ))}
          </select>

          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Найти
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Можно писать как удобно: «препарат почка», «учебник по гистологии», «билет физиология». Слово-тип в начале
          задаёт раздел, остальное ищется по названию, предмету и файлу пособия.
        </p>
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {!searched && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">Что можно найти</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            <li>• <strong className="text-[var(--text)]">Препараты</strong> — «почка», «кровь мазок», «нейтрофил».</li>
            <li>• <strong className="text-[var(--text)]">Учебники и материалы</strong> — «учебник по гистологии», «учебник по физиологии», «атлас».</li>
            <li>• <strong className="text-[var(--text)]">Предметы и билеты</strong> — «физиология», «билет биохимия».</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => applyExample(example)}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--primary)]"
              >
                {example}
              </button>
            ))}
          </div>
        </section>
      )}

      {searched && !loading && (
        <p className="text-sm text-[var(--muted)]">
          {total > 0 ? `Найдено: ${total}` : "Ничего не найдено"}
          {intentHint ? ` · ${intentHint}` : ""}
        </p>
      )}

      {searched && !loading && items.length === 0 && !error && (
        <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
          <p className="font-medium">Уточните запрос</p>
          <p className="text-[var(--muted)]">
            Ищите по названию препарата, учебника или предмета. Например: «препарат почка», «учебник по гистологии»,
            «учебник по физиологии»,
            «билет физиология».
          </p>
          <div className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => applyExample(example)}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--primary)]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {items.map((hit) => {
          const Icon = TYPE_ICON[hit.type] || BookOpen;
          return (
            <li
              key={hit.type + hit.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition hover:border-[var(--primary)]/40"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="rounded-full bg-[var(--background)] px-2 py-0.5 font-medium">
                      {hit.type_label || TYPE_LABEL[hit.type] || hit.type}
                    </span>
                    {hit.subject && <span>{hit.subject}</span>}
                    {hit.topic && <span>· {hit.topic}</span>}
                    {hit.count && hit.count > 1 && <span>· {hit.count} шт.</span>}
                  </div>
                  <div className="mt-1 font-semibold leading-snug">{hit.title}</div>
                  <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{hit.snippet}</p>
                  {hit.has_answer && hit.answer && (hit.type === "question" || hit.type === "ticket") && (
                    <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">Показать ответ</summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{hit.answer}</p>
                    </details>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={hit.href} className="text-xs font-semibold text-[var(--primary)] hover:underline">
                      {OPEN_LABEL[hit.type] || "Открыть раздел →"}
                    </Link>
                    <Link
                      href="/tutor"
                      className="text-xs text-[var(--muted)] hover:text-[var(--primary)]"
                      onClick={() => {
                        try {
                          sessionStorage.setItem("tutor_prefill", hit.title);
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Спросить тьютора
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl p-8 text-sm text-[var(--muted)]">Загрузка…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
