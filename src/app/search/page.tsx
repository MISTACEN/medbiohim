"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { globalSearch, type SearchHit } from "@/lib/features-api";
import { Search, Loader2, BookOpen, FileQuestion, GraduationCap, Layers } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  question: "Вопрос",
  ticket: "Билет",
  trainer: "Тренажёр",
  plan: "План",
  subject: "Предмет",
};

const TYPE_ICON: Record<string, typeof BookOpen> = {
  question: FileQuestion,
  ticket: GraduationCap,
  trainer: Layers,
  subject: BookOpen,
  plan: BookOpen,
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");

  const run = useCallback(async (query: string, type?: string) => {
    const qq = query.trim();
    if (!qq) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    const res = await globalSearch(qq, { limit: 30, type: type || undefined });
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      setItems([]);
      return;
    }
    setItems(res.data.items || []);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run(q, typeFilter);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Search className="h-7 w-7 text-[var(--primary)]" />
          Поиск
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          По всем предметам: вопросы, билеты, тренажёры и каталог.
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
          <option value="">Все типы</option>
          <option value="question">Вопросы</option>
          <option value="ticket">Билеты</option>
          <option value="trainer">Тренажёры</option>
          <option value="subject">Предметы</option>
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
