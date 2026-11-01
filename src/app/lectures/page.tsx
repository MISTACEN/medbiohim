"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Search } from "lucide-react";
import { listLectures, type LectureListItem } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useLectureProgress } from "@/hooks/useLectureProgress";
import { lectureSolvedCount, lectureTaskTotal } from "@/lib/lectureProgress";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";

type LectureRow = {
  id: string;
  title: string;
  subject?: string;
  subject_slug?: string;
  topic?: string;
  summary?: string;
  body_markdown?: string | null;
};

export default function LecturesPage() {
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const progress = useLectureProgress();

  // D9: единый слой отмены вместо ручного cancelled-флага.
  const { data, loading, error } = useApiRequest<LectureListItem[]>(async () => {
    const r = await listLectures(subject || undefined);
    if (!r.ok) throw new Error(describeApiError(r.error) || "Не удалось загрузить лекции");
    return r.data.items || [];
  }, [subject]);
  const items = useMemo(() => (data ?? []) as LectureRow[], [data]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter(
      (x) =>
        String(x.title || "").toLowerCase().includes(n) ||
        String(x.topic || "").toLowerCase().includes(n) ||
        String(x.subject || x.subject_slug || "").toLowerCase().includes(n)
    );
  }, [items, q]);

  /** Модуль = предмет: в списке API приходит только subject_slug, поэтому он ведущий. */
  const modules = useMemo(() => {
    const groups = new Map<string, LectureRow[]>();
    for (const item of filtered) {
      const key = String(item.subject || item.subject_slug || "Без модуля");
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([title, lessons]) => {
      const perLesson = lessons.map((lesson) => ({
        lesson,
        total: lectureTaskTotal(lesson.body_markdown),
        solved: lectureSolvedCount(lesson.id, lectureTaskTotal(lesson.body_markdown), progress),
      }));
      return {
        title,
        lessons: perLesson,
        tasks: perLesson.reduce((sum, row) => sum + row.total, 0),
        solved: perLesson.reduce((sum, row) => sum + row.solved, 0),
      };
    });
  }, [filtered, progress]);

  const subjects = useMemo(() => {
    const s = new Set(items.map((x) => x.subject || x.subject_slug).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [items]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="page-title">Лекции</h1>
        <p className="page-subtitle">
          Занятия сгруппированы по модулям: список уроков, задачи после каждого блока и прогресс по ним.
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
          {modules.map((mod) => {
            const percent = mod.tasks > 0 ? Math.round((mod.solved / mod.tasks) * 100) : 0;
            return (
              <section key={mod.title} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">Модуль</div>
                    <h2 className="mt-0.5 break-words text-base font-extrabold leading-snug sm:text-lg">{mod.title}</h2>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {mod.lessons.length} занятий ·{" "}
                      {mod.tasks > 0 ? `Решено задач: ${mod.solved} из ${mod.tasks}` : "только конспекты"}
                    </p>
                  </div>
                  {mod.tasks > 0 && (
                    <div className="w-full sm:w-[180px]">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                        <span>Прогресс</span>
                        <span>{percent}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <ol className="mt-4 space-y-1">
                  {mod.lessons.map(({ lesson, total, solved }, index) => {
                    const done = total > 0 && solved >= total;
                    return (
                      <li key={lesson.id}>
                        <Link
                          href={`/lectures/${encodeURIComponent(lesson.id)}`}
                          className="group flex items-start gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2 transition hover:border-[var(--primary)] hover:bg-slate-50"
                        >
                          <span className="mt-0.5 w-5 shrink-0 text-xs font-bold text-[var(--muted)]">{index + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-semibold leading-snug group-hover:text-[var(--primary)]">{lesson.title}</span>
                            {lesson.summary && (
                              <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--muted)]">{lesson.summary}</span>
                            )}
                            <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-[var(--muted)]">
                              {total > 0 ? (
                                <>
                                  {done ? <CheckCircle2 className="size-3 shrink-0 text-[var(--status-ok-fg)]" /> : null}
                                  Решено задач: {solved} из {total}
                                </>
                              ) : (
                                "Конспект"
                              )}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
