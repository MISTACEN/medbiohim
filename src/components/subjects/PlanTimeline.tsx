"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Atom,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileQuestion,
  FlaskConical,
  ListChecks,
  Microscope,
  Presentation,
} from "lucide-react";
import {
  daysUntil,
  daysUntilLabel,
  formatPlanDateLong,
  formatPlanDateShort,
  sessionKindLabel,
  sessionKindShort,
  splitPlanSessions,
  type PlanSession,
} from "@/lib/subject-plan-next";

/**
 * Связки вкладок предмета из занятия плана: тема → материалы, препараты →
 * практика/тренажёр, тесты → вкладка тестов, контроль → аттестации, ДЗ → /homework.
 * На странице предмета ссылки переключают вкладку без перезагрузки (onOpenTab),
 * в планах кафедр (ChemPlan, /academic) — обычные <Link>.
 */
export type PlanTimelineLinks = {
  /** База ссылки на страницу предмета, например "/subjects/histology". */
  subjectHref?: string;
  /** Переключить вкладку предмета без перезагрузки (внутри страницы предмета). */
  onOpenTab?: (tab: string) => void;
  /** Открыть лекцию внутри страницы предмета (лекция уже загружена). */
  onOpenLecture?: (lectureId: string) => void;
};

type TabChip = {
  label: string;
  tab?: string;
  href?: string;
  Icon: typeof BookOpen;
  tone: string;
};

const TONES = {
  indigo: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  emerald: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)] hover:opacity-80",
  violet: "bg-violet-50 text-violet-700 hover:bg-violet-100",
  amber: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] hover:opacity-80",
  sky: "bg-sky-50 text-sky-700 hover:bg-sky-100",
};

/** Кнопка-связка: внутри предмета переключает вкладку, снаружи ведёт ссылкой. */
function TabLink({ chip, links }: { chip: TabChip; links: PlanTimelineLinks }) {
  const className =
    "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition " + chip.tone;
  const href = chip.href || (links.subjectHref && chip.tab ? `${links.subjectHref}?tab=${chip.tab}` : null);
  if (chip.tab && links.onOpenTab) {
    return (
      <button type="button" className={className} onClick={() => links.onOpenTab!(chip.tab!)}>
        <chip.Icon className="h-3.5 w-3.5" /> {chip.label}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={className}>
        <chip.Icon className="h-3.5 w-3.5" /> {chip.label}
        {!chip.tab && <ExternalLink className="h-3 w-3" />}
      </Link>
    );
  }
  return null;
}

function HomeworkBlock({ session, links }: { session: PlanSession; links: PlanTimelineLinks }) {
  const homework = session.homework;
  if (!homework) return null;
  const hasBody = Boolean(homework.items?.length || homework.text);
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3" style={{ borderColor: "var(--border)" }}>
      <details>
        <summary className="cursor-pointer select-none text-xs font-bold uppercase tracking-wide text-indigo-700">
          Домашнее задание{homework.summary ? `: ${homework.summary}` : ""}
          {hasBody && <span className="ml-1 font-normal normal-case tracking-normal text-indigo-500">— развернуть</span>}
        </summary>
        {homework.items?.length ? (
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {homework.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        ) : homework.text ? (
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {homework.text}
          </p>
        ) : null}
      </details>
      {/* Все ДЗ предмета — на отдельной странице домашних заданий. */}
      <TabLink chip={{ label: "Все домашние задания", Icon: ListChecks, tone: TONES.indigo, href: "/homework" }} links={links} />
    </div>
  );
}

function PreparationsBlock({ session, links }: { session: PlanSession; links: PlanTimelineLinks }) {
  const preparations = session.preparations || [];
  const electro = session.electronograms || [];
  if (!preparations.length && !electro.length && !session.hasElectronograms) return null;
  return (
    <div className="rounded-xl bg-slate-50 p-3" style={{ background: "var(--muted-soft, rgba(100,116,139,0.08))" }}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        <Microscope className="h-3.5 w-3.5" /> Гистопрепараты
        {electro.length > 0 || session.hasElectronograms ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-violet-700">
            <Atom className="h-3 w-3" /> электронограммы{electro.length ? `: ${electro.join(", ")}` : ""}
          </span>
        ) : null}
      </div>
      {preparations.length > 0 && (
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm" style={{ color: "var(--text)" }}>
          {preparations.map((prep, i) => (
            <li key={`${prep.n ?? ""}-${i}`}>
              {prep.n != null ? <span className="font-bold" style={{ color: "var(--muted)" }}>№{prep.n}. </span> : null}
              {prep.name}
            </li>
          ))}
        </ol>
      )}
      {/* Препараты отрабатываются в тренажёре/практике предмета. */}
      <TabLink chip={{ label: "Тренажёр препаратов", tab: "trainer", Icon: Microscope, tone: TONES.violet }} links={links} />
      <TabLink chip={{ label: "Практика", tab: "practice", Icon: FlaskConical, tone: TONES.emerald }} links={links} />
    </div>
  );
}

