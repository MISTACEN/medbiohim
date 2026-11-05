"use client";

/**
 * Совмещённый виджет «Сегодня / Завтра» — замена разрозненным блокам
 * «Ближайшее занятие», «Домашние задания» и «Что сейчас важно».
 *
 * Логика дня считается на странице (page.tsx) и приходит готовой:
 * - пока сегодняшний учебный день не закончился — показываются сегодняшние пары;
 * - после последней пары виджет переключается на завтра;
 * - если завтра занятий нет — следующий день с занятиями (страница это решает).
 *
 * Темы занятий добираются из учебных планов предметов (getSubjectPlan):
 * план есть не у всех предметов, поэтому деградация мягкая — показываем
 * предмет и время без темы.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, Clock, MapPin } from "lucide-react";
import { getSubjectPlan, type AcademicEvent, type DashboardHomework, type ScheduleEntry } from "@/lib/api";
import type { SubjectCard } from "@/lib/guards";
import { lessonStartMinutes, nowParts } from "@/lib/now-parts";
import { homeworkPrepStatus, PREP_STATUS_LABELS } from "@/lib/learning/statuses";
import { NextLessonPrep } from "@/components/home/NextLessonPrep";

type Props = {
  /** Целевая дата YYYY-MM-DD (сегодня, завтра или следующий учебный день). */
  date: string;
  /** Целевая дата — сегодня (иначе рисуем явную дату). */
  isToday: boolean;
  /** Целевая дата — завтра (для подписи «Завтра, 12 ноября»). */
  isTomorrow: boolean;
  /** Занятия целевого дня, уже отсортированы по времени. */
  lessons: ScheduleEntry[];
  /** Активные домашние задания из /dashboard. */
  homeworks: DashboardHomework[];
  /** Ближайшие академические события (/academic/state → upcoming). */
  events: AcademicEvent[];
  /** Предметы курса — источник slug/курса/семестра для планов. */
  subjects: SubjectCard[];
};

function str(row: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === "") continue;
    return String(value);
  }
  return "";
}

