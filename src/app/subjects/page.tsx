"use client";

import { useCatalogPage } from "@/components/subjects/catalog/useCatalogPage";
import { CatalogFilters } from "@/components/subjects/catalog/CatalogFilters";
import { CatalogToolGrid, SubjectCard } from "@/components/subjects/catalog/CatalogCards";

export default function SubjectsPage() {
  const page = useCatalogPage();
  const { q, examWindows, tools, note, filtered, grouped, loading, openTutor } = page;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Начнём с главного</p>
        <h1 className="page-title mt-1">Какой предмет вы сейчас учите?</h1>
        <p className="page-subtitle">Каталог предметов: план, билеты, тесты и тренажёры каждого предмета. Сводка «Учёба» — в разделе /study, а тьютор и калькуляторы — в /tools. Поиск работает по названию.</p>
      </header>

      <CatalogFilters page={page} />

      {note && (
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)] dark:border-[var(--status-warn-border)] dark:bg-[var(--status-warn-fg)]/40 dark:text-[var(--status-warn-fg)]">{note}</div>
      )}

      {tools.length > 0 && <CatalogToolGrid tools={tools} />}

      {loading ? (
        <div className="card p-6 text-sm text-[var(--muted)]">Загрузка предметов…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--muted)]">Ничего не найдено{q ? ` по запросу «${q}»` : ""}.</div>
      ) : (
        grouped.map(({ category, items: list }) => (
          <section key={category} className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => (
                <SubjectCard key={s.id} item={s} examWindows={examWindows} openTutor={openTutor} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
