"use client";

/**
 * Настоящий раздел «Задания». Раньше /homework делал redirect на /schedule —
 * таб «ДЗ» в мобильной навигации вёл в расписание, хотя у API есть
 * полноценный роутер заданий. Здесь список ДЗ группы, сдача ответа,
 * отметка о выполнении и оценка с комментарием преподавателя.
 *
 * Состояние — в useHomeworkData, карточка задания — в HomeworkCard.
 */
import Link from "next/link";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { hasToken } from "@/lib/api";
import { useHomeworkData } from "@/components/homework/useHomeworkData";
import { HomeworkCard } from "@/components/homework/HomeworkCard";
import { FILTERS } from "@/components/homework/model";

export default function HomeworkPage() {
  const hw = useHomeworkData();

  if (hw.authLoading) return <SkeletonCards count={3} />;

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10" style={{ color: "var(--muted)" }} />
        <h1 className="mt-3 text-xl font-bold">Задания</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Войдите, чтобы видеть домашние задания вашей группы.</p>
        <Link href="/login" className="btn-primary mt-4 inline-block">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Задания</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Домашние задания группы: сроки, сдача ответов и оценки преподавателя.
          </p>
        </div>
        <Link href="/schedule" className="text-sm font-semibold text-indigo-600 hover:underline">
          Открыть в расписании →
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Фильтры заданий">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => hw.setFilter(id)}
            aria-pressed={hw.filter === id}
            className={
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
              (hw.filter === id
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] hover:border-indigo-300")
            }
          >
            {label}
            <span className={"ml-1.5 text-xs " + (hw.filter === id ? "text-white/80" : "text-[var(--muted)]")}>
              {hw.counts[id]}
            </span>
          </button>
        ))}
      </nav>

      {hw.error && (
        <ErrorState message={hw.error.message} requestId={hw.error.requestId} retry={() => void hw.load()} />
      )}

      {hw.loading ? (
        <SkeletonCards count={4} />
      ) : hw.filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={hw.filter === "active" ? "Активных заданий нет" : hw.filter === "overdue" ? "Просроченных заданий нет" : "Заданий пока нет"}
          description="Новые задания появятся здесь, когда преподаватель или староста их опубликуют."
          action="Перейти к расписанию"
          actionHref="/schedule"
        />
      ) : (
        <ul className="space-y-2">
          {hw.filtered.map((item) => (
            <HomeworkCard key={item.id} hw={hw} item={item} />
          ))}
        </ul>
      )}

      {hw.actionError && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]" role="alert">
          {hw.actionError}
        </div>
      )}
    </div>
  );
}