function SessionBody({ session, links }: { session: PlanSession; links: PlanTimelineLinks }) {
  return (
    <div className="space-y-2">
      {session.lecture && (
        <div className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          <span className="font-bold text-indigo-600">
            <Presentation className="mr-1 inline h-4 w-4 align-[-2px]" />
            {session.lecture.num ? `Лекция ${session.lecture.num}. ` : "Лекция. "}
          </span>
          {session.lecture.title}
          {session.lecture.note ? <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>({session.lecture.note})</span> : null}
          {session.lecture.topics?.length ? (
            <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{session.lecture.topics.join(" · ")}</div>
          ) : null}
          {session.lecture.lectureId && links.onOpenLecture && (
            // Внутри предмета лекция открывается во вкладке «Лекции» без ухода со страницы.
            <button
              type="button"
              onClick={() => links.onOpenLecture!(session.lecture!.lectureId!)}
              className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <BookOpen className="h-3.5 w-3.5" /> Открыть лекцию
            </button>
          )}
          {session.lecture.lectureId && !links.onOpenLecture && (
            <TabLink
              chip={{ label: "Открыть лекцию", Icon: BookOpen, tone: TONES.indigo, href: `/lectures/${encodeURIComponent(session.lecture.lectureId)}` }}
              links={links}
            />
          )}
          <TabLink chip={{ label: "Материалы предмета", tab: "materials", Icon: BookOpen, tone: TONES.indigo }} links={links} />
        </div>
      )}

      {session.lab && (
        <div className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          <span className="font-bold" style={{ color: "var(--status-ok-fg)" }}>
            <FlaskConical className="mr-1 inline h-4 w-4 align-[-2px]" />Лабораторное:
          </span>{" "}
          {session.lab.title}
          {session.lab.topics?.length ? (
            <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{session.lab.topics.join(" · ")}</div>
          ) : null}
        </div>
      )}

      {session.practice && !session.lab && (
        <div className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          <span className="font-bold" style={{ color: "var(--status-ok-fg)" }}>
            <FlaskConical className="mr-1 inline h-4 w-4 align-[-2px]" />Практика:
          </span>{" "}
          {session.practice}
        </div>
      )}

      {session.title && !session.lecture && !session.lab && !session.practice && (
        <div className="text-sm font-semibold leading-relaxed" style={{ color: "var(--text)" }}>
          {session.num ? `${session.num}. ` : ""}
          {session.title}
        </div>
      )}

      {session.description && (
        <p className="whitespace-pre-line text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {session.description}
        </p>
      )}

      {session.control && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-warn-bg)] px-3 py-1 text-xs font-bold text-[var(--status-warn-fg)]">
          <ClipboardList className="h-3.5 w-3.5" /> {session.control}
        </div>
      )}

      <PreparationsBlock session={session} links={links} />
      <HomeworkBlock session={session} links={links} />

      {/* Привязанные тесты и вопросы к экзамену — счётчики из topic_progress. */}
      {(Number(session.testsCount) > 0 || Number(session.examQuestionsCount) > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {Number(session.testsCount) > 0 && (
            <TabLink
              chip={{ label: `Тесты по теме: ${session.testsCount}`, tab: "tests", Icon: FileQuestion, tone: TONES.indigo }}
              links={links}
            />
          )}
          {Number(session.examQuestionsCount) > 0 && (
            <TabLink
              chip={{ label: `Вопросы к экзамену: ${session.examQuestionsCount}`, tab: "exam", Icon: ListChecks, tone: TONES.violet }}
              links={links}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Крупная карточка «ближайшее занятие» — верх вкладки «План». */
export function NextSessionCard({
  sessions,
  date,
  links,
  subjectName,
}: {
  sessions: PlanSession[];
  date: string;
  links: PlanTimelineLinks;
  subjectName?: string;
}) {
  const days = daysUntil(date);
  const badge = daysUntilLabel(days);
  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-md"
      style={{ borderColor: "var(--primary, #4f46e5)" }}
      aria-label="Ближайшее занятие"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 px-5 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
          <CalendarDays className="h-4 w-4" /> Ближайшее занятие{subjectName ? ` · ${subjectName}` : ""}
        </div>
        <span className={"rounded-full px-3 py-1 text-xs font-bold " + (days <= 1 ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-700")}>
          {badge || (days < 0 ? "просрочено" : formatPlanDateShort(date))}
        </span>
      </header>
      <div className="space-y-4 px-5 py-4">
        <div>
          <div className="text-lg font-extrabold" style={{ color: "var(--text)" }}>
            {formatPlanDateLong(date)}
          </div>
          <div className="mt-0.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
            {sessions.map((s) => sessionKindLabel(s)).join(" · ")}
          </div>
        </div>
        {sessions.map((session) => (
          <SessionBody key={session.key} session={session} links={links} />
        ))}
      </div>
    </section>
  );
}

/** Обычная карточка будущего занятия. */
export function UpcomingSessionCard({ session, links }: { session: PlanSession; links: PlanTimelineLinks }) {
  return (
    <article className="rounded-xl border bg-[var(--card)] p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
          {sessionKindShort(session)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--muted)" }}>
          <CalendarDays className="h-3.5 w-3.5" /> {formatPlanDateShort(session.date as string)}
        </span>
      </div>
      <div className="mt-2">
        <SessionBody session={session} links={links} />
      </div>
    </article>
  );
}

/** Компактная строка прошедшего занятия — для свёрнутого списка. */
function PastSessionRow({
  session,
  links,
  bordered,
}: {
  session: PlanSession;
  links: PlanTimelineLinks;
  /** Разделительная линия между строками (в цвет границы темы). */
  bordered?: boolean;
}) {
  const topic =
    session.lecture?.title ||
    session.lab?.title ||
    session.title ||
    session.practice ||
    session.control ||
    "Занятие";
  return (
    <li
      className={"flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-sm " + (bordered ? "border-b" : "")}
      style={{ color: "var(--text)", borderColor: "var(--border)" }}
    >
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold" style={{ color: "var(--muted)" }}>
        <CalendarDays className="h-3 w-3" /> {session.date ? formatPlanDateShort(session.date) : "—"}
      </span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {sessionKindShort(session)}
      </span>
      <span className="min-w-0 flex-1 truncate" title={topic}>{topic}</span>
      {session.control && (
        <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-warn-fg)]">
          {session.control}
        </span>
      )}
      {session.lecture?.lectureId && (links.subjectHref || links.onOpenLecture) && (
        <Link
          href={links.onOpenLecture ? "#" : `/lectures/${encodeURIComponent(session.lecture.lectureId)}`}
          onClick={
            links.onOpenLecture
              ? (e) => {
                  e.preventDefault();
                  links.onOpenLecture!(session.lecture!.lectureId!);
                }
              : undefined
          }
          className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline"
        >
          лекция →
        </Link>
      )}
    </li>
  );
}

/** Свёрнутый блок «прошедшие занятия» — компактно, без километров списка. */
export function PastSessionsList({
  sessions,
  links,
  label = "Прошедшие занятия",
}: {
  sessions: PlanSession[];
  links: PlanTimelineLinks;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!sessions.length) return null;
  return (
    <section className="rounded-2xl border bg-[var(--card)]" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text)" }}>
          <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
          {label}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
            {sessions.length}
          </span>
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{open ? "свернуть" : "показать"}</span>
      </button>
      {open && (
        <ul className="px-5 pb-3">
          {sessions.map((session, index) => (
            <PastSessionRow
              key={session.key}
              session={session}
              links={links}
              bordered={index < sessions.length - 1}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Полная лента плана: крупное ближайшее занятие сверху, затем предстоящие,
 * прошедшие — свёрнутыми. Общий код для страницы предмета и планов кафедр.
 */
export function PlanTimeline({
  sessions,
  links,
  subjectName,
  emptyLabel,
}: {
  sessions: PlanSession[];
  links: PlanTimelineLinks;
  subjectName?: string;
  emptyLabel?: string;
}) {
  const split = splitPlanSessions(sessions);
  if (!sessions.length) {
    return emptyLabel ? (
      <p className="rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        {emptyLabel}
      </p>
    ) : null;
  }
  return (
    <div className="space-y-4">
      {split.next.length > 0 && split.nextDate && (
        <NextSessionCard sessions={split.next} date={split.nextDate} links={links} subjectName={subjectName} />
      )}
      {split.next.length === 0 && (
        <div className="rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          Будущих занятий по плану нет — семестр завершён или даты ещё не выставлены.
        </div>
      )}
      {split.upcoming.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Предстоящие занятия
          </h3>
          <div className="grid gap-3">
            {split.upcoming.map((session) => (
              <UpcomingSessionCard key={session.key} session={session} links={links} />
            ))}
          </div>
        </section>
      )}
      <PastSessionsList sessions={split.past} links={links} />
      {split.undated.length > 0 && (
        <PastSessionsList sessions={split.undated} links={links} label="Занятия без даты в плане" />
      )}
    </div>
  );
}
