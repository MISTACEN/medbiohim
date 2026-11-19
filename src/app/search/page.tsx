"use client";

/** Поиск: форма с подсказками, подсказки разделов и результаты. */
import { Suspense } from "react";
import { Search } from "lucide-react";
import { SkeletonList } from "@/components/ui/Skeleton";
import { SearchForm } from "@/components/search/SearchForm";
import { SearchResults } from "@/components/search/SearchResults";
import { useSearchPage } from "@/components/search/useSearchPage";

function SearchPageInner() {
  const page = useSearchPage();
  const { searched, loading, total, intentHint, error, examples, applyExample } = page;

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

      <SearchForm page={page} />

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

      {searched && !loading && <SearchResults page={page} />}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl p-8"><SkeletonList count={3} /></div>}>
      <SearchPageInner />
    </Suspense>
  );
}
