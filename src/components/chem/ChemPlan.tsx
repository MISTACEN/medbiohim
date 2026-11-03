"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, FlaskConical, Loader2 } from "lucide-react";
import {
  NextSessionCard,
  PastSessionsList,
  UpcomingSessionCard,
  type PlanTimelineLinks,
} from "@/components/subjects/PlanTimeline";
import {
  formatPlanDateShort,
  normalizeStaticPlan,
  splitPlanSessions,
  type NormalizedSubjectPlan,
} from "@/lib/subject-plan-next";
import { fetchStaticPlan } from "@/lib/subject-plan-static";

/**
 * Календарно-тематические планы кафедр со стендов (файлы в public/content):
 * лекции, практические и лабораторные занятия с датами, синхронизированными
 * с расписанием. Сверху — крупное ближайшее занятие, прошедшие свёрнуты.
 * Связки: тема → материалы, препараты → тренажёр/практика, ДЗ → /homework,
 * тесты → вкладка тестов, контрольные → аттестации предмета.
 */
export default function ChemPlan({ planFile, subjectSlug }: { planFile: string; subjectSlug?: string }) {
  const [plan, setPlan] = useState<NormalizedSubjectPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStaticPlan(planFile)
      .then((raw) => alive && setPlan(normalizeStaticPlan(raw)))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [planFile]);

  if (error) {
    return (
      <div className="card p-5 text-sm" style={{ color: "var(--muted)" }}>
        Не удалось загрузить план кафедры: {error}
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm" style={{ color: "var(--muted)" }}>
        <Loader2 className="size-4 animate-spin" /> Загружаем план кафедры…
      </div>
    );
  }

  // Связки ведут на вкладки предмета через slug из плана (планы кафедры уже
  // ссылаются на /subjects/<slug>?tab=…,-route поддерживает slug).
  const slug = subjectSlug || plan.slug || "";
  const links: PlanTimelineLinks = slug ? { subjectHref: `/subjects/${encodeURIComponent(slug)}` } : {};
  const split = splitPlanSessions(plan.sessions);
  const prepCount = plan.sessions.reduce((n, w) => n + (w.preparations?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-lg font-bold">{plan.subject} · план кафедры</h2>
        <p className="mt-1 text-sm text-slate-500">
          {plan.year}
          {plan.semester ? ` · ${plan.semester} семестр` : ""}
          {plan.course ? ` · ${plan.course} курс` : ""}
          {plan.sessions.length ? ` · ${plan.sessions.length} занятий` : ""}
          {prepCount ? ` (${prepCount} препаратов)` : ""}
          {plan.controls.length ? ` · ${plan.controls.length} контрольных точек` : ""}
          {plan.faculty ? `. ${plan.faculty}` : ""}
        </p>
        <p className="mt-1 text-xs text-slate-400">Даты синхронизированы с расписанием занятий на сайте.</p>
        {plan.note && <p className="mt-1 text-xs text-slate-400">{plan.note}</p>}
      </section>

      {/* Крупное ближайшее занятие + предстоящие + свёрнутые прошедшие. */}
      {split.next.length > 0 && split.nextDate ? (
        <NextSessionCard sessions={split.next} date={split.nextDate} links={links} />
      ) : (
        <div className="card p-4 text-sm" style={{ color: "var(--muted)" }}>
          Будущих занятий по плану нет — семестр завершён или даты ещё не выставлены.
        </div>
      )}

      {plan.controls.length ? (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ClipboardCheck className="size-5 text-[var(--status-warn-fg)]" /> Контрольные и подготовка к ним
          </h2>
          <ol className="mt-3 grid gap-2">
            {plan.controls.map((c) => (
              <li
                key={c.n}
                className={
                  "rounded-xl border p-3 " +
                  (c.date && split.nextDate && c.date >= split.nextDate
                    ? "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/50"
                    : "border-slate-100")
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.title}</span>
                  {c.date ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                      <CalendarDays className="size-3.5" /> {formatPlanDateShort(c.date)}
                    </span>
                  ) : null}
                </div>
                {c.covers.length ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                    {c.covers.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-sm">
                  {/* «Подготовка на сайте» — ссылка из плана кафедры; если её нет,
                      ведём на аттестации предмета, чтобы ссылка не была пустой. */}
                  <Link
                    href={c.prepHref || (slug ? `/subjects/${encodeURIComponent(slug)}?tab=exam` : "/subjects")}
                    className="font-bold text-indigo-600 hover:text-indigo-500"
                  >
                    Подготовка на сайте →
                  </Link>
                  {c.prepNote ? <span className="ml-1 text-slate-500">{c.prepNote}</span> : null}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {split.upcoming.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-400">
            <FlaskConical className="size-4" /> Предстоящие занятия
          </h3>
          <div className="grid gap-3">
            {split.upcoming.map((session) => (
              <UpcomingSessionCard key={session.key} session={session} links={links} />
            ))}
          </div>
        </section>
      )}

      <PastSessionsList sessions={split.past} links={links} />
      {split.undated.length > 0 && <PastSessionsList sessions={split.undated} links={links} label="Темы без даты в плане" />}
    </div>
  );
}
