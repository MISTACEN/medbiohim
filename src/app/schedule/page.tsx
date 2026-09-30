"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Database, AlertTriangle, X, BookOpen,
} from "lucide-react";
import Link from "next/link";
import { listSchedule, getScheduleMeta, hasToken, getLessonPlan, type ScheduleItem, type SubjectPlanWeek, type ScheduleMeta } from "@/lib/api";
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
function timeToMinutes(v: string) { const [h,m]=v.slice(0,5).split(":").map(Number); return h*60+m; }

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
  const height = Math.max(58, (end - start) * PX_PER_MIN);
  const type = TYPE_CLASS[item.type] || TYPE_CLASS.other;
  const subject = item.subject_name || "Занятие";
  const location = [item.building, item.room].filter(Boolean).join(", ");
  const gap = 3;
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(item); }}
      className={`schedule-card absolute cursor-pointer overflow-hidden rounded-xl border p-2 shadow-sm transition hover:z-20 hover:-translate-y-0.5 hover:shadow-md ${type} ${item.is_cancelled ? "schedule-cancelled" : ""}`}
      style={{
        top,
        height,
        minHeight: height,
        left: `calc(${leftPct}% + ${gap}px)`,
        width: `calc(${widthPct}% - ${gap * 2}px)`,
        zIndex: 4 + col,
      }}
      title={`${subject} · нажмите для темы занятия`}
    >
      {(() => {
        const breaks = (item.breaks || []).map((value: string) => breakRange(value)).filter(Boolean) as Array<{start:number;end:number}>;
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
            return <div key={"segment-break-" + index} className="absolute left-0 right-0 z-10 flex items-center justify-center border-y border-dashed border-slate-400/50 bg-slate-100/80 text-[9px] font-semibold text-slate-600" style={{top: topPct + "%", height: heightPct + "%"}}>ПЕРЕРЫВ</div>;
          }
          lessonPart++;
          const label = lessonPart > 1 ? subject + " прод." : subject;
          return (
            <div key={"segment-lesson-" + index} className="absolute left-0 right-0 overflow-hidden px-2 py-1.5" style={{top: topPct + "%", height: heightPct + "%"}}>
              <div className={`line-clamp-2 text-[12px] font-bold leading-tight sm:text-[13px] ${item.is_cancelled ? "line-through" : ""}`}>{label}</div>
              <div className="mt-0.5 text-[10px] font-semibold opacity-75">{seg.start.toString().padStart(2,"0").replace(/^(\\d\\d)(\\d\\d)$/, "$1:$2")}–{Math.floor(seg.end/60).toString().padStart(2,"0")}:{(seg.end%60).toString().padStart(2,"0")}</div>
            </div>
          );
        });
      })()}
      {item.is_cancelled && <div className="absolute right-2 top-1 z-20 text-[9px] font-bold">ОТМЕНЕНО</div>}
      {item.teacher && cols === 1 && <div className="mt-1 truncate text-[10px] opacity-75">{item.teacher}</div>}
      {location && cols === 1 && (
        <div className="mt-1 flex items-center gap-1 text-[10px] opacity-75">
          <MapPin className="h-3 w-3 shrink-0" />
          {location}
        </div>
      )}
    </article>
  );
}

