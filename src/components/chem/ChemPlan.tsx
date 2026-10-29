"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, FlaskConical, Loader2, Presentation } from "lucide-react";

type PlanLecture = { n: number; date: string; title: string };
type PlanPractical = { n: number; date: string; title: string; hours?: number };
type PlanLab = {
  n: number;
  date: string;
  title: string;
  topics?: string[];
  labTitle?: string;
  lab?: string[];
  control?: boolean;
};
type PlanWeek = {
  num: number;
  date: string;
  date_label?: string;
  lecture?: { num?: number; title: string; topics?: string[]; note?: string };
  lab?: { title: string; topics?: string[] };
  preparations?: { n: number | string | null; name: string }[];
  electronograms?: string[];
  control?: string | null;
};
type ChemPlanData = {
  subject: string;
  course: number;
  semester: number;
  year: string;
  faculty?: string;
  lectures?: PlanLecture[];
  labs?: PlanLab[];
  practicals?: PlanPractical[];
  weeks?: PlanWeek[];
  total?: string;
  controls?: {
    n: number;
    date: string | null;
    title: string;
    covers: string[];
    prep_href?: string;
    prep_note?: string;
  }[];
};

function formatDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return iso;
  }
}

/** Календарно-тематические планы кафедр со стендов: лекции, практические
 *  и лабораторные занятия с датами, синхронизированными с расписанием. */
export default function ChemPlan({ planFile }: { planFile: string }) {
  const [plan, setPlan] = useState<ChemPlanData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/content/${planFile}`, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setPlan(d))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [planFile]);

  if (error) return null;
  if (!plan) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем план кафедры…
      </div>
    );
  }

  const practicals = plan.practicals ?? [];
  const weeks = plan.weeks ?? [];
  const controls = plan.controls ?? [];

  const renderDate = (d: string | null | undefined) =>
    d ? (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
        <CalendarDays className="size-3.5" /> {formatDate(d)}
      </span>
    ) : null;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-lg font-bold">{plan.subject} · план кафедры</h2>
        <p className="mt-1 text-sm text-slate-500">
          {plan.year}
          {plan.semester ? ` · ${plan.semester} семестр` : ""}
          {plan.course ? ` · ${plan.course} курс` : ""}
          {plan.lectures?.length ? ` · ${plan.lectures.length} лекций` : ""}
          {plan.labs?.length ? ` · ${plan.labs.length} лабораторных занятий` : ""}
          {weeks.length ? ` · ${weeks.length} занятий (${weeks.reduce((n, w) => n + (w.preparations?.length ?? 0), 0)} препаратов)` : ""}
          {practicals.length ? ` · ${practicals.length} практических занятий` : ""}.
          {plan.faculty ? ` ${plan.faculty}.` : ""}
        </p>
        <p className="mt-1 text-xs text-slate-400">Даты синхронизированы с расписанием занятий на сайте.</p>
      </section>

      {controls.length ? (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ClipboardCheck className="size-5 text-[var(--status-warn-fg)]" /> Контрольные и подготовка к ним
          </h2>
          <ol className="mt-3 grid gap-2">
            {controls.map((c) => (
              <li key={c.n} className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">{c.title}</span>
                  {renderDate(c.date)}
                </div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {c.covers.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
                {c.prep_href && (
                  <p className="mt-2 text-sm">
                    <a href={c.prep_href} className="font-bold text-indigo-600 hover:text-indigo-500">
                      Подготовка на сайте →
                    </a>
                    {c.prep_note ? <span className="ml-1 text-slate-500">{c.prep_note}</span> : null}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {weeks.length ? (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <FlaskConical className="size-5 text-[var(--status-ok-fg)]" /> Лекции и лабораторные занятия
          </h2>
          <ol className="mt-3 grid gap-2">
            {weeks.map((w) => (
              <li
                key={w.num}
                className={
                  "rounded-xl border p-3 " +
                  (w.control ? "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/60" : "border-slate-100")
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    Занятие {w.num}
                    {w.control ? ` · ${w.control}` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                    <CalendarDays className="size-3.5" /> {w.date_label || w.date}
                  </span>
                </div>
                {w.lecture && (
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">
                    <span className="font-bold text-indigo-600">Лекция {w.lecture.num}. </span>
                    {w.lecture.title}
                    {w.lecture.note ? <span className="ml-1 text-xs text-slate-400">({w.lecture.note})</span> : null}
                  </p>
                )}
                {w.lab && <p className="mt-1 text-sm text-slate-600"><span className="font-bold">Лабораторное:</span> {w.lab.title}</p>}
                {w.lab?.topics?.length ? (
                  <p className="mt-0.5 text-xs text-slate-400">{w.lab.topics.join(" · ")}</p>
                ) : null}
                {w.preparations?.length ? (
                  <div className="mt-2 rounded-xl bg-slate-50 p-2.5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Гистопрепараты{w.electronograms?.length ? ` · электронограммы: ${w.electronograms.join(", ")}` : ""}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                      {w.preparations.map((p, i) => (
                        <li key={i}>
                          {p.n ? <span className="font-bold text-slate-500">№{p.n}. </span> : null}
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {plan.lectures?.length ? (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Presentation className="size-5 text-indigo-500" /> Лекции
          </h2>
          <ol className="mt-3 grid gap-2">
            {plan.lectures.map((l) => (
              <li key={l.n} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">Лекция {l.n}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                    <CalendarDays className="size-3.5" /> {formatDate(l.date)}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{l.title}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {plan.labs?.length ? (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <FlaskConical className="size-5 text-[var(--status-ok-fg)]" /> Лабораторные занятия
          </h2>
          <ol className="mt-3 grid gap-2">
            {plan.labs.map((l) => (
              <li
                key={l.n}
                className={
                  "rounded-xl border p-3 " +
                  (l.control ? "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/60" : "border-slate-100")
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {l.n}. {l.title}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                    {l.control && <ClipboardCheck className="size-3.5 text-[var(--status-warn-fg)]" />}
                    <CalendarDays className="size-3.5" /> {formatDate(l.date)}
                  </span>
                </div>
                {l.topics?.length ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                    {l.topics.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                {l.lab?.length ? (
                  <div className="mt-2 rounded-xl bg-slate-50 p-2.5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Лабораторная работа{l.labTitle ? `: «${l.labTitle}»` : ""}
                    </div>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
                      {l.lab.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {practicals.length ? (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <FlaskConical className="size-5 text-[var(--status-ok-fg)]" /> Практические занятия
          </h2>
          <ol className="mt-3 grid gap-2">
            {practicals.map((p) => (
              <li key={p.n} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {p.n}. {p.title}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                    <CalendarDays className="size-3.5" /> {formatDate(p.date)}
                    {p.hours ? ` · ${p.hours} ч` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {plan.total ? <p className="mt-3 text-xs text-slate-400">{plan.total}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
