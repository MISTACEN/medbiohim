/**
 * Общая лента ближайших учебных событий (/study ↔ /schedule).
 *
 * Чистая сборка buildAgenda — вход: академическое состояние (RPC
 * sync_my_academic_state), планировщик (/planner: ДЗ + посещаемость) и личные
 * отработки. Хук useStudentAgenda грузит все три источника и отдаёт единый
 * отсортированный список — его используют и /study, и /schedule, чтобы
 * «план дня» и расписание не расходились.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AcademicState, MyAssignment } from "@/lib/api/types";
import { getAcademicState } from "@/lib/api/misc";
import { getStudentPlanner } from "@/lib/api/schedule";
import { listMyAssignments } from "@/lib/api/homeworks";

export const EVENT_LABEL: Record<string, string> = {
  retake: "пересдача",
  makeup: "досдача",
  exam: "экзамен",
  credit: "зачёт",
  colloquium: "коллоквиум",
  control_work: "контрольная",
  assessment: "аттестация",
};

/** События, к которым применима ИИ-подготовка (чек-лист по темам предмета). */
const PREP_KINDS = new Set(["exam", "credit", "colloquium", "control_work"]);

export type AgendaKind = "exam" | "credit" | "colloquium" | "control_work" | "lesson" | "homework" | "assignment";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  /** Человеческая метка вида («контрольная», «ДЗ», «Отработка»). */
  label: string;
  title: string;
  subject: string | null;
  /** ISO-дата (yyyy-mm-dd) или null, если срок неизвестен. */
  date: string | null;
  time: string | null;
  /** Аттестация/экзамен или просроченное несданное — красная зона. */
  urgent: boolean;
  /** ДЗ выполнено/сдано — не тащим в «что делать». */
  done?: boolean;
  href?: string;
  meta?: string | null;
  /** Идентификатор события расписания — для ИИ-подготовки. */
  scheduleEntryId?: string | null;
  subjectSlug?: string | null;
  /** Готовность к событию, % (темы плана предмета × user_topic_progress). */
  masteryPct?: number | null;
  /** Дней до события — для карточки «Готовность 62% · через 9 дней». */
  daysLeft?: number | null;
};

export type PlannerHomework = {
  id: string;
  title: string;
  due_date: string | null;
  subject_name: string | null;
  subject_slug: string | null;
  my_status: "done" | "pending" | "submitted" | "graded" | "returned";
  grade?: number | null;
  teacher_comment?: string | null;
};

export type AgendaData = {
  academic: AcademicState | null;
  planner: { homeworks: PlannerHomework[]; recovery?: any[] } | null;
  assignments: MyAssignment[];
  agenda: AgendaItem[];
};