/** Подпись целевой даты: «Сегодня», «Завтра, 12 ноября» или «Четверг, 14 ноября». */
function dateLabel(date: string, isToday: boolean, isTomorrow: boolean): string {
  if (isToday) return "Сегодня";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const formatted = parsed.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (isTomorrow) return `Завтра, ${formatted}`;
  const weekday = parsed.toLocaleDateString("ru-RU", { weekday: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatted}`;
}

const EVENT_LABELS: Record<string, string> = {
  retake: "пересдача",
  makeup: "досдача",
  exam: "экзамен",
  credit: "зачёт",
  colloquium: "коллоквиум",
  control_work: "контрольная",
  assessment: "аттестация",
};

type LessonSubject = {
  id: string;
  name: string;
  slug: string;
  course: number | null;
  semester: number | null;
};

/** Предмет занятия: по subject_id, а без него — по названию из списка предметов. */
function resolveLessonSubject(lesson: ScheduleEntry, subjects: SubjectCard[]): LessonSubject | null {
  const id = str(lesson, "subject_id", "subjectId");
  const name = str(lesson, "subject_name", "subject", "title") || "Занятие";
  let card = id ? subjects.find((s) => s.id === id) : undefined;
  if (!card) {
    const lower = name.toLowerCase();
    card = subjects.find((s) => s.name.toLowerCase() === lower);
  }
  if (card) {
    return {
      id: card.id,
      name: card.name || name,
      slug: card.slug || "",
      course: card.course_number ?? null,
      semester: card.semester ?? null,
    };
  }
  if (!id) return null;
  return { id, name, slug: "", course: null, semester: null };
}

/** Неделя плана в нормализованном виде — как это делает страница предмета. */
type PlanWeek = { date: string; week: number; lecture: string; practice: string; control: string };

function normalizeWeek(item: unknown, index: number): PlanWeek | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const kind = String(row.item_type || "").toLowerCase();
  const lecture = String((kind === "lecture" ? row.title : metadata.lecture) || row.lecture || "");
  const practice = String(
    (["practice", "lab", "seminar"].includes(kind) ? row.title : metadata.practice) || row.practice || ""
  );
  const control = String(metadata.control || row.control || "");
  const date = String(row.planned_date || metadata.date || row.date || "").slice(0, 10);
  if (!date && !lecture && !practice && !control) return null;
  return { date, week: Number(metadata.week ?? row.week ?? index + 1), lecture, practice, control };
}

/** Тема занятия по типу пары: у лекции — лекция плана, у практики — практика. */
function themeForLesson(week: PlanWeek, type: string): string {
  const t = type.toLowerCase();
  const lecture = week.lecture;
  const practice = week.practice;
  const control = week.control;
  if (/л[её]кц|лк\b|lecture/.test(t)) return lecture || practice || control;
  if (/практ|лаб|семин|practice|lab|seminar/.test(t)) return practice || lecture || control;
  return lecture || practice || control;
}

export function TodaySummary({ date, isToday, isTomorrow, lessons, homeworks, events, subjects }: Props) {
  const now = nowParts();
  const nowMinutes = now.minutes;

  // Предметы занятий — ключ для подтемы и ДЗ.
  const lessonSubjects = useMemo(
    () => lessons.map((lesson) => ({ lesson, subject: resolveLessonSubject(lesson, subjects) })),
    [lessons, subjects]
  );

  // Неделя плана на целевую дату по предмету: { "<subjectId>": PlanWeek | null }.
  const [themes, setThemes] = useState<Record<string, PlanWeek | null>>({});
  const [themesLoading, setThemesLoading] = useState(false);
  const planKey = lessonSubjects
    .map(({ subject }) => (subject ? `${subject.id}:${subject.slug}:${subject.course}:${subject.semester}` : "-"))
    .join("|");

  useEffect(() => {
    const targets = lessonSubjects
      .map(({ subject }) => subject)
      .filter((s): s is LessonSubject => Boolean(s && s.slug));
    const unique = new Map<string, LessonSubject>();
    for (const target of targets) if (!unique.has(target.id)) unique.set(target.id, target);
    if (!unique.size) {
      setThemes({});
      setThemesLoading(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setThemesLoading(true);
    Promise.all(
      Array.from(unique.values()).map(async (target) => {
        try {
          const res = await getSubjectPlan(
            target.slug,
            target.course,
            target.semester,
            { signal: controller.signal }
          );
          if (!res?.ok) return [target.id, null] as const;
          const planData = (res.data?.plan ?? res.data ?? {}) as Record<string, unknown>;
          const rawWeeks = Array.isArray(planData.weeks)
            ? planData.weeks
            : Array.isArray(planData.items)
              ? planData.items
              : [];
          const weeks = rawWeeks
            .map((item: unknown, index: number) => normalizeWeek(item, index))
            .filter((w: PlanWeek | null): w is PlanWeek => w !== null);
          // Неделя плана, совпадающая с целевой датой (date хранится как YYYY-MM-DD…).
          const week = weeks.find((w: PlanWeek) => w.date && w.date === date) || null;
          return [target.id, week] as const;
        } catch {
          // Отмена или сбой сети — темы по этому предмету просто не будет.
          return [target.id, null] as const;
        }
      })
    )
      .then((entries) => {
        if (!active) return;
        setThemes(Object.fromEntries(entries));
        setThemesLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setThemesLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, planKey]);

  // Активные ДЗ, привязанные к предметам занятий.
  const homeworkBySubject = useMemo(() => {
    const map = new Map<string, DashboardHomework[]>();
    for (const hw of homeworks) {
      const sid = str(hw, "subject_id", "subjectId");
      if (!sid) continue;
      const list = map.get(sid) || [];
      list.push(hw);
      map.set(sid, list);
    }
    return map;
  }, [homeworks]);

  // Ближайшие аттестации предметов сегодняшних пар.
  const daySubjectByLowerName = useMemo(() => {
    const map = new Map<string, LessonSubject>();
    for (const { subject } of lessonSubjects) {
      if (subject) map.set(subject.name.trim().toLowerCase(), subject);
    }
    return map;
  }, [lessonSubjects]);

  const upcomingForDay = useMemo(() => {
    return events
      .map((event) => {
        const name = str(event as Record<string, unknown>, "subject_name").trim();
        const subject = daySubjectByLowerName.get(name.toLowerCase());
        if (!subject) return null;
        const eventDate = str(event as Record<string, unknown>, "date").slice(0, 10);
        if (eventDate && eventDate < date) return null;
        return { event, subject, eventDate };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.eventDate || "9999").localeCompare(b.eventDate || "9999"))
      .slice(0, 3);
  }, [events, daySubjectByLowerName, date]);

  const hasLessons = lessons.length > 0;
  const label = dateLabel(date, isToday, isTomorrow);
  const lessonsGridClass = hasLessons && lessons.length > 2 ? "sm:grid-cols-2 2xl:grid-cols-3" : "";

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            <CalendarDays className="h-4 w-4 shrink-0" />
            Учебный день
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              isToday
                ? "bg-indigo-600 text-white dark:bg-indigo-500"
                : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {label}
          </span>
        </div>
        <Link
          href="/schedule"
          className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 motion-reduce:transition-none"
        >
          Расписание <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {!hasLessons ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Занятий на этот день нет — следующий учебный день появится в расписании.
        </p>
      ) : (
        <div className={`grid gap-2 ${lessonsGridClass}`}>
          {lessons.map((lesson, index) => {
            const { subject } = lessonSubjects[index] || {};
            const title = subject?.name || str(lesson, "subject_name", "subject", "title") || "Занятие";
            const startTime = str(lesson, "start_time", "startTime").slice(0, 5);
            const endTime = str(lesson, "end_time", "endTime").slice(0, 5);
            const room = str(lesson, "room");
            const teacher = str(lesson, "teacher");
            const type = str(lesson, "type");
            const startMin = lessonStartMinutes(startTime);
            const endMin = lessonStartMinutes(endTime);
            const isNow = isToday && startMin !== null && startMin <= nowMinutes && (endMin === null || endMin > nowMinutes);
            const isPast = isToday && endMin !== null && endMin <= nowMinutes;
            const isNext = isToday && !isNow && !isPast && startMin !== null && startMin > nowMinutes &&
              !lessons.slice(0, index).some((prev) => {
                const s = lessonStartMinutes(str(prev, "start_time", "startTime").slice(0, 5));
                const e = lessonStartMinutes(str(prev, "end_time", "endTime").slice(0, 5));
                return s === null || e === null || e > nowMinutes;
              });
            const theme = subject ? themeForLesson(themes[subject.id] || { date: "", week: 0, lecture: "", practice: "", control: "" }, type) : "";
            const lessonHref = subject ? `/subjects/${encodeURIComponent(subject.id)}` : null;
            const planHref = subject ? `/subjects/${encodeURIComponent(subject.id)}?tab=plan` : null;
            const hwList = subject ? homeworkBySubject.get(subject.id) || [] : [];

            const cardClass = `rounded-xl border p-3 ${
              isNow
                ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-500/10"
                : isPast
                  ? "border-slate-100 bg-slate-50/60 opacity-75 dark:border-slate-800 dark:bg-slate-800/40"
                  : "border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40"
            }`;

            const head = (
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      {startTime || "--:--"}
                      {endTime ? `–${endTime}` : ""}
                    </span>
                    {isNow ? (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-indigo-500">
                        Сейчас
                      </span>
                    ) : isNext ? (
                      <span className="rounded-full border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:border-indigo-500/50 dark:text-indigo-400">
                        Следующая
                      </span>
                    ) : null}
                    {type ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                        {type}
                      </span>
                    ) : null}
                  </div>
                  {lessonHref ? (
                    <Link
                      href={lessonHref}
                      className="mt-1 block break-words text-sm font-semibold text-slate-900 hover:text-indigo-700 dark:text-slate-100 dark:hover:text-indigo-400 motion-reduce:transition-none"
                    >
                      {title}
                    </Link>
                  ) : (
                    <div className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {room ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {room}
                    </span>
                  ) : null}
                  {teacher ? <span className="max-w-[160px] truncate" title={teacher}>{teacher}</span> : null}
                </div>
              </div>
            );

            return (
              <div key={str(lesson, "id") || String(index)} className={`${cardClass} min-w-0`}>
                {head}
                {planHref ? (
                  theme ? (
                    <Link
                      href={planHref}
                      className="mt-2 block break-words rounded-lg px-1 py-1 text-xs text-slate-600 hover:text-indigo-700 dark:text-slate-400 dark:hover:text-indigo-400 motion-reduce:transition-none"
                    >
                      Тема: {theme}
                    </Link>
                  ) : (
                    <p className="mt-2 px-1 text-xs text-slate-400 dark:text-slate-500">
                      {themesLoading ? "Тема загружается…" : "Тема занятия — в плане предмета"}
                    </p>
                  )
                ) : null}
                {isNext && subject ? (
                  <NextLessonPrep
                    subject={{ id: subject.id, name: subject.name, slug: subject.slug }}
                    theme={theme}
                  />
                ) : null}
                {hwList.length ? (
                  <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                    {hwList.slice(0, 3).map((hw, i) => {
                      const hwStatus = homeworkPrepStatus(hw, now.date);
                      return (
                        <li key={str(hw, "id") || String(i)}>
                          <Link
                            href="/homework"
                            className="flex items-start gap-1.5 rounded-lg px-1 py-1 text-xs text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-400 motion-reduce:transition-none"
                          >
                            <ClipboardList className="mt-0.5 h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                            <span className="min-w-0 break-words">
                              {str(hw, "title") || "Задание"}
                              {str(hw, "due_at") ? (
                                <span className="text-slate-400 dark:text-slate-500"> · до {str(hw, "due_at").slice(0, 10)}</span>
                              ) : null}
                              {hwStatus !== "not_started" ? (
                                <span className="ml-1 whitespace-nowrap text-slate-400 dark:text-slate-500">
                                  · {PREP_STATUS_LABELS[hwStatus].toLowerCase()}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                    {hwList.length > 3 ? (
                      <li className="px-1 text-xs text-slate-400 dark:text-slate-500">
                        и ещё {hwList.length - 3} — <Link href="/homework" className="text-indigo-600 dark:text-indigo-400">в заданиях</Link>
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {upcomingForDay.length ? (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Контрольные и аттестации
          </p>
          <ul className="mt-2 space-y-1">
            {upcomingForDay.map(({ event, subject, eventDate }, i) => {
              const kind = str(event as Record<string, unknown>, "event_kind");
              const kindLabel = EVENT_LABELS[kind] || kind || "событие";
              const time = str(event as Record<string, unknown>, "start_time").slice(0, 5);
              const room = str(event as Record<string, unknown>, "room");
              return (
                <li key={str(event as Record<string, unknown>, "id") || String(i)}>
                  <Link
                    href={`/subjects/${encodeURIComponent(subject.id)}?tab=plan`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-1 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60 motion-reduce:transition-none"
                  >
                    <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 font-semibold text-[var(--status-warn-fg)]">
                      {kindLabel}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{subject.name}</span>
                    {eventDate ? <span className="tabular-nums text-slate-500 dark:text-slate-400">{eventDate.slice(8, 10)}.{eventDate.slice(5, 7)}</span> : null}
                    {time ? <span className="tabular-nums text-slate-500 dark:text-slate-400">{time}</span> : null}
                    {room ? <span className="text-slate-500 dark:text-slate-400">ауд. {room}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {hasLessons ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
          <Link
            href="/homework"
            className="inline-flex min-h-[40px] items-center gap-1 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 motion-reduce:transition-none"
          >
            Все задания <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/academic"
            className="inline-flex min-h-[40px] items-center gap-1 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 motion-reduce:transition-none"
          >
            Академический план <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