export default function SchedulePage() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => nowParts());
  const [weekStart, setWeekStart] = useState(() => startOfWeekYmd(nowParts().date));
  const [view, setView] = useState<"day"|"week"|"month"|"semester">("week");
  const [allItems, setAllItems] = useState<ScheduleItem[]>([]);
  const [source, setSource] = useState("db");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [selected, setSelected] = useState<ScheduleItem|null>(null);
  const [lesson, setLesson] = useState<SubjectPlanWeek|null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonWeeks, setLessonWeeks] = useState<SubjectPlanWeek[]>([]);
  const [meta, setMeta] = useState<ScheduleMeta>({ periods: [], duration_rules: [] });

  useEffect(() => {
    const tick = () => setNow(nowParts());
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [user?.course, user?.semester]);

  useEffect(() => {
    if (!hasToken()) { setLoading(false); return; }
    setLoading(true); setError(null);
    void Promise.all([listSchedule(SEMESTER_FROM, SEMESTER_TO), getScheduleMeta(user?.course, user?.semester)]).then(([res, metaRes]) => {
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
      setLoading(false);
    });
  }, []);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ key: addDaysYmd(weekStart, i) })), [weekStart]);
  const weekEnd = addDaysYmd(weekStart, 6);
  const items = useMemo(
    () => allItems.filter((it) => it.date && it.date >= weekStart && it.date <= weekEnd),
    [allItems, weekStart, weekEnd]
  );

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
  const currentDayItems = grouped.get(today) || [];
  const showNowLine = now.minutes >= GRID_START_MIN && now.minutes <= 18 * 60 + 30;
  const nowTop = (now.minutes - GRID_START_MIN) * PX_PER_MIN;
  const weekCount = items.length;
  const totalCount = allItems.length;
  const activePeriod = meta.periods.find((p) => p.start_date <= weekEnd && (!p.end_date || p.end_date >= weekStart));

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
              <Database className="h-3.5 w-3.5" /> {source === "db" ? "Supabase" : source === "local" ? "резервные данные" : source} · {totalCount} занятий за семестр
            </div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
              <Clock className="h-3.5 w-3.5" /> Хабаровск · {now.timeLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => addDaysYmd(d, -7))} aria-label="Предыдущая неделя"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="schedule-today-btn" onClick={() => setWeekStart(startOfWeekYmd(nowParts().date))}>Сегодня</button>
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => addDaysYmd(d, 7))} aria-label="Следующая неделя"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="schedule-tabs">
          {([["day","День"],["week","Неделя"],["month","Месяц"],["semester","Семестр"]] as const).map(([id,label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={view===id?"schedule-tab schedule-tab-active":"schedule-tab"}>{label}</button>
          ))}
        </div>
        <div className="schedule-period">{weekTitle(weekStart)} · на неделе {weekCount}</div>
        {activePeriod && <div className="w-full rounded-xl border px-3 py-2 text-xs font-semibold" style={{ background:"color-mix(in srgb,var(--primary) 7%,transparent)", color:"var(--primary)" }}>{activePeriod.title}: {activePeriod.start_date}{activePeriod.end_date ? ` — ${activePeriod.end_date}` : ""}</div>}
      </div>

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
              {meta.periods.length > 0 && <div className="flex flex-wrap gap-2">{meta.periods.map((p) => <div key={p.id} className="rounded-xl border px-3 py-2 text-xs" title={p.notes || ""}><b>{p.title}</b> · {p.start_date}{p.end_date ? ` — ${p.end_date}` : ""}</div>)}</div>}
            <div className="schedule-shell">
              <div className="schedule-scroll">
                <div className="schedule-grid" style={{ minWidth: 920 }}>
                  <div className="schedule-corner"><Clock className="h-4 w-4" /></div>
                  {days.map(({ key }) => (
                    <div key={key} className={`schedule-day-head ${key===today?"schedule-day-today":""}`}>
                      <div>{weekdayShortRu(key)}</div>
                      <strong>{dayDateRu(key)}</strong>
                      {key===today && <span>Сегодня</span>}
                    </div>
                  ))}
                  <div className="schedule-times">{SLOTS.map((t)=><div key={t} className="schedule-time">{t}</div>)}</div>
                  {days.map(({ key }) => (
                    <div key={key} className="schedule-day-column relative">
                      {SLOTS.map((t)=><div key={t} className="schedule-hour-line" />)}
                      {layoutDayColumns(grouped.get(key)||[]).map(({ item, col, cols })=>(
                        <ScheduleCard
                          key={item.id||`${item.date}-${item.start_time}-${item.subject_name}-${col}`}
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
                  На эту неделю занятий нет (в семестре загружено {totalCount}). Листайте ← → или откройте «Семестр».
                </p>
              )}
            </div>
            </div>
          )}

          {view === "day" && (
            <div className="space-y-3">
              <div className="schedule-day-picker">
                {days.map(({ key }) => (
                  <button key={key} type="button" className={key===today?"schedule-day-pill schedule-day-pill-active":"schedule-day-pill"} onClick={()=>setWeekStart(startOfWeekYmd(key))}>
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
                      <div className="font-bold">{item.subject_name||"Занятие"}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{TYPE_LABELS[item.type]||item.type} · нажмите для темы</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(view==="month"||view==="semester") && (
            <div className="card space-y-3 p-5">
              <h2 className="text-lg font-bold">{view==="month"?"Месяц":"Весь семестр"} · {totalCount} занятий</h2>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {allItems
                  .slice()
                  .sort((a,b)=>`${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
                  .filter((it)=> view==="semester" || it.date.startsWith(weekStart.slice(0,7)))
                  .map((it)=>(
                    <button key={it.id||`${it.date}-${it.start_time}`} type="button" className="flex w-full gap-3 rounded-xl border px-3 py-2 text-left text-sm hover:border-indigo-300" onClick={()=>openLesson(it)}>
                      <span className="w-24 shrink-0 font-mono text-xs opacity-70">{it.date}</span>
                      <span className="w-20 shrink-0 text-xs">{it.start_time.slice(0,5)}</span>
                      <span className="font-semibold">{it.subject_name}</span>
                      <span className="ml-auto text-xs opacity-60">{TYPE_LABELS[it.type]||it.type}</span>
                    </button>
                  ))}
              </div>
            </div>
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
                    <ul className="list-disc space-y-1 pl-4">{lesson.study.map((s,i)=><li key={i}>{s}</li>)}</ul>
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
              {selected.is_makeup && <div className="sm:col-span-2 font-semibold text-amber-700">Перенос / пересдача</div>}
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