"use client";

/**
 * Данные и действия страницы расписания.
 *
 * Перенесено из `src/app/schedule/page.tsx` без изменения поведения: те же
 * запросы (`getScheduleMeta` → `listSchedule` + `getStudentPlanner`), те же
 * обработчики ДЗ и посещаемости, тот же сброс ошибки при перезагрузке. Страница
 * теперь только собирает разметку из видов (неделя/день/месяц/семестр) и
 * панели занятия.
 */
import { useEffect, useMemo, useState, useRef } from "react";
import {
  listSchedule,
  getScheduleMeta,
  getStudentPlanner,
  markAttendance,
  hasToken,
  getLessonPlan,
  setHomeworkDone,
  submitHomework,
  uploadFile,
  createHomework,
  updateHomework,
  smartParseHomework,
  type ScheduleItem,
  type ScheduleMeta,
  type SubjectPlanWeek,
} from "@/lib/api";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ScheduleBundle } from "@/components/schedule/ScheduleCard";
import {
  FALLBACK_SEMESTER,
  addDaysYmd,
  deriveSemesterRange,
  monthGridDays,
  monthStartYmd,
  nowParts,
  startOfWeekYmd,
  GRID_START_MIN,
  PX_PER_MIN,
  type SemesterRange,
} from "@/components/schedule/utils";
import { describeApiError } from "@/lib/errors";
import {
  academicYearLabel,
  buildSemesterWeeks,
  filterHomeworks,
  groupItemsByDate,
  homeworkIsEditable,
  homeworkState,
  homeworkStateLabel,
  homeworkSubjects,
  homeworksForLesson,
} from "@/components/schedule/model";

