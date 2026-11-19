"use client";

/** Подсказки под полем поиска: клавиатура и клик ведут на карточку. */
import { BookOpen, Sparkles } from "lucide-react";
import { TYPE_ICON } from "@/components/search/model";
import type { SearchState } from "@/components/search/useSearchPage";

export function SearchSuggestions({ page }: { page: SearchState }) {
  const {
    suggestions, suggestEmpty, suggestHint, activeSuggestion, examples,
    setActiveSuggestion, setSuggestOpen, applyExample, router,
  } = page;
  if (!(suggestions.length > 0 || suggestEmpty)) return null;

  return (
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
  );
}