const isoToday = () => new Date().toISOString().slice(0, 10);

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIso + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function buildAgenda(
  input: {
    academic?: AcademicState | null;
    planner?: { homeworks?: PlannerHomework[] } | null;
    assignments?: MyAssignment[] | null;
    today?: string;
  },
): AgendaItem[] {
  const today = input.today || isoToday();
  const items: AgendaItem[] = [];

  for (const event of input.academic?.upcoming ?? []) {
    const kindRaw = String(event.event_kind || "lesson");
    const kind: AgendaKind = (EVENT_LABEL[kindRaw] ? kindRaw : "lesson") as AgendaKind;
    const kindLabel = EVENT_LABEL[kindRaw] || "занятие";
    items.push({
      id: `event-${event.id ?? `${event.date}-${event.start_time ?? ""}`}`,
      kind,
      label: kindLabel,
      title: `${event.subject_name || "Предмет"} — ${kindLabel}`,
      subject: event.subject_name ?? null,
      date: event.date ?? null,
      time: event.start_time ? String(event.start_time).slice(0, 5) : null,
      urgent: ["exam", "credit", "colloquium", "control_work"].includes(kindRaw),
      href: "/schedule",
      scheduleEntryId: event.id ?? null,
      subjectSlug: event.subject_slug ? String(event.subject_slug) : null,
      masteryPct: typeof event.mastery_pct === "number" ? event.mastery_pct : null,
      daysLeft: typeof event.days_left === "number" ? event.days_left : null,
    });
  }

  for (const hw of input.planner?.homeworks ?? []) {
    const done = hw.my_status !== "pending";
    const due = hw.due_date || null;
    // Просроченное несданное — самое срочное; сдача в ближайшие 3 дня — жёлтая зона.
    const overdue = !done && due !== null && due < today;
    const soon = !done && due !== null && daysBetween(today, due) <= 3;
    items.push({
      id: `hw-${hw.id}`,
      kind: "homework",
      label: "ДЗ",
      title: hw.title || "Домашнее задание",
      subject: hw.subject_name ?? null,
      date: due,
      time: null,
      urgent: overdue,
      done,
      href: "/homework",
      meta: overdue ? "просрочено" : soon ? "срок близко" : null,
      subjectSlug: hw.subject_slug ?? null,
    });
  }

  for (const item of input.assignments ?? []) {
    if (item.status === "passed") continue;
    items.push({
      id: `assignment-${item.id}`,
      kind: "assignment",
      label: "Отработка",
      title: item.topic,
      subject: item.subject,
      date: item.due_date ?? null,
      time: null,
      urgent: item.status === "retake_needed" || item.status === "failed",
      href: "/study",
    });
  }

  return items.sort((a, b) => {
    const aDone = a.done === true ? 1 : 0;
    const bDone = b.done === true ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    if (a.date && b.date) {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return (a.urgent ? 0 : 1) - (b.urgent ? 0 : 1);
    }
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title);
  });
}

export type UseStudentAgendaResult = {
  loading: boolean;
  error: string | null;
  data: AgendaData;
  agenda: AgendaItem[];
  academic: AcademicState | null;
  planner: AgendaData["planner"];
  assignments: MyAssignment[];
  refresh: () => void;
};

export function useStudentAgenda(): UseStudentAgendaResult {
  const [academic, setAcademic] = useState<AcademicState | null>(null);
  const [planner, setPlanner] = useState<AgendaData["planner"]>(null);
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Расписание — на 3 недели вперёд: план дня не смотрит дальше.
    const from = isoToday();
    const to = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

    void (async () => {
      const [academicResult, plannerResult, assignmentsResult] = await Promise.all([
        getAcademicState({ signal: controller.signal }),
        getStudentPlanner(from, to, undefined, { signal: controller.signal }),
        listMyAssignments(),
      ]);
      if (cancelled) return;
      // Академ-состояние не критично: без него лента всё равно собирается.
      if (academicResult.ok) setAcademic(academicResult.data);
      if (plannerResult.ok) {
        const payload = plannerResult.data as { homeworks?: PlannerHomework[]; recovery?: any[] };
        setPlanner({ homeworks: payload?.homeworks ?? [], recovery: payload?.recovery ?? [] });
      }
      if (assignmentsResult.ok) setAssignments((assignmentsResult.data as { items?: MyAssignment[] })?.items ?? []);
      const failed = [academicResult, plannerResult, assignmentsResult].every((r) => !r.ok);
      if (failed) setError("Не удалось загрузить учебные данные");
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setError("Не удалось загрузить учебные данные");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadTick]);

  const agenda = useMemo(
    () => buildAgenda({ academic, planner, assignments }),
    [academic, planner, assignments],
  );

  return { loading, error, data: { academic, planner, assignments, agenda }, agenda, academic, planner, assignments, refresh };
}

/** Готовиться по ИИ-чеклисту можно к аттестационным событиям. */
export function isPrepTarget(item: AgendaItem): boolean {
  return PREP_KINDS.has(item.kind) || Boolean(item.scheduleEntryId && item.kind !== "homework");
}
