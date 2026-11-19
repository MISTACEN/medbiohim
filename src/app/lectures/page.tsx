"use client";

import { BookOpen, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { LectureModuleCard } from "@/components/lectures/LectureModuleCard";
import { useLecturesPage } from "@/components/lectures/useLecturesPage";

export default function LecturesPage() {
  const page = useLecturesPage();
  const { q, setQ, subject, setSubject, loading, error, filtered, modules, subjects } = page;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="page-title">Лекции</h1>
        <p className="page-subtitle">
          Занятия сгруппированы по модулям: список уроков, задачи после каждого блока и прогресс по ним.
          {" "}Архивные конспекты по предметам — во вкладке «Портал» на странице предмета.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по теме…"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
          />
        </div>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm"
        >
          <option value="">Все модули</option>
          {subjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>
      )}

      {loading ? (
        <SkeletonCards count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={q ? "По запросу ничего не найдено" : "Пока нет опубликованных лекций"}
          description={
            q
              ? "Попробуйте другое слово — поиск идёт по названию занятия, теме и модулю."
              : "Админ может сгенерировать и утвердить лекции в CMS — они появятся здесь автоматически."
          }
        />
      ) : (
        <div className="space-y-4">
          {modules.map((mod) => (
            <LectureModuleCard key={mod.title} mod={mod} />
          ))}
        </div>
      )}
    </div>
  );
}
