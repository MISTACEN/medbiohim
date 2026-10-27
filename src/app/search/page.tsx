"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { globalSearch, type SearchHit } from "@/lib/features-api";
import { listSubjectsCatalog } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { Search, Loader2, BookOpen, FileQuestion, GraduationCap, FileText } from "lucide-react";

/**
 * Значения должны совпадать со словарём Worker'а (`workers/api/src/routes/search.ts`),
 * иначе фильтр снова начнёт возвращать 422 на любой выбор.
 */
const TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "questions", label: "Вопросы" },
  { value: "tickets", label: "Билеты" },
  { value: "lectures", label: "Лекции" },
  { value: "materials", label: "Материалы" },
];

const TYPE_LABEL: Record<string, string> = {
  question: "Вопрос",
  ticket: "Билет",
  lecture: "Лекция",
  material: "Материал",
};

const TYPE_ICON: Record<string, typeof BookOpen> = {
  question: FileQuestion,
  ticket: GraduationCap,
  lecture: BookOpen,
  material: FileText,
};

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
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [subjects, setSubjects] = useState<Array<{ name: string; slug: string }>>([]);

  const run = useCallback(async (query: string, type?: string, subjectFilter?: string) => {
    const qq = query.trim();
    if (!qq) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    const res = await globalSearch(qq, { limit: 30, type: type || undefined, subject_slug: subjectFilter || undefined });
    setLoading(false);
    if (!res.ok) {
      setError(describeApiError(res.error));
      setItems([]);
      return;
    }
    setItems(res.data.items || []);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = (params.get("q") || "").trim();
    const type = TYPE_ALIASES[(params.get("type") || "").trim().toLowerCase()] || "";
    const subject = (params.get("subject_slug") || "").trim();
    if (!initial || searched) return;
    setQ(initial);
    setTypeFilter(type);
    setSubjectSlug(subject);
    void run(initial, type, subject);
  }, [searched, run]);

  // Список предметов — из каталога, а не из зашитых шести названий.
  useEffect(() => {
    void listSubjectsCatalog().then((result) => {
      if (result.ok) {
        const items = (result.data as { items?: Array<{ name?: string; slug?: string }> })?.items || [];
        setSubjects(
          items
            .map((item) => ({ name: String(item.name || ""), slug: String(item.slug || "") }))
            .filter((item) => item.name && item.slug)
        );
      }
    });
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run(q, typeFilter, subjectSlug);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Search className="h-7 w-7 text-[var(--primary)]" />
          Поиск
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          По всем предметам: вопросы, билеты, лекции и материалы.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Тема, термин, симптом…"
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
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
            <option key={subject.slug} value={subject.slug}>
              {subject.name}
            </option>
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
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {searched && !loading && items.length === 0 && !error && (
        <p className="text-sm text-[var(--muted)]">Ничего не найдено. Попробуйте другие слова.</p>
      )}

      <ul className="space-y-3">
        {items.map((hit) => {
          const Icon = TYPE_ICON[hit.type] || BookOpen;
          return (
            <li
              key={hit.id + hit.score}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition hover:border-[var(--primary)]/40"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="rounded-full bg-[var(--background)] px-2 py-0.5 font-medium">
                      {TYPE_LABEL[hit.type] || hit.type}
                    </span>
                    <span>{hit.subject}</span>
                    {hit.topic && <span>· {hit.topic}</span>}
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
                    <Link
                      href={hit.href}
                      className="text-xs font-semibold text-[var(--primary)] hover:underline"
                    >
                      Открыть раздел →
                    </Link>
                    <Link
                      href={`/tutor`}
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
