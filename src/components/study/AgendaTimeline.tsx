"use client";

/**
 * Лента «Ближайшее» — общий таймлайн /study и /schedule (buildAgenda):
 * аттестации, ДЗ, отработки одним списком с чипами типов. Для аттестационных
 * событий — кнопка «Готовиться» (ИИ-чеклист).
 */
import Link from "next/link";
import { CalendarDays, Sparkles } from "lucide-react";
import { fmtDate } from "@/lib/study/agenda-fmt";
import { isPrepTarget, type AgendaItem } from "@/lib/study/agenda";

const KIND_TONE: Record<string, string> = {
  exam: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
  credit: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  colloquium: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  control_work: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  homework: "bg-indigo-50 text-indigo-700",
  assignment: "bg-violet-50 text-violet-700",
  lesson: "bg-slate-100 text-slate-600",
};

export function AgendaTimeline({ agenda, loading, onPrep }: {
  agenda: AgendaItem[];
  loading: boolean;
  onPrep: (item: AgendaItem) => void;
}) {
  const open = agenda.filter((item) => item.done !== true);
  const todayIso = new Date().toISOString().slice(0, 10);
  const today = open.filter((item) => item.date === todayIso);
  const upcoming = open.filter((item) => item.date !== todayIso);

  if (loading && !agenda.length) {
    return (
      <section className="card p-4">
        <p className="text-sm text-[var(--muted)]">Собираем ленту: расписание, ДЗ, отработки…</p>
      </section>
    );
  }

  function renderItem(item: AgendaItem) {
    const prep = isPrepTarget(item);
    return (
      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " + (KIND_TONE[item.kind] || "bg-slate-100 text-slate-600")}>
              {item.label}
            </span>
            <span className={"truncate text-sm font-semibold " + (item.urgent ? "text-[var(--status-critical-fg)]" : "")}>
              {item.title}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {fmtDate(item.date)}{item.time ? " · " + item.time : ""}</span>
            {item.meta ? <span>{item.meta}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {prep ? (
            <button
              type="button"
              onClick={() => onPrep(item)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 px-3 py-1.5 font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
            >
              <Sparkles className="h-3.5 w-3.5" /> Готовиться
            </button>
          ) : null}
          {item.href ? (
            <Link href={item.href} className="font-semibold text-[var(--muted)] transition hover:text-[var(--primary)]">
              Открыть →
            </Link>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Ближайшее</h2>
        <span className="text-xs text-[var(--muted)]">расписание + ДЗ + отработки — одним списком</span>
      </div>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--status-ok-fg)]">Открытых дел нет: аттестаций не назначено, ДЗ сданы.</p>
      ) : (
        <>
          {today.length ? (
            <>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[var(--primary)]">Сегодня</p>
              <ol className="mt-1.5 space-y-2">{today.map(renderItem)}</ol>
            </>
          ) : null}
          {upcoming.length ? (
            <>
              {today.length ? <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Дальше</p> : null}
              <ol className="mt-1.5 space-y-2">{upcoming.slice(0, 14).map(renderItem)}</ol>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
