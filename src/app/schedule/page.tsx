"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Database, AlertTriangle, X, BookOpen, GraduationCap, CheckCircle2, Target, Layers3, ClipboardList, Plus, Upload, Loader2,
} from "lucide-react";
import Link from "next/link";
import { listSchedule, getScheduleMeta, getStudentPlanner, markAttendance, hasToken, getLessonPlan, setHomeworkDone, submitHomework, uploadFile, createHomework, smartParseHomework, type ScheduleItem, type ScheduleMeta, type SubjectPlanWeek } from "@/lib/api";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import { nowParts as sharedNowParts } from "@/lib/now-parts";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards, SkeletonText } from "@/components/ui/Skeleton";
import IcalImportCard from "@/components/schedule/IcalImportCard";
import { describeApiError } from "@/lib/errors";

/**
 * Оценка и отзыв преподавателя по этой работе. Бэкенд их возвращал, но в интерфейсе
 * студент не видел их нигде — ни в расписании, ни в карточке ДЗ.
 */
function HomeworkGrade({ homework }: { homework: any }) {
  const grade = homework?.grade;
  const comment = homework?.teacher_comment;
  const gradedAt = homework?.graded_at ? String(homework.graded_at).slice(0, 10).split("-").reverse().join(".") : "";
  if ((grade == null || grade === "") && !comment) return null;
  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--primary-soft)] px-3 py-2 text-xs" role="status">
      <div className="font-semibold" style={{ color: "var(--text)" }}>
        Оценка преподавателя{grade != null && grade !== "" ? `: ${grade}` : ""}
        {gradedAt ? <span className="ml-2 opacity-70">· {gradedAt}</span> : null}
      </div>
      {comment ? <p className="mt-1 whitespace-pre-wrap opacity-80">{String(comment)}</p> : null}
    </div>
  );
}

const TZ = "Asia/Vladivostok";
const SEMESTER_FROM = "2026-09-01";
const SEMESTER_TO = "2027-01-31";

const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная",
  seminar: "Семинар", exam: "Экзамен", credit: "Зачёт",
  consultation: "Консультация", other: "Занятие",
};
const TYPE_CLASS: Record<string, string> = {
  lecture: "schedule-lecture", practice: "schedule-practice", laboratory: "schedule-lab",
  seminar: "schedule-seminar", exam: "schedule-exam", credit: "schedule-credit",
  consultation: "schedule-consultation", other: "schedule-other",
};
const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
const GRID_START_MIN = 8 * 60;
const PX_PER_MIN = 1.05;
const SUBJECT_PALETTE = ["#2563eb","#7c3aed","#059669","#ea580c","#db2777","#0891b2","#65a30d","#9333ea","#0284c7","#ca8a04","#e11d48","#0f766e"];
const TYPE_COLORS: Record<string,string> = {
  lecture:"#6366f1", practice:"#10b981", laboratory:"#f59e0b", seminar:"#06b6d4",
  exam:"#f43f5e", credit:"#8b5cf6", consultation:"#3b82f6", other:"#64748b",
};
function subjectColor(item:any): string {
  if (typeof item?.color_hex === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color_hex)) return item.color_hex;
  const raw=String(item?.subject_slug||item?.subject_name||"subject");
  let h=0; for(let i=0;i<raw.length;i++) h=((h<<5)-h+raw.charCodeAt(i))|0;
  return SUBJECT_PALETTE[Math.abs(h)%SUBJECT_PALETTE.length];
}
function attendanceLabel(status?: string | null){return status==="present"?"Был":status==="excused"?"Уважительная":status==="sick"?"Болезнь":status==="unexcused"?"Пропуск":"";}

// FD8: общая реализация с дашбордом — src/lib/now-parts.ts
const nowParts = () => sharedNowParts();
function parseYmd(ymd: string) { const [y,m,d]=ymd.split("-").map(Number); return {y,m,d}; }
function addDaysYmd(ymd: string, days: number): string {
  const {y,m,d}=parseYmd(ymd); const utc=new Date(Date.UTC(y,m-1,d+days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth()+1).padStart(2,"0")}-${String(utc.getUTCDate()).padStart(2,"0")}`;
}
function startOfWeekYmd(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const utc=new Date(Date.UTC(y,m-1,d)); const dow=utc.getUTCDay();
  return addDaysYmd(ymd, dow===0?-6:1-dow);
}
function weekdayShortRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const dt=new Date(Date.UTC(y,m-1,d,12));
  return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(dt).replace(".","");
}
function dayDateRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd); const dt=new Date(Date.UTC(y,m-1,d,12));
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(dt);
}
function weekTitle(startYmd: string): string {
  const endYmd=addDaysYmd(startYmd,6); const a=parseYmd(startYmd); const b=parseYmd(endYmd);
  const start=new Date(Date.UTC(a.y,a.m-1,a.d,12)); const end=new Date(Date.UTC(b.y,b.m-1,b.d,12));
  const fmt=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",timeZone:"UTC"});
  const fmtEnd=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
  return `${fmt.format(start)} — ${fmtEnd.format(end)} · Хабаровск`;
}
function monthStartYmd(ymd: string): string {
  const {y,m}=parseYmd(ymd);
  return `${y}-${String(m).padStart(2,"0")}-01`;
}
function addMonthsYmd(ymd: string, delta: number): string {
  const {y,m}=parseYmd(ymd);
  const d=new Date(Date.UTC(y,m-1+delta,1,12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-01`;
}
function monthTitle(ymd: string): string {
  const {y,m}=parseYmd(ymd);
  return new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,1,12)));
}
function monthGridDays(ymd: string): string[] {
  const first=monthStartYmd(ymd);
  const monday=startOfWeekYmd(first);
  return Array.from({length:42},(_,i)=>addDaysYmd(monday,i));
}
function dateLabelRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd);
  return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d,12)));
}
function shortDateRu(ymd: string): string {
  const {y,m,d}=parseYmd(ymd);
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d,12)));
}
function subjectColorKey(type?: string | null): string {
  if (type==="practice") return "practice";
  if (type==="laboratory") return "lab";
  if (type==="exam" || type==="credit") return "exam";
  if (type==="seminar") return "seminar";
  return "lecture";
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function timeToMinutes(v: string) { const [h,m]=v.slice(0,5).split(":").map(Number); return h*60+m; }
function breakRange(value: string): { start: number; end: number } | null {
  const m = String(value || "").match(/(\d{1,2}:\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2})/i);
  if (!m) return null;
  const start = timeToMinutes(m[1]);
  const end = timeToMinutes(m[2]);
  return end > start ? { start, end } : null;
}

