"use client";

/** Результаты поиска: конспекты портала, пустое состояние и карточки. */
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { OPEN_LABEL, TYPE_ICON, TYPE_LABEL } from "@/components/search/model";
import type { SearchState } from "@/components/search/useSearchPage";

export function SearchResults({ page }: { page: SearchState }) {
  const { items, lectureHits } = page;

  return (
    <>
      {lectureHits.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-400">
            Конспекты портала
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {lectureHits.map((hit) => (
              <li key={hit.id}>
                <Link
                  href={hit.href}
                  className="flex h-full items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]"
                >
                  <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{hit.title}</span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {hit.subject} · конспект портала
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 && !page.error && (
        <div className="space-y-3">
          <EmptyState
            icon={Search}
            title="Ничего не найдено"
            description="Уточните запрос: ищите по названию препарата, учебника или предмета. Например: «препарат почка», «учебник по гистологии», «билет физиология»."
          />
          <div className="flex flex-wrap gap-2">
            {page.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => page.applyExample(example)}
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
    </>
  );
}
