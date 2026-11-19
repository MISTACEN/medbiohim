"use client";

/**
 * Лента «Ближайшее» — общий таймлайн /study и /schedule (buildAgenda).
 *
 * Два блока вместо простыни «всё подряд»:
 *  1. «Дедлайны и аттестации» — ДЗ, отработки и аттестационные события,
 *     к которым есть что готовить: полные карточки с кнопками «План»/«Готовиться».
 *  2. «Занятия по дням» — рядовые пары компактными строками, сгруппированные
 *     по дате: посещение само собой, поэтому без кнопок на каждом занятии.
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

/** Компактная строка рядового занятия — время, предмет, тема. */
function LessonRow({ item }: { item: AgendaItem }) {
  const Icon = KIND_ICON[item.kind] || CalendarDays;
  return (
    <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-[var(--card)]">
      <span className="w-10 shrink-0 tabular-nums text-[var(--muted)]">{item.time || "—"}</span>
      <span className={"grid h-6 w-6 shrink-0 place-items-center rounded-lg " + (KIND_TONE[item.kind] || "bg-slate-100 text-slate-600")} aria-hidden>
        <Icon className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{item.subject || "Предмет"}</span>
        {item.title && item.subject && !item.title.startsWith(item.subject) ? (
          <span className="text-[var(--muted)]"> · {item.title}</span>
        ) : null}
      </span>
    </li>
  );
}

export function AgendaTimeline({ agenda, loading, onPrep, onPlan }: {
  agenda: AgendaItem[];
  loading: boolean;
  onPrep: (item: AgendaItem) => void;
  /** Фаза 1: сохранённый план подготовки к событию. */
  onPlan?: (item: AgendaItem) => void;
}) {
  const open = agenda.filter((item) => item.done !== true);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Важное: всё, к чему есть подготовка или что нужно сдать. Рядовые занятия
  // («lesson») уходят в компактную группировку по дням — на каждом занятии
  // раньше висели одинаковые кнопки «План/Готовиться», которые никому не нужны.
  const important = open.filter((item) => item.kind !== "lesson" || isPrepTarget(item));
  const lessons = open.filter((item) => item.kind === "lesson" && !isPrepTarget(item));

  // Занятия по дням (ближайшие ~2 недели) — в порядке даты и времени.
  const lessonsByDay = new Map<string, AgendaItem[]>();
  for (const item of lessons.slice(0, 40)) {
    const key = item.date || "без даты";
    const bucket = lessonsByDay.get(key) || [];
    bucket.push(item);
    lessonsByDay.set(key, bucket);
  }
  const lessonDays = [...lessonsByDay.entries()].slice(0, 14);

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
          <p className="mt-0.5 text-xs text-[var(--muted)]">что сдать и к чему готовиться; занятия — списком по дням</p>
        </div>
        {open.length ? (
          <span className="text-xs font-semibold text-[var(--muted)]">
            {important.length} важных{lessons.length ? ` · ${lessons.length} занятий` : ""}
          </span>
        ) : null}
      </div>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--status-ok-fg)]">Открытых дел нет: аттестаций не назначено, ДЗ сданы.</p>
      ) : (
        <>
          {important.length ? (
            <>
              <p className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">
                Дедлайны и аттестации
                <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums">{important.length}</span>
              </p>
              <ol className="mt-2 space-y-2">
                {important
                  .slice()
                  .sort((a, b) => {
                    // Сначала срочные и близкие по дате: аттестации и просроченное
                    // не должны тонуть под парами на следующей неделе.
                    const rank = (x: AgendaItem) => (x.urgent ? 0 : x.date === todayIso ? 1 : 2);
                    const r = rank(a) - rank(b);
                    if (r !== 0) return r;
                    return String(a.date || "").localeCompare(String(b.date || ""));
                  })
                  .slice(0, 12)
                  .map(renderItem)}
              </ol>
            </>
          ) : null}
          {lessonDays.length ? (
            <>
              <p className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                Занятия по дням
              </p>
              <div className="mt-2 space-y-2">
                {lessonDays.map(([day, dayItems]) => (
                  <div key={day} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                      {day === todayIso ? "Сегодня" : fmtDate(day)}
                    </p>
                    <ol className="mt-1 divide-y divide-[var(--border)]/60">
                      {dayItems
                        .slice()
                        .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
                        .map((item) => <LessonRow key={item.id} item={item} />)}
                    </ol>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-right">
                <Link href="/schedule" className="text-xs font-semibold text-[var(--primary)] hover:underline">
                  Полное расписание →
                </Link>
              </p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
