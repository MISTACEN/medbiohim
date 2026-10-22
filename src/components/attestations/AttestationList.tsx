"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, ClipboardList, FileQuestion, ListChecks, Sparkles } from "lucide-react";
import { listAttestations } from "@/lib/api";
import type { AttestationSummary, AttestationType } from "@/types/attestations";
import { ATTESTATION_TYPE_LABELS } from "@/types/attestations";

const ACCENT: Record<AttestationType, string> = {
  colloquium: "from-indigo-500 to-violet-500",
  exam: "from-rose-500 to-orange-500",
  credit: "from-emerald-500 to-teal-500",
  test: "from-sky-500 to-cyan-500",
  control: "from-amber-500 to-yellow-500",
};

function formatWindow(from: string | null, to: string | null) {
  const format = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };
  const start = from ? format(from) : null;
  const end = to ? format(to) : null;
  if (start && end) return `${start} — ${end}`;
  if (start) return `с ${start}`;
  if (end) return `до ${end}`;
  return null;
}

export default function AttestationList({
  subjectSlug,
  subjectName,
  emptyHint,
}: {
  subjectSlug?: string;
  subjectName?: string;
  emptyHint?: string;
}) {
  const [items, setItems] = useState<AttestationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listAttestations(subjectSlug).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.ok) setItems((result.data.items || []) as AttestationSummary[]);
      else setError(result.error.code === "ROUTE_NOT_IMPLEMENTED" ? "Раздел аттестаций ещё не подключён." : result.error.message);
    });
    return () => {
      alive = false;
    };
  }, [subjectSlug]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="h-48 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>;
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/60 p-10 text-center">
        <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 font-serif text-lg font-semibold text-[var(--text)]">Пока ничего не опубликовано</p>
        <p className="mt-1 text-sm text-slate-500">
          {emptyHint || "Преподаватель ещё не открыл аттестации по этому предмету."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => {
        const window = formatWindow(item.available_from, item.available_to);
        const accent = ACCENT[item.type] || ACCENT.colloquium;
        return (
          <Link
            key={`${item.subject_slug}-${item.slug}`}
            href={`/subjects/${item.subject_slug}/attestations/${item.slug}`}
            className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_24px_48px_-32px_rgba(15,23,42,0.4)]"
          >
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {ATTESTATION_TYPE_LABELS[item.type]}
                </span>
                <h3 className="mt-1.5 font-serif text-lg font-semibold leading-6 text-[var(--text)]">{item.title}</h3>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-indigo-500" />
            </div>

            {!subjectSlug && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {item.subject_name || item.subject_slug}
              </p>
            )}
            {item.description && <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-slate-500">{item.description}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-[var(--border)] pt-3 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {item.stages_count} этап(ов)</span>
              <span className="inline-flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" /> {item.tests_count} тестов</span>
              <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /> {item.tasks_count} задач</span>
              {item.course_number != null && <span className="ml-auto text-slate-400">{item.course_number} курс</span>}
            </div>
            {window && (
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" /> {window}
              </div>
            )}
          </Link>
        );
      })}
      {subjectName && (
        <div className="hidden items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-slate-400 sm:flex">
          <Sparkles className="mr-2 h-4 w-4" /> {subjectName}: материалы обновляет преподаватель
        </div>
      )}
    </div>
  );
}
