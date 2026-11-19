"use client";

/** Форма поиска: поле с подсказками, тип, предмет и кнопка. */
import { Loader2, Search } from "lucide-react";
import { TYPE_OPTIONS } from "@/components/search/model";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import type { SearchState } from "@/components/search/useSearchPage";

export function SearchForm({ page }: { page: SearchState }) {
  const {
    q, setQ, loading, typeFilter, setTypeFilter, subjectSlug, setSubjectSlug, subjects,
    suggestions, suggestOpen, setSuggestOpen, suggestLoading, suggestEmpty, activeSuggestion,
    setActiveSuggestion, onSubmit, onKeyDown,
  } = page;

  return (
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

          {suggestOpen && <SearchSuggestions page={page} />}
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
  );
}
