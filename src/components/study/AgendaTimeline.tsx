"use client";

/**
 * Лента «Ближайшее» — общий таймлайн /study и /schedule (buildAgenda):
 * аттестации, ДЗ, отработки одним списком с чипами типов. Для аттестационных
 * событий — кнопка «Готовиться» (ИИ-чеклист).
 */
import Link from "next/link";
import {
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  ListChecks,
  MessagesSquare,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { fmtDate } from "@/lib/study/agenda-fmt";
import { isPrepTarget, type AgendaItem } from "@/lib/study/agenda";
import { limitAgendaItems } from "@/lib/study/agenda-window.mjs";

const KIND_ICON: Record<string, typeof CalendarDays> = {
  exam: GraduationCap,
  credit: ShieldCheck,
  colloquium: MessagesSquare,
  control_work: ClipboardCheck,
  homework: BookOpenCheck,
  assignment: RotateCcw,
  lesson: CalendarDays,
};

const KIND_TONE: Record<string, string> = {
  exam: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
  credit: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  colloquium: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  control_work: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  homework: "bg-indigo-50 text-indigo-700",
  assignment: "bg-violet-50 text-violet-700",
  lesson: "bg-slate-100 text-slate-600",
};

export function AgendaTimeline({ agenda, loading, onPrep, onPlan }: {
  agenda: AgendaItem[];
  loading: boolean;
  onPrep: (item: AgendaItem) => void;
  /** Фаза 1: сохранённый план подготовки к событию. */
  onPlan?: (item: AgendaItem) => void;
}) {
  const open = agenda.filter((item) => item.done !== true);
  const todayIso = new Date().toISOString().slice(0, 10);
  const today = open.filter((item) => item.date === todayIso);
  const upcoming = open.filter((item) => item.date !== todayIso);
  // Аттестации в окне ленты не прячутся за парами: коллоквиум через две недели
  // обязан попасть в «Ближайшее».
  const visibleUpcoming = limitAgendaItems(upcoming);

  if (loading && !agenda.length) {
    return (
      <section className="card p-4">
        <p className="text-sm text-[var(--muted)]">Собираем ленту: расписание, ДЗ, отработки…</p>
      </section>
    );
  }

  function renderItem(item: AgendaItem) {
    const prep = isPrepTarget(item);
    const tone = KIND_TONE[item.kind] || "bg-slate-100 text-slate-600";
    const Icon = KIND_ICON[item.kind] || CalendarDays;
    return (
      <li
        key={item.id}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition hover:border-[var(--primary)]/40 hover:shadow-sm"
      >
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className={"mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg " + tone} aria-hidden>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " + tone}>
                {item.label}
              </span>
              <span className={"text-sm font-semibold leading-snug " + (item.urgent ? "text-[var(--status-critical-fg)]" : "")}>
                {item.title}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--primary-soft)] px-1.5 py-0.5 font-semibold text-[var(--primary)]">
                <CalendarDays className="h-3 w-3" /> {fmtDate(item.date)}{item.time ? " · " + item.time : ""}
              </span>
              {item.masteryPct != null ? (
                <span className="font-semibold text-[var(--primary)]">
                  готовность {item.masteryPct}%{item.daysLeft != null ? ` · через ${item.daysLeft} дн.` : ""}
                </span>
              ) : null}
              {item.meta ? <span>{item.meta}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          {prep && onPlan ? (
            <button
              type="button"
              onClick={() => onPlan(item)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 py-1.5 font-semibold text-[var(--primary)] transition hover:brightness-95"
            >
              <ListChecks className="h-3.5 w-3.5" /> План
            </button>
          ) : null}
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
            <Link
              href={item.href}
              className="rounded-full border border-transparent px-2.5 py-1.5 font-semibold text-[var(--muted)] transition hover:border-[var(--border)] hover:text-[var(--primary)]"
            >
              Открыть →
            </Link>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-bold tracking-tight">Ближайшее</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">расписание + ДЗ + отработки — одним списком</p>
        </div>
        {open.length ? <span className="text-xs font-semibold text-[var(--muted)]">{open.length} открытых</span> : null}
      </div>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--status-ok-fg)]">Открытых дел нет: аттестаций не назначено, ДЗ сданы.</p>
      ) : (
        <>
          {today.length ? (
            <>
              <p className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">
                Сегодня <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums">{today.length}</span>
              </p>
              <ol className="mt-2 space-y-2">{today.map(renderItem)}</ol>
            </>
          ) : null}
          {upcoming.length ? (
            <>
              <p className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                Дальше <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {visibleUpcoming.length === upcoming.length ? upcoming.length : `${visibleUpcoming.length} из ${upcoming.length}`}
                </span>
              </p>
              <ol className="mt-2 space-y-2">{visibleUpcoming.map(renderItem)}</ol>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
