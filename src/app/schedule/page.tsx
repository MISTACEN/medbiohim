"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Database, AlertTriangle, X, BookOpen, GraduationCap, CheckCircle2, Target, Layers3, ClipboardList, Plus, Upload, Loader2,
} from "lucide-react";
import Link from "next/link";
import { listSchedule, getScheduleMeta, getStudentPlanner, markAttendance, hasToken, getLessonPlan, setHomeworkDone, submitHomework, uploadFile, createHomework, type ScheduleItem, type SubjectPlanWeek, type ScheduleMeta } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";

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
function attendanceLabel(status?:string){return status==="present"?"Был":status==="excused"?"Уважительная":status==="sick"?"Болезнь":status==="unexcused"?"Пропуск":"";}

function nowParts() {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const raw = Object.fromEntries(dtf.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const year = Number(raw.year), month = Number(raw.month), day = Number(raw.day);
  const hour = Number(raw.hour), minute = Number(raw.minute);
  const date = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return { year, month, day, hour, minute, date, minutes: hour * 60 + minute, timeLabel: `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}` };
}
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
function subjectColorKey(type: string): string {
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
  const type = TYPE_CLASS[item.type] || TYPE_CLASS.other;
  const subject = item.subject_name || "Занятие";
  const location = [item.building, item.room].filter(Boolean).join(", ");
  const typeLabel = TYPE_LABELS[item.type] || "Занятие";
  const accent = subjectColor(item);
  const typeColor = TYPE_COLORS[item.type] || TYPE_COLORS.other;
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

export default function SchedulePage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [now, setNow] = useState(() => nowParts());
  const [weekStart, setWeekStart] = useState(() => startOfWeekYmd(nowParts().date));
  const [view, setView] = useState<"day"|"week"|"month"|"semester">("week");
  const [selectedDay, setSelectedDay] = useState(() => nowParts().date);
  const [monthStart, setMonthStart] = useState(() => monthStartYmd(nowParts().date));
  const [allItems, setAllItems] = useState<ScheduleItem[]>([]);
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [recovery, setRecovery] = useState<any[]>([]);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [source, setSource] = useState("db");
  const [loading, setLoading] = useState(true);
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
  const [addHomeworkTitle, setAddHomeworkTitle] = useState("");
  const [addHomeworkDescription, setAddHomeworkDescription] = useState("");

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("day");
  }, []);

  useEffect(() => {
    const tick = () => setNow(nowParts());
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [user?.course, user?.semester]);

  useEffect(() => {
    if (!hasToken()) { setLoading(false); return; }
    setLoading(true); setError(null);
    void Promise.all([listSchedule(SEMESTER_FROM, SEMESTER_TO, user?.groupId), getScheduleMeta(user?.course, user?.semester), getStudentPlanner(SEMESTER_FROM, SEMESTER_TO, user?.groupId)]).then(([res, metaRes, plannerRes]) => {
      if (res.ok) {
        setAllItems(Array.isArray(res.data.items) ? res.data.items : []);
        const payload = res.data as { items: ScheduleItem[]; source?: string };
        setSource(payload.source || "db");
        if ((res.data.items || []).length === 0) {
          setError(
            user?.groupName
              ? "Для назначенной группы Supabase не вернул занятия. Проверьте активную версию schedules и связанные schedule_entries."
              : "Учебная группа не назначена. Назначьте её в CMS, чтобы расписание могло быть загружено."
          );
        }
      } else {
        setAllItems([]);
        setError(res.error.message || "Не удалось загрузить расписание");
      }
      if (metaRes.ok) setMeta(metaRes.data);
      if (plannerRes.ok) {
        setHomeworks(Array.isArray(plannerRes.data.homeworks) ? plannerRes.data.homeworks : []);
        setRecovery(Array.isArray(plannerRes.data.recovery) ? plannerRes.data.recovery : []);
        const byEntry=new Map<string,string>();
        for(const a of (plannerRes.data.attendance||[])) byEntry.set(String(a.schedule_entry_id),String(a.status));
        setAllItems(prev=>prev.map(it=>({...it,attendance_status:byEntry.get(String(it.id))||it.attendance_status})));
      }
      setLoading(false);
    });
  }, [user?.groupId, user?.course, user?.semester]);

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
    else setError(r.error.message);
  }

  const selectedHomeworks = useMemo(() => {
    if (!selected) return [];
    return homeworks.filter((h:any) => String(h.due_date || h.due_at?.slice(0,10) || "") === String(selected.date) && (!selected.subject_id || String(h.subject_id || "") === String(selected.subject_id)));
  }, [homeworks, selected]);

  const canManageHomework = ["admin","teacher","moderator"].includes(String(user?.role || ""));

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
    else setError(r.error.message);
    setHomeworkBusy(null);
  }

  async function submitSelectedHomework(h:any, file?:File) {
    setHomeworkBusy(String(h.id));
    let fileId:string|undefined;
    if (file) {
      const uploaded = await uploadFile(file, user?.groupId);
      if (!uploaded.ok) { setError(uploaded.error.message); setHomeworkBusy(null); return; }
      fileId = uploaded.data.file?.id;
    }
    const r = await submitHomework(String(h.id), homeworkAnswer || undefined, fileId);
    if (r.ok) {
      setHomeworks(prev => prev.map(x => String(x.id) === String(h.id) ? {...x, my_completed:true, my_status:"done", submission_status:"submitted"} : x));
      setHomeworkAnswer("");
      setHomeworkOpenId(null);
    } else setError(r.error.message);
    setHomeworkBusy(null);
  }

  async function addHomeworkForSelected() {
    if (!selected || !selected.subject_id || !addHomeworkTitle.trim()) return;
    setHomeworkBusy("add");
    const r = await createHomework({title:addHomeworkTitle.trim(),description:addHomeworkDescription.trim() || undefined,subject_id:String(selected.subject_id),due_date:String(selected.date),group_id:user?.groupId});
    if (r.ok) {
      setAddHomeworkTitle("");
      setAddHomeworkDescription("");
      setAddHomeworkOpen(false);
      const refreshed = await getStudentPlanner(SEMESTER_FROM, SEMESTER_TO, user?.groupId);
      if (refreshed.ok) setHomeworks(Array.isArray(refreshed.data.homeworks) ? refreshed.data.homeworks : []);
    } else setError(r.error.message);
    setHomeworkBusy(null);
  }

  async function openLesson(item: ScheduleItem) {
    setSelected(item);
    setLesson(null);
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
  const monthDays = useMemo(() => monthGridDays(monthStart), [monthStart]);
  const monthItems = useMemo(() => allItems.filter((it) => it.date?.startsWith(monthStart.slice(0,7))), [allItems, monthStart]);
  const semesterWeeks = useMemo(() => Array.from({ length: 21 }, (_, i) => { const start = addDaysYmd(SEMESTER_FROM, i * 7); const end = addDaysYmd(start, 6); const weekItems = allItems.filter((it) => it.date >= start && it.date <= end); return { index:i+1, start, end, items:weekItems }; }), [allItems]);
  const showNowLine = now.minutes >= GRID_START_MIN && now.minutes <= 18 * 60 + 30;
  const nowTop = (now.minutes - GRID_START_MIN) * PX_PER_MIN;
  const weekCount = items.length;
  const totalCount = allItems.length;
  const activePeriod = meta.periods.find((p: any) => p.start_date <= weekEnd && (!p.end_date || p.end_date >= weekStart));

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{__html:`
        .schedule-now-line{position:absolute;left:0;right:0;height:0;border-top:2px solid #f43f5e;z-index:30;pointer-events:none}
        .schedule-now-dot{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:999px;background:#f43f5e;box-shadow:0 0 0 3px rgba(244,63,94,.25)}
        .schedule-now-label{position:absolute;left:8px;top:-11px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;background:#f43f5e;color:#fff}
      `}} />

      {!embedded && (
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6" style={{ color: "var(--primary)" }} />
            <h1 className="page-title">Расписание</h1>
          </div>
          <p className="page-subtitle">{groupName}{course != null ? ` · ${course} курс` : ""}{semester != null ? ` · семестр ${semester}` : ""} · 2026/2027</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
              <Database className="h-3.5 w-3.5" /> {source === "db" ? "Supabase" : source === "local" ? "резервные данные" : source} · {totalCount} занятий за семестр
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
      )}

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
      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb,var(--danger) 10%,transparent)", color: "var(--danger)" }}>{error}</div>}

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
                <p className="p-4 text-center text-sm" style={{ color: "var(--muted)" }}>
                  На эту неделю занятий нет (в семестре загружено {totalCount}). Листайте ← →, откройте «Месяц» или «Семестр».
                </p>
              )}
            </div>
            </div>
          )}

          {view === "day" && (
            <div className="space-y-3">
              <div className="schedule-day-picker">
                {days.map(({ key }) => (
                  <button key={key} type="button" className={key===today?"schedule-day-pill schedule-day-pill-active":"schedule-day-pill"} onClick={()=>{setSelectedDay(key);setWeekStart(startOfWeekYmd(key));setView("day")}}>
                    <span>{weekdayShortRu(key)}</span><b>{dayDateRu(key)}</b>
                  </button>
                ))}
              </div>
              <div className="card divide-y overflow-hidden p-0">
                {currentDayItems.length===0 ? (
                  <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>На сегодня занятий нет.</div>
                ) : currentDayItems.map((item)=>(
                  <button key={item.id||item.start_time} type="button" className="flex w-full gap-4 p-4 text-left hover:bg-black/5" onClick={()=>openLesson(item)}>
                    <div className="w-24 shrink-0 text-sm font-semibold" style={{ color: "var(--primary)" }}>{item.start_time.slice(0,5)}–{item.end_time.slice(0,5)}</div>
                    <div>
                      <div className="font-bold" style={{borderLeft:`3px solid ${subjectColor(item)}`,paddingLeft:8}}>{item.subject_name||"Занятие"}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{item.is_makeup?"ОТРАБОТКА":TYPE_LABELS[item.type]||item.type} · {attendanceLabel(item.attendance_status) || "отметьте посещение"}</div>
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
                        <div className="schedule-side-meta">{TYPE_LABELS[it.type]||it.type}{it.room?` · Ауд. ${it.room}`:""}</div>
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
                <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{TYPE_LABELS[selected.type]||selected.type}</div>
                <h2 className="text-xl font-bold">{selected.subject_name}</h2>
                <p className="text-sm opacity-70">{selected.date} · {selected.start_time.slice(0,5)}–{selected.end_time.slice(0,5)} · Хабаровск</p>
              </div>
              <button type="button" className="rounded-lg p-2 hover:bg-black/5" onClick={()=>setSelected(null)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </div>


            <section className="mt-4 rounded-2xl border p-4" style={{background:"color-mix(in srgb,var(--primary) 4%,var(--card))"}}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><div className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4" style={{color:"var(--primary)"}}/> ДЗ по этому занятию</div><p className="mt-0.5 text-xs opacity-60">Дата и предмет уже выбраны: {selected.date} · {selected.subject_name}</p></div>
                {canManageHomework && selected.subject_id && <button type="button" onClick={()=>setAddHomeworkOpen(v=>!v)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><Plus className="mr-1 inline h-3.5 w-3.5"/>Добавить ДЗ</button>}
              </div>
              {addHomeworkOpen && canManageHomework && <div className="mb-3 space-y-2 rounded-xl border bg-[var(--card)] p-3"><input value={addHomeworkTitle} onChange={e=>setAddHomeworkTitle(e.target.value)} placeholder="Что задать" className="w-full rounded-lg border px-3 py-2 text-sm"/><textarea value={addHomeworkDescription} onChange={e=>setAddHomeworkDescription(e.target.value)} rows={2} placeholder="Страницы, номера, требования..." className="w-full rounded-lg border px-3 py-2 text-sm"/><button type="button" disabled={homeworkBusy==="add"} onClick={()=>void addHomeworkForSelected()} className="btn-primary w-full">{homeworkBusy==="add"?"Сохранение…":"Добавить на этот предмет и день"}</button></div>}
              {selectedHomeworks.length===0 ? <div className="rounded-xl border border-dashed p-4 text-center text-sm opacity-60">На этот день для этого предмета ДЗ пока нет.</div> : <div className="space-y-2">
                {selectedHomeworks.map((h:any)=>{const hs=homeworkStatus(h);return <article key={h.id} className="rounded-xl border bg-[var(--card)] p-3"><div className="flex items-start gap-2"><button type="button" disabled={homeworkBusy===String(h.id)} onClick={()=>void toggleHomework(h)} className={hs==="done"?"mt-0.5 text-emerald-600":"mt-0.5 text-slate-300"}><CheckCircle2 className="h-5 w-5"/></button><div className="min-w-0 flex-1"><b className={hs==="done"?"line-through opacity-60":""}>{h.title}</b><div className="mt-1 text-xs opacity-60">{h.subject_name || selected.subject_name}{hs==="overdue"?" · просрочено":""}</div></div></div>{h.description && <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{h.description}</p>}<div className="mt-2 flex flex-wrap gap-2">{hs!=="done" && <button type="button" disabled={homeworkBusy===String(h.id)} onClick={()=>void toggleHomework(h)} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white">{homeworkBusy===String(h.id)?<Loader2 className="inline h-3 w-3 animate-spin"/>:"Выполнено"}</button>}<button type="button" onClick={()=>setHomeworkOpenId(homeworkOpenId===String(h.id)?null:String(h.id))} className="rounded-lg border px-3 py-1.5 text-xs">{homeworkOpenId===String(h.id)?"Скрыть":"Записать ответ"}</button></div>{homeworkOpenId===String(h.id) && <div className="mt-3 space-y-2 border-t pt-3"><textarea value={homeworkAnswer} onChange={e=>setHomeworkAnswer(e.target.value)} rows={3} placeholder="Ответ, решение, комментарий..." className="w-full rounded-lg border px-3 py-2 text-sm"/><div className="flex flex-wrap gap-2"><label className="cursor-pointer rounded-lg border px-3 py-2 text-xs"><Upload className="mr-1 inline h-3.5 w-3.5"/>Файл<input type="file" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void submitSelectedHomework(h,f)}}/></label><button type="button" disabled={homeworkBusy===String(h.id)} onClick={()=>void submitSelectedHomework(h)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white">Сохранить ответ</button></div></div>}</article>})}
              </div>}
            </section>

            {lessonLoading ? (
              <p className="text-sm opacity-60">Загрузка плана занятия…</p>
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
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
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
              {selected.is_makeup && <div className="sm:col-span-2 font-semibold text-amber-700">Отработка — это не обычное занятие</div>}
            {attendanceBlock}
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