export function useSchedulePage() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => nowParts());
  const [weekStart, setWeekStart] = useState(() => startOfWeekYmd(nowParts().date));
  const [view, setView] = useState<"day" | "week" | "month" | "semester">("week");
  const [selectedDay, setSelectedDay] = useState(() => nowParts().date);
  // C10: панель дней помнит скролл между переключениями (sessionStorage).
  const dayScrollRef = useRef<HTMLDivElement | null>(null);
  const dayScrollKey = "mb_schedule_days_scroll";
  useEffect(() => {
    const saved = Number(sessionStorage.getItem(dayScrollKey) || 0);
    const element = dayScrollRef.current;
    if (saved > 0 && element) element.scrollTop = saved;
  }, []);
  function rememberDayScroll() {
    const top = dayScrollRef.current?.scrollTop || 0;
    if (top > 0) sessionStorage.setItem(dayScrollKey, String(top));
  }
  const [monthStart, setMonthStart] = useState(() => monthStartYmd(nowParts().date));
  const [allItems, setAllItems] = useState<ScheduleItem[]>([]);
  const [homeworks, setHomeworks] = useState<any[]>([]);
  /** ДЗ конкретного занятия (id записи расписания → задания) — для карточек. */
  const [homeworkByEntry, setHomeworkByEntry] = useState<Record<string, any[]>>({});
  const [recovery, setRecovery] = useState<any[]>([]);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [source, setSource] = useState("db");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScheduleItem | null>(null);
  const [lesson, setLesson] = useState<SubjectPlanWeek | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonWeeks, setLessonWeeks] = useState<SubjectPlanWeek[]>([]);
  const [meta, setMeta] = useState<ScheduleMeta>({ periods: [], duration_rules: [] });
  const [homeworkOpenId, setHomeworkOpenId] = useState<string | null>(null);
  const [homeworkAnswer, setHomeworkAnswer] = useState("");
  const [homeworkBusy, setHomeworkBusy] = useState<string | null>(null);
  const [addHomeworkOpen, setAddHomeworkOpen] = useState(false);
  const [smartPasteText, setSmartPasteText] = useState("");
  const [smartPasteOpen, setSmartPasteOpen] = useState(false);
  const [smartPasteBusy, setSmartPasteBusy] = useState(false);
  const [smartPasteNote, setSmartPasteNote] = useState<string | null>(null);
  const smartPasteAppliedRef = useRef<string | null>(null);
  const [addHomeworkTitle, setAddHomeworkTitle] = useState("");
  const [addHomeworkDescription, setAddHomeworkDescription] = useState("");
  const [addHomeworkFiles, setAddHomeworkFiles] = useState<File[]>([]);
  // Диапазон семестра выводится из меты (календарные периоды) при загрузке.
  const [semesterRange, setSemesterRange] = useState<SemesterRange>(FALLBACK_SEMESTER);
  const semesterRangeRef = useRef<SemesterRange>(FALLBACK_SEMESTER);
  // Фильтры планировщика: поиск, предмет, статус.
  const [hwSearch, setHwSearch] = useState("");
  const [hwSubject, setHwSubject] = useState("");
  const [hwStatus, setHwStatus] = useState<"all" | "active" | "overdue" | "done">("all");

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("day");
  }, []);

  useEffect(() => {
    const tick = () => setNow(nowParts());
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [user?.course, user?.semester]);

  // D9: загрузка расписания, меты и planner'а через useApiRequest —
  // AbortSignal отменяет запросы при unmount и смене группы/курса.
  // Мета грузится первой: из календарных периодов выводится диапазон семестра,
  // которым ограничиваются запросы расписания и planner'а.
  const { data: scheduleBundle, loading, error: loadError } = useApiRequest<ScheduleBundle | null>(
    async (signal) => {
      if (!hasToken()) return null;
      const metaRes = await getScheduleMeta(user?.course, user?.semester, { signal });
      let meta: ScheduleMeta = { periods: [], duration_rules: [] };
      if (metaRes.ok && metaRes.data) {
        const raw = metaRes.data as Partial<{ periods: unknown; duration_rules: unknown }> & Record<string, unknown>;
        meta = {
          ...raw,
          periods: Array.isArray(raw.periods) ? raw.periods : [],
          duration_rules: Array.isArray(raw.duration_rules) ? raw.duration_rules : [],
        } as ScheduleMeta;
      }
      const range = deriveSemesterRange(meta);
      const [res, plannerRes] = await Promise.all([
        listSchedule(range.from, range.to, user?.groupId, { signal }),
        getStudentPlanner(range.from, range.to, user?.groupId, { signal }),
      ]);
      let items: ScheduleItem[] = [];
      let source = "db";
      let message: string | null = null;
      if (res.ok) {
        items = Array.isArray(res.data.items) ? res.data.items : [];
        source = res.data.source || "db";
        if (items.length === 0) {
          message = user?.groupName
            ? "Для назначенной группы пока не найдено занятий. Возможно, расписание ещё не опубликовано — попробуйте позже или сообщите администратору."
            : "Учебная группа не назначена. Назначьте её в CMS, чтобы расписание могло быть загружено.";
        }
      } else {
        message = describeApiError(res.error) || "Не удалось загрузить расписание";
      }
      let homeworks: any[] = [];
      let recovery: any[] = [];
      const homeworkByEntry: Record<string, any[]> = {};
      if (plannerRes.ok) {
        homeworks = Array.isArray(plannerRes.data.homeworks) ? plannerRes.data.homeworks : [];
        recovery = Array.isArray(plannerRes.data.recovery) ? plannerRes.data.recovery : [];
        const byEntry = new Map<string, string>();
        for (const a of (plannerRes.data.attendance || [])) byEntry.set(String(a.schedule_entry_id), String(a.status));
        items = items.map((it) => ({ ...it, attendance_status: byEntry.get(String(it.id)) || it.attendance_status }));
        // ДЗ уже привязаны к занятиям на бэкенде (lessons[].homeworks) —
        // используем эту связку, чтобы показать ДЗ прямо на карточке занятия.
        const lessons = Array.isArray(plannerRes.data.lessons) ? plannerRes.data.lessons : [];
        const kindByEntry = new Map<string, string>();
        for (const lesson of lessons) {
          if (lesson?.id == null) continue;
          kindByEntry.set(String(lesson.id), String(lesson.event_kind || "class"));
          const linked = Array.isArray(lesson.homeworks) ? lesson.homeworks : [];
          if (linked.length) homeworkByEntry[String(lesson.id)] = linked;
        }
        // event_kind приходит из planner (schedule_entries) — merge по id.
        items = items.map((it) => ({ ...it, event_kind: kindByEntry.get(String(it.id)) || (it as any).event_kind || null }));
      }
      return { items, source, meta, homeworks, recovery, homeworkByEntry, message, range };
    },
    [user?.groupId, user?.course, user?.semester],
  );

  useEffect(() => {
    if (!scheduleBundle) return;
    setAllItems(scheduleBundle.items);
    setSource(scheduleBundle.source);
    setMeta(scheduleBundle.meta);
    setHomeworks(scheduleBundle.homeworks);
    setHomeworkByEntry(scheduleBundle.homeworkByEntry || {});
    setRecovery(scheduleBundle.recovery);
    setError(scheduleBundle.message);
    setSemesterRange(scheduleBundle.range);
    semesterRangeRef.current = scheduleBundle.range;
  }, [scheduleBundle]);

  // Как и раньше: при старте новой загрузки прошлая ошибка сбрасывается.
  useEffect(() => {
    if (loading) setError(null);
  }, [loading]);

  const displayError = error ?? loadError;

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ key: addDaysYmd(weekStart, i) })), [weekStart]);
  const weekEnd = addDaysYmd(weekStart, 6);
  const items = useMemo(
    () => allItems.filter((it) => it.date && it.date >= weekStart && it.date <= weekEnd),
    [allItems, weekStart, weekEnd],
  );

  async function setAttendance(item: ScheduleItem, status: "present" | "excused" | "sick" | "unexcused") {
    setAttendanceBusy(true);
    const r = await markAttendance(String(item.id), status, undefined, user?.groupId);
    setAttendanceBusy(false);
    if (r.ok) setAllItems((prev) => prev.map((it) => (String(it.id) === String(item.id) ? { ...it, attendance_status: status } : it)));
    else setError(describeApiError(r.error));
  }

  const selectedHomeworks = useMemo(() => homeworksForLesson(homeworks, selected), [homeworks, selected]);

  const canCreateHomework = Boolean(user);

  const hwSubjects = useMemo(() => homeworkSubjects(homeworks), [homeworks]);

  const filteredHomeworks = useMemo(
    () => filterHomeworks(homeworks, { search: hwSearch, subject: hwSubject, status: hwStatus, today: now.date }),
    [homeworks, hwSearch, hwSubject, hwStatus, now.date],
  );

  /** Перенос своего задания на N дней вперёд (PATCH /homeworks/:id). */
  async function rescheduleHomework(h: any, days: number) {
    const id = String(h.id);
    setHomeworkBusy(id);
    const base = String(h.due_date || h.due_at?.slice(0, 10) || now.date);
    const nextDate = addDaysYmd(base, days);
    const r = await updateHomework(id, {
      title: String(h.title || "Задание"),
      description: h.description ?? null,
      due_at: nextDate,
    });
    if (r.ok) setHomeworks((prev) => prev.map((x) => (String(x.id) === id ? { ...x, due_date: nextDate, due_at: nextDate } : x)));
    else setError(describeApiError(r.error));
    setHomeworkBusy(null);
  }

  const homeworkEditable = (h: any) => homeworkIsEditable(h, user?.id);
  const homeworkStatus = (h: any) => homeworkState(h, now.date);
  const homeworkStatusLabel = (h: any) => homeworkStateLabel(h, now.date);

  async function toggleHomework(h: any) {
    setHomeworkBusy(String(h.id));
    const done = homeworkStatus(h) !== "done";
    const r = await setHomeworkDone(String(h.id), done);
    if (r.ok) setHomeworks((prev) => prev.map((x) => (String(x.id) === String(h.id) ? { ...x, my_status: done ? "done" : "pending", my_completed: done } : x)));
    else setError(describeApiError(r.error));
    setHomeworkBusy(null);
  }

  async function submitSelectedHomework(h: any, file?: File) {
    setHomeworkBusy(String(h.id));
    let fileId: string | undefined;
    if (file) {
      const targetGroupId = user?.groupId || (selected as any)?.group_id || undefined;
      const uploaded = await uploadFile(file, targetGroupId);
      if (!uploaded.ok) {
        setError(describeApiError(uploaded.error));
        setHomeworkBusy(null);
        return;
      }
      fileId = uploaded.data.file?.id;
    }
    const r = await submitHomework(String(h.id), homeworkAnswer || undefined, fileId);
    if (r.ok) {
      setHomeworks((prev) => prev.map((x) => (String(x.id) === String(h.id) ? { ...x, my_completed: true, my_status: "done", submission_status: "submitted" } : x)));
      setHomeworkAnswer("");
      setHomeworkOpenId(null);
    } else setError(describeApiError(r.error));
    setHomeworkBusy(null);
  }

  async function addHomeworkForSelected() {
    if (!selected || !selected.subject_id || !selected.id || !addHomeworkTitle.trim()) return;
    setHomeworkBusy("add");
    setError(null);

    const attachmentFileIds: string[] = [];
    for (const file of addHomeworkFiles) {
      if (!file.type.startsWith("image/")) {
        setError(`«${file.name}» не является изображением`);
        setHomeworkBusy(null);
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setError(`«${file.name}» больше 15 МБ`);
        setHomeworkBusy(null);
        return;
      }
      const uploaded = await uploadFile(file, user?.groupId);
      if (!uploaded.ok) {
        setError(describeApiError(uploaded.error));
        setHomeworkBusy(null);
        return;
      }
      const id = String(uploaded.data?.file?.id || "");
      if (!id) {
        setError(`Сервер не вернул ID файла «${file.name}»`);
        setHomeworkBusy(null);
        return;
      }
      attachmentFileIds.push(id);
    }

    const r = await createHomework({
      title: addHomeworkTitle.trim(),
      description: addHomeworkDescription.trim() || undefined,
      subject_id: String(selected.subject_id),
      due_date: String(selected.date),
      group_id: (user?.groupId || (selected as any)?.group_id || undefined),
      schedule_entry_id: String(selected.id),
      attachment_file_ids: attachmentFileIds,
    });
    if (r.ok) {
      setAddHomeworkTitle("");
      setAddHomeworkDescription("");
      setAddHomeworkFiles([]);
      setAddHomeworkOpen(false);
      const refreshed = await getStudentPlanner(semesterRangeRef.current.from, semesterRangeRef.current.to, user?.groupId);
      if (refreshed.ok) setHomeworks(Array.isArray(refreshed.data.homeworks) ? refreshed.data.homeworks : []);
    } else setError(describeApiError(r.error));
    setHomeworkBusy(null);
  }

  // §8 Smart Paste: разобрать вставленный из чата текст и подставить в форму.
  // Заполняются только поля, которые парсер распознал честно; дедлайн не
  // перезаписывает привязку к занятию — форма уже привязана к выбранному.
  async function applySmartPaste() {
    if (!smartPasteText.trim() || smartPasteBusy) return;
    setSmartPasteBusy(true);
    setSmartPasteNote(null);
    const res = await smartParseHomework(smartPasteText.trim());
    setSmartPasteBusy(false);
    if (!res.ok) {
      setSmartPasteNote(describeApiError(res.error));
      return;
    }
    const parsed = res.data as { ok: boolean; reason?: string; title: string | null; dueDate: string | null; checklist: string[]; criteria: string | null };
    if (!parsed.ok) {
      setSmartPasteNote(parsed.reason || "Не удалось разобрать текст");
      return;
    }
    const parts: string[] = [];
    if (parsed.title) {
      setAddHomeworkTitle(parsed.title);
      parts.push("тема");
    }
    const checklist = parsed.checklist || [];
    const criteria = parsed.criteria || "";
    const description = [checklist.length ? checklist.map((item, i) => `${i + 1}. ${item}`).join("\n") : "", criteria].filter(Boolean).join("\n\n");
    if (description) {
      setAddHomeworkDescription((current) => (current ? current + "\n\n" + description : description));
      parts.push(checklist.length ? "задачи" : "");
      parts.push(criteria ? "критерии" : "");
    }
    smartPasteAppliedRef.current = smartPasteText.trim().slice(0, 80);
    setSmartPasteText("");
    setSmartPasteNote("Распознано: " + parts.filter(Boolean).join(", ") + (parsed.dueDate ? ` · дедлайн ${parsed.dueDate} (проверьте привязку к занятию)` : ""));
  }

  async function openLesson(item: ScheduleItem) {
    setSelected(item);
    setLesson(null);
    setAddHomeworkOpen(false);
    setSmartPasteText("");
    setSmartPasteNote(null);
    smartPasteAppliedRef.current = null;
    setAddHomeworkTitle("");
    setAddHomeworkDescription("");
    setAddHomeworkFiles([]);
    setLessonWeeks([]);
    setLessonLoading(true);
    const res = await getLessonPlan({
      date: item.date,
      subject: item.subject_name || undefined,
    });
    setLessonLoading(false);
    if (res.ok) {
      setLesson(res.data.lesson);
      setLessonWeeks(res.data.weeks || []);
    }
  }

  const grouped = useMemo(() => groupItemsByDate(items), [items]);

  const today = now.date;
  const first = allItems[0] || items[0];
  const course = user?.course ?? first?.course_number ?? null;
  const semester = first?.semester ?? user?.semester ?? null;
  const groupName = user?.groupName || first?.group_name || first?.group_code || "Учебная группа не назначена";
  const groupMissing = !user?.groupName && allItems.length === 0;
  const currentDayItems = grouped.get(selectedDay) || [];
  const monthDays = useMemo(() => monthGridDays(monthStart), [monthStart]);
  const monthItems = useMemo(() => allItems.filter((it) => it.date?.startsWith(monthStart.slice(0, 7))), [allItems, monthStart]);
  const semesterWeeks = useMemo(() => buildSemesterWeeks(allItems, semesterRange), [allItems, semesterRange]);
  const yearLabel = academicYearLabel(semesterRange);
  const showNowLine = now.minutes >= GRID_START_MIN && now.minutes <= 18 * 60 + 30;
  const nowTop = (now.minutes - GRID_START_MIN) * PX_PER_MIN;
  const weekCount = items.length;
  const totalCount = allItems.length;
  const periods = Array.isArray(meta?.periods) ? meta.periods : [];
  const activePeriod = periods.find((p: any) => p.start_date <= weekEnd && (!p.end_date || p.end_date >= weekStart));

  return {
    // состояние
    user,
    now,
    view,
    setView,
    weekStart,
    setWeekStart,
    selectedDay,
    setSelectedDay,
    monthStart,
    setMonthStart,
    allItems,
    items,
    homeworks,
    homeworkByEntry,
    recovery,
    attendanceBusy,
    source,
    loading,
    displayError,
    selected,
    setSelected,
    lesson,
    lessonLoading,
    lessonWeeks,
    meta,
    semesterRange,
    // производные
    days,
    weekEnd,
    grouped,
    today,
    course,
    semester,
    groupName,
    groupMissing,
    currentDayItems,
    monthDays,
    monthItems,
    semesterWeeks,
    yearLabel,
    showNowLine,
    nowTop,
    weekCount,
    totalCount,
    periods,
    activePeriod,
    // планировщик ДЗ
    hwSearch,
    setHwSearch,
    hwSubject,
    setHwSubject,
    hwStatus,
    setHwStatus,
    hwSubjects,
    filteredHomeworks,
    // ДЗ занятия
    selectedHomeworks,
    canCreateHomework,
    homeworkOpenId,
    setHomeworkOpenId,
    homeworkAnswer,
    setHomeworkAnswer,
    homeworkBusy,
    addHomeworkOpen,
    setAddHomeworkOpen,
    smartPasteText,
    setSmartPasteText,
    smartPasteOpen,
    setSmartPasteOpen,
    smartPasteBusy,
    smartPasteNote,
    addHomeworkTitle,
    setAddHomeworkTitle,
    addHomeworkDescription,
    setAddHomeworkDescription,
    addHomeworkFiles,
    setAddHomeworkFiles,
    // действия
    setAttendance,
    rescheduleHomework,
    homeworkEditable,
    homeworkStatus,
    homeworkStatusLabel,
    toggleHomework,
    submitSelectedHomework,
    addHomeworkForSelected,
    applySmartPaste,
    openLesson,
    rememberDayScroll,
    dayScrollRef,
  };
}

export type ScheduleController = ReturnType<typeof useSchedulePage>;