/** Pack overlapping events into side-by-side columns (classic calendar layout). */
function layoutDayColumns(items: ScheduleItem[]): Array<{ item: ScheduleItem; col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => {
    const s = a.start_time.localeCompare(b.start_time);
    return s !== 0 ? s : a.end_time.localeCompare(b.end_time);
  });
  const seen = new Set<string>();
  const unique: ScheduleItem[] = [];
  for (const it of sorted) {
    const k = `${it.date}|${it.start_time}|${it.end_time}|${it.subject_name}|${it.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(it);
  }
  type Node = { item: ScheduleItem; start: number; end: number; col: number };
  const nodes: Node[] = [];
  const colEnds: number[] = [];
  for (const item of unique) {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);
    let col = colEnds.findIndex((e) => e <= start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(end);
    } else {
      colEnds[col] = end;
    }
    nodes.push({ item, start, end, col });
  }
  const result: Array<{ item: ScheduleItem; col: number; cols: number }> = [];
  let i = 0;
  while (i < nodes.length) {
    let clusterEnd = nodes[i].end;
    let j = i + 1;
    while (j < nodes.length && nodes[j].start < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, nodes[j].end);
      j++;
    }
    const cluster = nodes.slice(i, j);
    const cols = Math.max(1, ...cluster.map((n) => n.col + 1));
    for (const n of cluster) result.push({ item: n.item, col: n.col, cols });
    i = j;
  }
  return result;
}

function ScheduleCard({
  item, onOpen, col = 0, cols = 1,
}: {
  item: ScheduleItem;
  onOpen: (item: ScheduleItem) => void;
  col?: number;
  cols?: number;
}) {
  const start = timeToMinutes(item.start_time);
  const end = timeToMinutes(item.end_time);
  const top = Math.max(0, (start - GRID_START_MIN) * PX_PER_MIN);
  const height = Math.max(66, (end - start) * PX_PER_MIN);
  const type = TYPE_CLASS[item.type || ""] || TYPE_CLASS.other;
  const subject = item.subject_name || "Занятие";
  const location = [item.building, item.room].filter(Boolean).join(", ");
  const typeLabel = TYPE_LABELS[item.type || ""] || "Занятие";
  const accent = subjectColor(item);
  const typeColor = TYPE_COLORS[item.type || ""] || TYPE_COLORS.other;
  const attendance = item.attendance_status as string | undefined;
  const parityLabel =
    item.week_parity === "numerator" ? "числитель" :
    item.week_parity === "denominator" ? "знаменатель" :
    item.week_parity === "all" ? "каждую неделю" : null;
  const gap = 3;
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(item); }}
      className={`schedule-card absolute cursor-pointer overflow-hidden rounded-xl border p-2 shadow-sm transition hover:z-20 hover:-translate-y-0.5 hover:shadow-md ${type} ${item.is_cancelled ? "schedule-cancelled" : ""} ${item.is_makeup ? "opacity-60" : ""}`}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 24%, var(--card)), color-mix(in srgb, ${accent} 10%, var(--card)))`,
        border: `1px solid color-mix(in srgb, ${typeColor} 42%, var(--border))`,
        borderLeft: `4px ${item.is_makeup ? "dashed" : "solid"} ${accent}`,
        boxShadow: `inset 0 3px 0 ${typeColor}66, 0 1px 3px rgba(15,23,42,.08)`,
        top,
        height,
        minHeight: height,
        left: `calc(${leftPct}% + ${gap}px)`,
        width: `calc(${widthPct}% - ${gap * 2}px)`,
        zIndex: 4 + col,
      }}
      title={[
        subject,
        `${formatMinutes(start)}–${formatMinutes(end)}`,
        typeLabel,
        item.academic_hours ? `${item.academic_hours} ак. ч.` : null,
        parityLabel,
        item.notes,
        location,
      ].filter(Boolean).join(" · ")}
    >
      {(() => {
        const breaks = (item.breaks || [])
          .map((value: string) => breakRange(value))
          .filter(Boolean) as Array<{start:number;end:number}>;
        const points = [start, ...breaks.flatMap((b) => [b.start, b.end]), end].sort((a,b) => a-b);
        const segments: Array<{start:number;end:number;isBreak:boolean}> = [];
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          if (b <= a) continue;
          const isBreak = breaks.some((br) => br.start === a && br.end === b);
          segments.push({start:a,end:b,isBreak});
        }

        let lessonPart = 0;
        return segments.map((seg, index) => {
          const topPct = ((seg.start - start) / Math.max(1, end - start)) * 100;
          const heightPct = ((seg.end - seg.start) / Math.max(1, end - start)) * 100;

          if (seg.isBreak) {
            return (
              <div
                key={"segment-break-" + index}
                className="absolute left-0 right-0 z-10 flex items-center justify-center border-y border-dashed border-slate-400/50 bg-slate-100/90 text-[9px] font-bold text-slate-600"
                style={{top: topPct + "%", height: heightPct + "%"}}
              >
                Перерыв · {formatMinutes(seg.start)}–{formatMinutes(seg.end)}
              </div>
            );
          }

          lessonPart++;
          const label = lessonPart > 1 ? `${subject} · продолжение` : subject;

          return (
            <div
              key={"segment-lesson-" + index}
              className="absolute left-0 right-0 overflow-hidden px-2 py-1.5"
              style={{top: topPct + "%", height: heightPct + "%"}}
            >
              <div className={`line-clamp-2 text-[12px] font-bold leading-tight sm:text-[13px] ${item.is_cancelled ? "line-through" : ""}`}>
                {label}
              </div>

              <div className="mt-0.5 text-[10px] font-semibold opacity-75">
                {formatMinutes(seg.start)}–{formatMinutes(seg.end)}
              </div>

              {lessonPart === 1 && (
                <div className="mt-1 space-y-0.5 text-[9px] font-semibold leading-tight opacity-75">
                  <div className="truncate">
                    {item.is_makeup ? "ОТРАБОТКА" : typeLabel}
                    {!item.is_makeup ? "" : ` · ${typeLabel}`}
                    {item.academic_hours ? ` · ${item.academic_hours} ак. ч.` : ""}
                    {parityLabel ? ` · ${parityLabel}` : ""}
                  </div>
                  {item.notes && height >= 130 && (
                    <div className="line-clamp-2 font-medium">
                      {item.notes}
                    </div>
                  )}
                  {location && cols === 1 && height >= 120 && (
                    <div className="truncate">
                      <MapPin className="mr-0.5 inline h-2.5 w-2.5" />
                      {location}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        });
      })()}

      {item.is_makeup && <div className="absolute right-2 top-1 z-20 rounded bg-white/80 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide" style={{color:accent}}>Отработка</div>}
      {attendance && <div className="absolute bottom-1 right-1 z-20 rounded-full bg-white/85 px-1.5 py-0.5 text-[8px] font-bold">{attendanceLabel(attendance)}</div>}
      {item.is_cancelled && <div className="absolute right-2 top-1 z-20 text-[9px] font-bold">ОТМЕНЕНО</div>}
    </article>
  );
}

/**
 * D9: совокупный результат загрузки страницы расписания — расписание, мета
 * (периоды) и planner (ДЗ/проработка) одним объектом.
 */
type ScheduleBundle = {
  items: ScheduleItem[];
  source: string;
  meta: ScheduleMeta;
  homeworks: any[];
  recovery: any[];
  message: string | null;
};

export default function SchedulePage() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => nowParts());
  const [weekStart, setWeekStart] = useState(() => startOfWeekYmd(nowParts().date));
  const [view, setView] = useState<"day"|"week"|"month"|"semester">("week");
  const [selectedDay, setSelectedDay] = useState(() => nowParts().date);
  // C10: панель дней помнит скролл между переключениями (sessionStorage).
  const dayScrollRef = useRef<HTMLDivElement | null>(null);
  const dayScrollKey = "mb_schedule_days_scroll";
  useEffect(() => {
    const saved = Number(sessionStorage.getItem(dayScrollKey) || 0);
    const element = dayScrollRef.current;
    if (saved > 0 && element) element.scrollTop = saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function rememberDayScroll() {
    const top = dayScrollRef.current?.scrollTop || 0;
    if (top > 0) sessionStorage.setItem(dayScrollKey, String(top));
  }
  const [monthStart, setMonthStart] = useState(() => monthStartYmd(nowParts().date));
  const [allItems, setAllItems] = useState<ScheduleItem[]>([]);
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [recovery, setRecovery] = useState<any[]>([]);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [source, setSource] = useState("db");
  const [error, setError] = useState<string|null>(null);
  const [selected, setSelected] = useState<ScheduleItem|null>(null);
  const [lesson, setLesson] = useState<SubjectPlanWeek|null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonWeeks, setLessonWeeks] = useState<SubjectPlanWeek[]>([]);
  const [meta, setMeta] = useState<ScheduleMeta>({ periods: [], duration_rules: [] });
  const [homeworkOpenId, setHomeworkOpenId] = useState<string|null>(null);
  const [homeworkAnswer, setHomeworkAnswer] = useState("");
  const [homeworkBusy, setHomeworkBusy] = useState<string|null>(null);
  const [addHomeworkOpen, setAddHomeworkOpen] = useState(false);
  const [smartPasteText, setSmartPasteText] = useState("");
  const [smartPasteOpen, setSmartPasteOpen] = useState(false);
  const [smartPasteBusy, setSmartPasteBusy] = useState(false);
  const [smartPasteNote, setSmartPasteNote] = useState<string | null>(null);
  const smartPasteAppliedRef = useRef<string | null>(null);
  const [addHomeworkTitle, setAddHomeworkTitle] = useState("");
  const [addHomeworkDescription, setAddHomeworkDescription] = useState("");
  const [addHomeworkFiles, setAddHomeworkFiles] = useState<File[]>([]);

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
  const { data: scheduleBundle, loading, error: loadError } = useApiRequest<ScheduleBundle | null>(
    async (signal) => {
      if (!hasToken()) return null;
      const [res, metaRes, plannerRes] = await Promise.all([
        listSchedule(SEMESTER_FROM, SEMESTER_TO, user?.groupId, { signal }),
        getScheduleMeta(user?.course, user?.semester, { signal }),
        getStudentPlanner(SEMESTER_FROM, SEMESTER_TO, user?.groupId, { signal }),
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
      let meta: ScheduleMeta = { periods: [], duration_rules: [] };
      if (metaRes.ok && metaRes.data) {
        const raw = metaRes.data as Partial<{ periods: unknown; duration_rules: unknown }> & Record<string, unknown>;
        meta = {
          ...raw,
          periods: Array.isArray(raw.periods) ? raw.periods : [],
          duration_rules: Array.isArray(raw.duration_rules) ? raw.duration_rules : [],
        } as ScheduleMeta;
      }
      let homeworks: any[] = [];
      let recovery: any[] = [];
      if (plannerRes.ok) {
        homeworks = Array.isArray(plannerRes.data.homeworks) ? plannerRes.data.homeworks : [];
        recovery = Array.isArray(plannerRes.data.recovery) ? plannerRes.data.recovery : [];
        const byEntry = new Map<string, string>();
        for (const a of (plannerRes.data.attendance || [])) byEntry.set(String(a.schedule_entry_id), String(a.status));
        items = items.map((it) => ({ ...it, attendance_status: byEntry.get(String(it.id)) || it.attendance_status }));
      }
      return { items, source, meta, homeworks, recovery, message };
    },
    [user?.groupId, user?.course, user?.semester]
  );

  useEffect(() => {
    if (!scheduleBundle) return;
    setAllItems(scheduleBundle.items);
    setSource(scheduleBundle.source);
    setMeta(scheduleBundle.meta);
    setHomeworks(scheduleBundle.homeworks);
    setRecovery(scheduleBundle.recovery);
    setError(scheduleBundle.message);
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
    [allItems, weekStart, weekEnd]
  );

  async function setAttendance(item: ScheduleItem, status:"present"|"excused"|"sick"|"unexcused") {
    setAttendanceBusy(true);
    const r=await markAttendance(String(item.id),status,undefined,user?.groupId);
    setAttendanceBusy(false);
    if(r.ok) setAllItems(prev=>prev.map(it=>String(it.id)===String(item.id)?{...it,attendance_status:status}:it));
    else setError(describeApiError(r.error));
  }

  const selectedHomeworks = useMemo(() => {
    if (!selected) return [];
    return homeworks.filter((h:any) => {
      if (h.schedule_entry_id) return String(h.schedule_entry_id) === String(selected.id);
      return String(h.due_date || h.due_at?.slice(0,10) || "") === String(selected.date)
        && (!selected.subject_id || String(h.subject_id || "") === String(selected.subject_id));
    });
  }, [homeworks, selected]);

  const canCreateHomework = Boolean(user);

  function homeworkStatus(h:any) {
    if (h.my_status === "done" || h.my_completed === true || ["submitted","graded","returned"].includes(String(h.submission_status || ""))) return "done";
    if (h.due_date && h.due_date < now.date) return "overdue";
    return "pending";
  }

  async function toggleHomework(h:any) {
    setHomeworkBusy(String(h.id));
    const done = homeworkStatus(h) !== "done";
    const r = await setHomeworkDone(String(h.id), done);
    if (r.ok) setHomeworks(prev => prev.map(x => String(x.id) === String(h.id) ? {...x, my_status: done ? "done" : "pending", my_completed: done} : x));
    else setError(describeApiError(r.error));
    setHomeworkBusy(null);
  }

  async function submitSelectedHomework(h:any, file?:File) {
    setHomeworkBusy(String(h.id));
    let fileId:string|undefined;
    if (file) {
      const targetGroupId = user?.groupId || (selected as any)?.group_id || undefined;
      const uploaded = await uploadFile(file, targetGroupId);
      if (!uploaded.ok) { setError(describeApiError(uploaded.error)); setHomeworkBusy(null); return; }
      fileId = uploaded.data.file?.id;
    }
    const r = await submitHomework(String(h.id), homeworkAnswer || undefined, fileId);
    if (r.ok) {
      setHomeworks(prev => prev.map(x => String(x.id) === String(h.id) ? {...x, my_completed:true, my_status:"done", submission_status:"submitted"} : x));
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
      title:addHomeworkTitle.trim(),
      description:addHomeworkDescription.trim() || undefined,
      subject_id:String(selected.subject_id),
      due_date:String(selected.date),
      group_id:(user?.groupId || (selected as any)?.group_id || undefined),
      schedule_entry_id:String(selected.id),
      attachment_file_ids:attachmentFileIds,
    });
    if (r.ok) {
      setAddHomeworkTitle("");
      setAddHomeworkDescription("");
      setAddHomeworkFiles([]);
      setAddHomeworkOpen(false);
      const refreshed = await getStudentPlanner(SEMESTER_FROM, SEMESTER_TO, user?.groupId);
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

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <p style={{ color: "var(--muted)" }}>Войдите, чтобы видеть расписание</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const grouped = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    if (!item.date) continue;
    grouped.set(item.date, [...(grouped.get(item.date) || []), item]);
  }
  grouped.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));

  const today = now.date;
  const first = allItems[0] || items[0];
  const course = user?.course ?? first?.course_number ?? null;
  const semester = first?.semester ?? user?.semester ?? null;
  const groupName = user?.groupName || first?.group_name || first?.group_code || "Учебная группа не назначена";
  const groupMissing = !user?.groupName && allItems.length === 0;
  const currentDayItems = grouped.get(selectedDay) || [];
  const monthDays = monthGridDays(monthStart);
  const monthItems = allItems.filter((it) => it.date?.startsWith(monthStart.slice(0,7)));
  const semesterWeeks = Array.from({ length: 21 }, (_, i) => { const start = addDaysYmd(SEMESTER_FROM, i * 7); const end = addDaysYmd(start, 6); const weekItems = allItems.filter((it) => it.date >= start && it.date <= end); return { index:i+1, start, end, items:weekItems }; });
  const showNowLine = now.minutes >= GRID_START_MIN && now.minutes <= 18 * 60 + 30;
  const nowTop = (now.minutes - GRID_START_MIN) * PX_PER_MIN;
  const weekCount = items.length;
  const totalCount = allItems.length;
  const periods = Array.isArray(meta?.periods) ? meta.periods : [];
  const activePeriod = periods.find((p: any) => p.start_date <= weekEnd && (!p.end_date || p.end_date >= weekStart));

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{__html:`
        .schedule-now-line{position:absolute;left:0;right:0;height:0;border-top:2px solid #f43f5e;z-index:30;pointer-events:none}
        .schedule-now-dot{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:999px;background:#f43f5e;box-shadow:0 0 0 3px rgba(244,63,94,.25)}
        .schedule-now-label{position:absolute;left:8px;top:-11px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;background:#f43f5e;color:#fff}
      `}} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6" style={{ color: "var(--primary)" }} />
            <h1 className="page-title">Расписание</h1>
          </div>
          <p className="page-subtitle">{groupName}{course != null ? ` · ${course} курс` : ""}{semester != null ? ` · семестр ${semester}` : ""} · 2026/2027</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
              <Database className="h-3.5 w-3.5" /> {source === "db" ? "база данных" : source === "local" ? "резервные данные" : source} · {totalCount} занятий за семестр
            </div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
              <Clock className="h-3.5 w-3.5" /> Хабаровск · {now.timeLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => { const next=addDaysYmd(d,-7); setSelectedDay(next); return next; })} aria-label="Предыдущая неделя"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="schedule-today-btn" onClick={() => { const t=nowParts().date; setSelectedDay(t); setWeekStart(startOfWeekYmd(t)); }}>Сегодня</button>
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => { const next=addDaysYmd(d,7); setSelectedDay(next); return next; })} aria-label="Следующая неделя"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      <IcalImportCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="schedule-tabs">
          {([["day","День"],["week","Неделя"],["month","Месяц"],["semester","Семестр"]] as const).map(([id,label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={view===id?"schedule-tab schedule-tab-active":"schedule-tab"}>{label}</button>
          ))}
        </div>
        <div className="schedule-period">{weekTitle(weekStart)} · на неделе {weekCount}</div>
        {activePeriod && <div className="w-full rounded-xl border px-3 py-2 text-xs font-semibold" style={{ background:"color-mix(in srgb,var(--primary) 7%,transparent)", color:"var(--primary)" }}>{activePeriod.title}: {activePeriod.start_date}{activePeriod.end_date ? ` — ${activePeriod.end_date}` : ""}</div>}
      </div>

      {recovery.length>0 && (
        <section className="rounded-2xl border p-4" style={{background:"color-mix(in srgb,var(--primary) 4%,var(--card))"}}>
          <div className="mb-3 flex items-center justify-between gap-3"><div><b>Что нужно подтянуть</b><p className="text-xs opacity-60">Учитываются пропуски и невыполненные ДЗ по предметам.</p></div><span className="rounded-full px-2 py-1 text-xs font-bold">{recovery.length} предмета</span></div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {recovery.slice(0,6).map((r:any)=><div key={r.subject_name} className="rounded-xl border bg-white/60 p-3">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{background:subjectColor(r)}}/><b>{r.subject_name}</b></div>
              <div className="mt-1 text-xs opacity-70">{r.unexcused||0} неуваж. · {(r.excused||0)+(r.sick||0)} уваж. · {r.homeworks_pending||0} ДЗ не закрыто</div>
            </div>)}
          </div>
        </section>
      )}

      {groupMissing && !loading && (
        <div className="schedule-config-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div><b>Учебная группа не назначена.</b><p>CMS → Пользователи: назначьте учебную группу. Расписание без подтверждённой группы не подставляется автоматически.</p></div>
        </div>
      )}
      {displayError && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb,var(--danger) 10%,transparent)", color: "var(--danger)" }}>{displayError}</div>}

      {loading ? <SkeletonCards count={4} /> : (
        <>
          {view === "week" && (
            <div className="space-y-3">
              {meta.periods.length > 0 && <div className="flex flex-wrap gap-2">{meta.periods.map((p: any) => <div key={p.id} className="rounded-xl border px-3 py-2 text-xs" title={p.notes || ""}><b>{p.title}</b> · {p.start_date}{p.end_date ? ` — ${p.end_date}` : ""}</div>)}</div>}
            <div className="schedule-shell">
              <div className="schedule-scroll">
                <div className="schedule-grid" style={{ minWidth: 1080 }}>
                  <div className="schedule-corner"><Clock className="h-4 w-4" /></div>
                  {days.map(({ key }, dayIndex) => (
                    <div key={key} style={{gridColumn:dayIndex+2,gridRow:1}} className={`schedule-day-head ${key===today?"schedule-day-today":""}`}>
                      <div>{weekdayShortRu(key)}</div>
                      <strong>{dayDateRu(key)}</strong>
                      {key===today && <span>Сегодня</span>}
                      <div className="mt-1 space-y-0.5 text-left">{homeworks.filter((h:any)=>h.due_date===key).slice(0,2).map((h:any)=><div key={h.id} className="truncate rounded bg-white/70 px-1.5 py-0.5 text-[8px] font-semibold" title={h.title}>ДЗ: {h.title}{h.my_status==="done"?" ✓":""}</div>)}{homeworks.filter((h:any)=>h.due_date===key).length>2&&<div className="text-[8px] opacity-60">+ ещё {homeworks.filter((h:any)=>h.due_date===key).length-2} ДЗ</div>}</div>
                    </div>
                  ))}
                  <div className="schedule-times" style={{gridColumn:1,gridRow:2}}>{SLOTS.map((t)=><div key={t} className="schedule-time">{t}</div>)}</div>
                  {days.map(({ key }, dayIndex) => (
                    <div key={key} style={{gridColumn:dayIndex+2,gridRow:2}} className="schedule-day-column relative">
                      {SLOTS.map((t)=><div key={t} className="schedule-hour-line" />)}
                      {layoutDayColumns(grouped.get(key)||[]).map(({ item, col, cols })=>(
                        <ScheduleCard
                          key={String(item.id ?? `${item.date}-${item.start_time}-${item.subject_name}-${col}`)}
                          item={item}
                          col={col}
                          cols={cols}
                          onOpen={openLesson}
                        />
                      ))}
                      {key===today && showNowLine && (
                        <div className="schedule-now-line" style={{ top: nowTop }} aria-label={`Сейчас ${now.timeLabel}`}>
                          <span className="schedule-now-dot" /><span className="schedule-now-label">{now.timeLabel}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {weekCount===0 && (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="На эту неделю занятий нет"
                  description={`В семестре загружено ${totalCount}. Листайте ← →, откройте «Месяц» или «Семестр».`}
                />
              )}
            </div>
            </div>
          )}

          {view === "day" && (
            <div className="space-y-3">
              <div className="schedule-day-picker" ref={dayScrollRef} onScroll={rememberDayScroll}>
                {days.map(({ key }) => (
                  <button key={key} type="button" className={key===today?"schedule-day-pill schedule-day-pill-active":"schedule-day-pill"} onClick={()=>{setSelectedDay(key);setWeekStart(startOfWeekYmd(key));setView("day")}}>
                    <span>{weekdayShortRu(key)}</span><b>{dayDateRu(key)}</b>
                  </button>
                ))}
              </div>
              <div className="card divide-y overflow-hidden p-0">
                {currentDayItems.length===0 ? (
                  <EmptyState
                    compact
                    icon={CalendarDays}
                    title="На сегодня занятий нет"
                    description="Выберите другой день pill-кнопками выше или проверьте «Неделю» и «Месяц»."
                  />
                ) : currentDayItems.map((item)=>(
                  <button key={item.id||item.start_time} type="button" className="flex w-full gap-4 p-4 text-left hover:bg-black/5" onClick={()=>openLesson(item)}>
                    <div className="w-24 shrink-0 text-sm font-semibold" style={{ color: "var(--primary)" }}>{item.start_time.slice(0,5)}–{item.end_time.slice(0,5)}</div>
                    <div>
                      <div className="font-bold" style={{borderLeft:`3px solid ${subjectColor(item)}`,paddingLeft:8}}>{item.subject_name||"Занятие"}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{item.is_makeup?"ОТРАБОТКА":TYPE_LABELS[item.type || ""]||item.type} · {attendanceLabel(item.attendance_status) || "отметьте посещение"}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "month" && (
            <section className="schedule-month-shell">
              <div className="schedule-view-toolbar">
                <div>
                  <div className="schedule-view-kicker"><CalendarDays className="h-4 w-4" /> Календарь месяца</div>
                  <h2 className="schedule-view-title">{monthTitle(monthStart)}</h2>
                  <p className="schedule-view-subtitle">{monthItems.length} занятий · нажмите на день для подробностей</p>
                </div>
                <div className="schedule-toolbar-actions">
                  <button type="button" className="schedule-icon-btn" onClick={()=>setMonthStart((d)=>addMonthsYmd(d,-1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4"/></button>
                  <button type="button" className="schedule-today-btn" onClick={()=>{const t=nowParts().date;setMonthStart(monthStartYmd(t));setSelectedDay(t)}}>Сегодня</button>
                  <button type="button" className="schedule-icon-btn" onClick={()=>setMonthStart((d)=>addMonthsYmd(d,1))} aria-label="Следующий месяц"><ChevronRight className="h-4 w-4"/></button>
                </div>
              </div>
              <div className="schedule-month-layout">
                <div className="schedule-month-grid">
                  {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d)=><div key={d} className="schedule-month-weekday">{d}</div>)}
                  {monthDays.map((day)=>{
                    const inMonth=day.startsWith(monthStart.slice(0,7));
                    const dayItems=allItems.filter((it)=>it.date===day).sort((a,b)=>a.start_time.localeCompare(b.start_time));
                    const isToday=day===today;
                    const isSelected=day===selectedDay;
                    return (
                      <button key={day} type="button" onClick={()=>setSelectedDay(day)} className={`schedule-month-cell ${inMonth?"":"schedule-month-cell-muted"} ${isToday?"schedule-month-cell-today":""} ${isSelected?"schedule-month-cell-selected":""}`}>
                        <div className="schedule-month-cell-head"><span className="schedule-month-day-number">{parseYmd(day).d}</span>{dayItems.length>0&&<span className="schedule-month-count">{dayItems.length}</span>}</div>
                        <div className="schedule-month-events">
                          {dayItems.slice(0,3).map((it)=><span key={it.id||`${day}-${it.start_time}-${it.subject_name}`} className={`schedule-mini-event schedule-mini-${subjectColorKey(it.type)}`}><b>{it.start_time.slice(0,5)}</b> <span>{it.subject_name||"Занятие"}</span></span>)}
                          {dayItems.length>3&&<span className="schedule-more">+ ещё {dayItems.length-3}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <aside className="schedule-month-side">
                  <div className="schedule-side-label"><Target className="h-4 w-4"/> Выбранный день</div>
                  <div className="schedule-side-date">{dateLabelRu(selectedDay)}</div>
                  {selectedDay===today&&<span className="schedule-current-pill"><span/>Сегодня</span>}
                  <div className="schedule-side-summary"><b>{currentDayItems.length}</b><span>{currentDayItems.length===1?"занятие":currentDayItems.length>=2&&currentDayItems.length<=4?"занятия":"занятий"}</span></div>
                  <div className="schedule-side-list">
                    {currentDayItems.length===0?<div className="schedule-empty"><CalendarDays className="h-5 w-5"/><span>Свободный день</span></div>:currentDayItems.map((it)=>
                      <button key={it.id||`${it.start_time}-${it.subject_name}`} type="button" className={`schedule-side-item schedule-side-${subjectColorKey(it.type)}`} onClick={()=>openLesson(it)}>
                        <div className="schedule-side-time">{it.start_time.slice(0,5)}–{it.end_time.slice(0,5)}</div>
                        <div className="schedule-side-subject">{it.subject_name||"Занятие"}</div>
                        <div className="schedule-side-meta">{TYPE_LABELS[it.type || ""]||it.type}{it.room?` · Ауд. ${it.room}`:""}</div>
                      </button>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          )}
          {view === "semester" && (
            <section className="schedule-semester-shell">
              <div className="schedule-view-toolbar">
                <div>
                  <div className="schedule-view-kicker"><GraduationCap className="h-4 w-4" /> Учебный ритм</div>
                  <h2 className="schedule-view-title">Семестр 2026/2027</h2>
                  <p className="schedule-view-subtitle">Теоретическое обучение · 01.09.2026 — 21.01.2027 · {totalCount} занятий</p>
                </div>
                <div className="schedule-semester-status"><CheckCircle2 className="h-4 w-4"/> {activePeriod?.title||"Текущий учебный блок"}</div>
              </div>
              <div className="schedule-semester-metrics">
                <div className="schedule-semester-metric"><span className="metric-icon metric-blue"><CalendarDays/></span><div><b>{semesterWeeks.filter(w=>w.items.length>0).length}</b><small>активных недель</small></div></div>
                <div className="schedule-semester-metric"><span className="metric-icon metric-green"><CheckCircle2/></span><div><b>{allItems.filter(it=>it.date<today).length}</b><small>занятий прошло</small></div></div>
                <div className="schedule-semester-metric"><span className="metric-icon metric-violet"><Layers3/></span><div><b>{new Set(allItems.map(it=>it.subject_name).filter(Boolean)).size}</b><small>дисциплин</small></div></div>
                <div className="schedule-semester-metric"><span className="metric-icon metric-amber"><Clock/></span><div><b>{allItems.reduce((sum,it)=>sum+(Number(it.academic_hours)||0),0)}</b><small>акад. часов</small></div></div>
              </div>
              <div className="schedule-semester-progress">
                <div className="schedule-semester-progress-top"><b>Прогресс семестра</b><span>Неделя {Math.min(21,Math.max(1,Math.floor(Math.max(0,(new Date(today+"T12:00:00").getTime()-new Date(SEMESTER_FROM+"T12:00:00").getTime())/86400000)/7)+1))} из 21</span></div>
                <div className="schedule-semester-progress-track"><div className="schedule-semester-progress-fill" style={{width:`${Math.min(100,Math.max(0,((new Date(today+"T12:00:00").getTime()-new Date(SEMESTER_FROM+"T12:00:00").getTime())/(new Date(SEMESTER_TO+"T12:00:00").getTime()-new Date(SEMESTER_FROM+"T12:00:00").getTime()))*100))}%`}}/></div>
                <div className="schedule-semester-progress-scale"><span>1 сен</span><span>Экватор · 10 нед.</span><span>Зачётная · 19 нед.</span><span>21 янв</span></div>
              </div>
              <div className="schedule-semester-timeline">
                {semesterWeeks.map((w)=>{
                  const isCurrent=today>=w.start&&today<=w.end; const isPast=w.end<today; const preview=w.items.slice(0,4);
                  return <button key={w.index} type="button" onClick={()=>{setWeekStart(startOfWeekYmd(w.start));setView("week")}} className={`schedule-semester-week ${isCurrent?"current":""} ${isPast?"past":""}`}>
                    <div className="schedule-semester-week-head"><span className="schedule-week-no">Неделя {w.index}</span><span>{shortDateRu(w.start)} — {shortDateRu(w.end)}</span></div>
                    <div className="schedule-semester-week-track"><span className="schedule-week-fill" style={{width:`${Math.min(100,Math.max(12,w.items.length*9))}%`}}/></div>
                    <div className="schedule-semester-week-info"><b>{w.items.length}</b><span>занятий</span><div className="schedule-week-subjects">{preview.map((it,i)=><span key={i}>{it.subject_name}</span>)}{w.items.length>4&&<span>+{w.items.length-4}</span>}</div></div>
                  </button>;
                })}
              </div>
            </section>
          )}
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={()=>setSelected(null)}>
          <div className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5 shadow-xl" onClick={(e)=>e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{TYPE_LABELS[selected.type || ""]||selected.type}</div>
                <h2 className="text-xl font-bold">{selected.subject_name}</h2>
                <p className="text-sm opacity-70">{selected.date} · {selected.start_time.slice(0,5)}–{selected.end_time.slice(0,5)} · Хабаровск</p>
              </div>
              <button type="button" className="rounded-lg p-2 hover:bg-black/5" onClick={()=>{setSelected(null);setAddHomeworkOpen(false);setAddHomeworkFiles([])}} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </div>


            <section className="mt-4 rounded-2xl border p-4" style={{background:"color-mix(in srgb,var(--primary) 4%,var(--card))"}}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><div className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4" style={{color:"var(--primary)"}}/> ДЗ по этому занятию</div><p className="mt-0.5 text-xs opacity-60">Дата и предмет уже выбраны: {selected.date} · {selected.subject_name}</p></div>
                {canCreateHomework && selected.subject_id && <button type="button" onClick={()=>setAddHomeworkOpen(v=>!v)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><Plus className="mr-1 inline h-3.5 w-3.5"/>Добавить ДЗ</button>}
              </div>
              {addHomeworkOpen && canCreateHomework && <div className="mb-3 space-y-2 rounded-xl border bg-[var(--card)] p-3">
                <div className="rounded-lg bg-black/5 px-3 py-2 text-xs font-semibold">Привязка к занятию: {selected.date} · {selected.subject_name} · {selected.start_time.slice(0,5)}–{selected.end_time.slice(0,5)}</div>
                <input value={addHomeworkTitle} onChange={e=>setAddHomeworkTitle(e.target.value)} placeholder="Что задать" className="w-full rounded-lg border px-3 py-2 text-sm"/>
                <textarea value={addHomeworkDescription} onChange={e=>setAddHomeworkDescription(e.target.value)} rows={2} placeholder="Страницы, номера, требования..." className="w-full rounded-lg border px-3 py-2 text-sm"/>
                <div className="rounded-lg border border-dashed p-2">
                  <button type="button" onClick={()=>setSmartPasteOpen(v=>!v)} aria-expanded={smartPasteOpen} className="text-xs font-semibold text-indigo-700">Умная вставка из чата</button>
                  {smartPasteOpen && <div className="mt-2 space-y-2">
                    <textarea value={smartPasteText} onChange={e=>setSmartPasteText(e.target.value)} rows={3} maxLength={10000} placeholder="Вставьте текст из чата группы: «Дз на 02.10. Тема: Эмбриология. 1. Лекцию учим. 2. Написать файлик…»" className="w-full rounded-lg border px-3 py-2 text-sm"/>
                    <button type="button" disabled={smartPasteBusy || !smartPasteText.trim()} onClick={()=>void applySmartPaste()} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{smartPasteBusy?"Разбор…":"Разобрать текст"}</button>
                    {smartPasteNote && <p className="text-xs" style={{ color: smartPasteNote.startsWith("Распознано") ? "var(--status-ok-fg)" : "var(--status-critical-fg)" }}>{smartPasteNote}</p>}
                  </div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold"><Upload className="mr-1 inline h-3.5 w-3.5"/>Добавить фото
                    <input type="file" accept="image/*" multiple className="hidden" onChange={e=>{const next=Array.from(e.target.files||[]).filter(f=>f.type.startsWith("image/"));setAddHomeworkFiles(prev=>[...prev,...next].slice(0,12));e.currentTarget.value="";}}/>
                  </label>
                  {addHomeworkFiles.length>0 && <span className="text-xs opacity-60">{addHomeworkFiles.length}/12 фото</span>}
                </div>
                {addHomeworkFiles.length>0 && <div className="space-y-1">
                  {addHomeworkFiles.map((file,index)=><div key={file.name+"-"+file.size+"-"+index} className="flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-1.5 text-xs"><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" className="rounded p-1 hover:bg-black/10" onClick={()=>setAddHomeworkFiles(prev=>prev.filter((_,i)=>i!==index))} aria-label={`Удалить ${file.name}`}><X className="h-3.5 w-3.5"/></button></div>)}
                </div>}
                <button type="button" disabled={homeworkBusy==="add"} onClick={()=>void addHomeworkForSelected()} className="btn-primary w-full">{homeworkBusy==="add"?"Сохранение…":"Добавить ДЗ к этому занятию"}</button>
              </div>}
              {selectedHomeworks.length===0 ? <div className="rounded-xl border border-dashed p-4 text-center text-sm opacity-60">На это занятие ДЗ пока нет.</div> : <div className="space-y-2">
                {selectedHomeworks.map((h:any)=>{const hs=homeworkStatus(h);return <article key={h.id} className="rounded-xl border bg-[var(--card)] p-3"><div className="flex items-start gap-2"><button type="button" disabled={homeworkBusy===String(h.id)} onClick={()=>void toggleHomework(h)} className={hs==="done"?"mt-0.5 text-[var(--status-ok-fg)]":"mt-0.5 text-slate-300"}><CheckCircle2 className="h-5 w-5"/></button><div className="min-w-0 flex-1"><b className={hs==="done"?"line-through opacity-60":""}>{h.title}</b><div className="mt-1 text-xs opacity-60">{h.subject_name || selected.subject_name}{hs==="overdue"?" · просрочено":""}</div></div></div>{h.description && <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{h.description}</p>}
                {<HomeworkGrade homework={h}/>}
                {Array.isArray(h.attachments) && h.attachments.length>0 && <div className="mt-3 grid grid-cols-2 gap-2">
                  {h.attachments.map((att:any,index:number)=>{
                    const image=String(att.mime_type||"").startsWith("image/");
                    const href=String(att.download_url||"");
                    return image && href
                      ? <a key={att.file_id||index} href={href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border" title={att.name||"Фото ДЗ"}><img src={href} alt={att.name||"Фото ДЗ"} className="h-28 w-full object-cover"/></a>
                      : href
                        ? <a key={att.file_id||index} href={href} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-xs font-semibold">{att.name||"Файл ДЗ"}</a>
                        : <div key={att.file_id||index} className="rounded-lg border px-3 py-2 text-xs opacity-60">{att.name||"Файл ДЗ"}</div>;
                  })}
                </div>}<div className="mt-2 flex flex-wrap gap-2">{hs!=="done" && <button type="button" disabled={homeworkBusy===String(h.id)} onClick={()=>void toggleHomework(h)} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white">{homeworkBusy===String(h.id)?<Loader2 className="inline h-3 w-3 animate-spin"/>:"Выполнено"}</button>}<button type="button" onClick={()=>setHomeworkOpenId(homeworkOpenId===String(h.id)?null:String(h.id))} className="rounded-lg border px-3 py-1.5 text-xs">{homeworkOpenId===String(h.id)?"Скрыть":"Записать ответ"}</button></div>{homeworkOpenId===String(h.id) && <div className="mt-3 space-y-2 border-t pt-3"><textarea value={homeworkAnswer} onChange={e=>setHomeworkAnswer(e.target.value)} rows={3} placeholder="Ответ, решение, комментарий..." className="w-full rounded-lg border px-3 py-2 text-sm"/><div className="flex flex-wrap gap-2"><label className="cursor-pointer rounded-lg border px-3 py-2 text-xs"><Upload className="mr-1 inline h-3.5 w-3.5"/>Файл<input type="file" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void submitSelectedHomework(h,f)}}/></label><button type="button" disabled={homeworkBusy===String(h.id)} onClick={()=>void submitSelectedHomework(h)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white">Сохранить ответ</button></div></div>}</article>})}
              </div>}
            </section>

            {lessonLoading ? (
              <SkeletonText lines={2} />
            ) : lesson ? (
              <div className="space-y-3 text-sm">
                {lesson.lecture && (
                  <div className="rounded-xl border p-3">
                    <div className="mb-1 flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" /> Лекция / тема</div>
                    <p>{lesson.lecture}</p>
                  </div>
                )}
                {lesson.practice && (
                  <div className="rounded-xl border p-3">
                    <div className="mb-1 font-semibold">Практика / лаборатория</div>
                    <p>{lesson.practice}</p>
                  </div>
                )}
                {(lesson as {lab_detail?:string}).lab_detail && (
                  <div className="rounded-xl border p-3">
                    <div className="mb-1 font-semibold">Содержание занятия</div>
                    <p className="whitespace-pre-wrap opacity-90">{(lesson as {lab_detail?:string}).lab_detail}</p>
                  </div>
                )}
                {lesson.control && (
                  <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-[var(--status-warn-fg)]">
                    <div className="mb-1 font-semibold">Контроль</div>
                    <p>{lesson.control}</p>
                  </div>
                )}
                {Array.isArray(lesson.study) && lesson.study.length>0 && (
                  <div className="rounded-xl border p-3">
                    <div className="mb-1 font-semibold">Что изучать / детали</div>
                    <ul className="list-disc space-y-1 pl-4">{lesson.study.map((s: any,i: number)=><li key={i}>{s}</li>)}</ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm opacity-70">
                Тема занятия в плане не найдена для «{selected.subject_name}» на {selected.date}.
                Добавьте/исправьте план в CMS → Учебный план / subject plans.
              </div>
            )}

            {lessonWeeks.length>1 && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase opacity-50">Другие темы предмета</div>
                <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {lessonWeeks.slice(0,12).map((w,i)=>(
                    <div key={i} className="rounded-lg bg-black/5 px-2 py-1">{w.date}: {(w.lecture||w.practice||"").slice(0,80)}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 grid gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2">
              {selected.teacher && <div><b>Преподаватель:</b> {selected.teacher}</div>}
              {selected.academic_hours && <div><b>Академическая нагрузка:</b> {selected.academic_hours} ак. ч.</div>}
              {selected.week_parity && <div><b>Чередование:</b> {selected.week_parity === "numerator" ? "числитель" : selected.week_parity === "denominator" ? "знаменатель" : "все недели"}</div>}
              {selected.source_detail && <div className="sm:col-span-2"><b>Источник/уточнение:</b> {selected.source_detail}</div>}
              {selected.is_makeup && <div className="sm:col-span-2 font-semibold text-[var(--status-warn-fg)]">Отработка — это не обычное занятие</div>}
            <div className="sm:col-span-2">
              <div className="mb-1 font-semibold">
                Посещение
                <span className="ml-2 rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 align-middle text-[10px] font-semibold text-[var(--status-warn-fg)]" title="Отметку ставит сам студент; преподаватель её не подтверждает">
                  самоотчёт
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {([["present", "Был"], ["excused", "Уважительная"], ["sick", "Болезнь"], ["unexcused", "Пропуск"]] as const).map(([status, label]) => (
                  <button key={status} type="button" disabled={attendanceBusy} aria-pressed={selected.attendance_status === status} onClick={() => void setAttendance(selected, status)} className="rounded-lg border px-2 py-1 disabled:opacity-50" style={selected.attendance_status === status ? { borderColor: "var(--primary)", color: "var(--primary)" } : undefined}>{label}</button>
                ))}
              </div>
            </div>
            </div>

            {(selected.room||selected.notes) && (
              <div className="mt-3 text-xs opacity-60">
                {[selected.building,selected.room].filter(Boolean).join(", ")}
                {selected.notes ? ` · ${selected.notes}` : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
