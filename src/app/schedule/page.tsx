"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Database,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { listSchedule, hasToken, type ScheduleItem } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";

/** Единственная таймзона портала — Хабаровск (UTC+10) */
const TZ = "Asia/Vladivostok";

const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция",
  practice: "Практика",
  laboratory: "Лабораторная",
  seminar: "Семинар",
  exam: "Экзамен",
  credit: "Зачёт",
  consultation: "Консультация",
  other: "Занятие",
};

const TYPE_CLASS: Record<string, string> = {
  lecture: "schedule-lecture",
  practice: "schedule-practice",
  laboratory: "schedule-lab",
  seminar: "schedule-seminar",
  exam: "schedule-exam",
  credit: "schedule-credit",
  consultation: "schedule-consultation",
  other: "schedule-other",
};

const SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const GRID_START_MIN = 8 * 60;
const PX_PER_MIN = 1.05;

function nowParts() {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const raw = Object.fromEntries(
    dtf.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  const year = Number(raw.year);
  const month = Number(raw.month);
  const day = Number(raw.day);
  const hour = Number(raw.hour);
  const minute = Number(raw.minute);
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    year, month, day, hour, minute,
    date,
    minutes: hour * 60 + minute,
    timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function startOfWeekYmd(ymd: string): string {
  const { y, m, d } = parseYmd(ymd);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(ymd, delta);
}

function weekdayShortRu(ymd: string): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" }).format(dt).replace(".", "");
}

function dayDateRu(ymd: string): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(dt);
}

function weekTitle(startYmd: string): string {
  const endYmd = addDaysYmd(startYmd, 6);
  const a = parseYmd(startYmd);
  const b = parseYmd(endYmd);
  const start = new Date(Date.UTC(a.y, a.m - 1, a.d, 12));
  const end = new Date(Date.UTC(b.y, b.m - 1, b.d, 12));
  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
  const fmtEnd = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `${fmt.format(start)} — ${fmtEnd.format(end)} · Хабаровск`;
}

function timeToMinutes(v: string) {
  const [h, m] = v.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function ScheduleCard({ item }: { item: ScheduleItem }) {
  const start = timeToMinutes(item.start_time);
  const end = timeToMinutes(item.end_time);
  const top = Math.max(0, (start - GRID_START_MIN) * PX_PER_MIN);
  const height = Math.max(58, (end - start) * PX_PER_MIN);
  const type = TYPE_CLASS[item.type] || TYPE_CLASS.other;
  const subject = item.subject_name || "Занятие";
  const location = [item.building, item.room].filter(Boolean).join(", ");

  return (
    <article
      className={`schedule-card absolute left-1 right-1 overflow-hidden rounded-xl border p-2.5 shadow-sm transition hover:z-20 hover:-translate-y-0.5 hover:shadow-md ${type} ${item.is_cancelled ? "schedule-cancelled" : ""}`}
      style={{ top, minHeight: height }}
      title={`${subject} · ${item.start_time.slice(0, 5)}–${item.end_time.slice(0, 5)}${location ? ` · ${location}` : ""}`}
    >
      <div className={`line-clamp-2 text-[12px] font-bold leading-tight sm:text-[13px] ${item.is_cancelled ? "line-through" : ""}`}>{subject}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-semibold opacity-80">
        <span>{TYPE_LABELS[item.type] || item.type}</span>
        {item.is_cancelled && <span>ОТМЕНЕНО</span>}
      </div>
      <div className="mt-1 text-[11px] font-semibold opacity-75">{item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</div>
      {location && (
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
  const [view, setView] = useState<"day" | "week" | "month" | "semester">("week");
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [source, setSource] = useState("db");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(nowParts());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const days = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ key: addDaysYmd(weekStart, i) })),
    [weekStart]
  );

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void listSchedule(weekStart, addDaysYmd(weekStart, 6)).then((res) => {
      if (res.ok) {
        setItems(Array.isArray(res.data.items) ? res.data.items : []);
        const payload = res.data as { items: ScheduleItem[]; source?: string };
        setSource(payload.source || "db");
      } else {
        setItems([]);
        setError(res.error.message || "Не удалось загрузить расписание");
      }
      setLoading(false);
    });
  }, [weekStart]);

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
  const first = items[0];
  const course = user?.course ?? 2;
  const semester = first?.semester ?? user?.semester ?? 3;
  const academicYear = "2026/2027";
  const groupName = first?.group_name || user?.groupName || "Группа не назначена";
  const groupMissing = !first?.group_name && !user?.groupName;
  const currentDayItems = grouped.get(today) || [];
  const showNowLine = now.minutes >= GRID_START_MIN && now.minutes <= 18 * 60 + 30;
  const nowTop = (now.minutes - GRID_START_MIN) * PX_PER_MIN;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6" style={{ color: "var(--primary)" }} />
            <h1 className="page-title">Расписание</h1>
          </div>
          <p className="page-subtitle">
            {groupName} · {course} курс · семестр {semester} · {academicYear}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
              <Database className="h-3.5 w-3.5" /> Источник: {source === "db" ? "Supabase · утверждённая сетка" : source === "supabase" ? "Supabase REST" : "резервные данные"}
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--foreground)" }}
              title="Часовой пояс портала — всегда Хабаровск (Asia/Vladivostok)"
            >
              <Clock className="h-3.5 w-3.5" />
              Хабаровск · {now.timeLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => addDaysYmd(d, -7))} aria-label="Предыдущая неделя">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="schedule-today-btn" onClick={() => setWeekStart(startOfWeekYmd(nowParts().date))}>
            Сегодня
          </button>
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => addDaysYmd(d, 7))} aria-label="Следующая неделя">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="schedule-tabs">
          {([["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["semester", "Семестр"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={view === id ? "schedule-tab schedule-tab-active" : "schedule-tab"}>
              {label}
            </button>
          ))}
        </div>
        <div className="schedule-period">{weekTitle(weekStart)}</div>
      </div>

      {groupMissing && !loading && (
        <div className="schedule-config-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <b>Учебная группа не назначена.</b>
            <p>В CMS → Пользователи укажите пользователю группу и семестр. После этого расписание автоматически подтянется из Supabase.</p>
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb,var(--danger) 10%,transparent)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          {view === "week" && (
            <div className="schedule-shell">
              <div className="schedule-scroll">
                <div className="schedule-grid" style={{ minWidth: 920 }}>
                  <div className="schedule-corner"><Clock className="h-4 w-4" /></div>
                  {days.map(({ key }) => (
                    <div key={key} className={`schedule-day-head ${key === today ? "schedule-day-today" : ""}`}>
                      <div>{weekdayShortRu(key)}</div>
                      <strong>{dayDateRu(key)}</strong>
                      {key === today && <span>Сегодня</span>}
                    </div>
                  ))}
                  <div className="schedule-times">
                    {SLOTS.map((t) => (
                      <div key={t} className="schedule-time">{t}</div>
                    ))}
                  </div>
                  {days.map(({ key }) => (
                    <div key={key} className="schedule-day-column relative">
                      {SLOTS.map((t) => (
                        <div key={t} className="schedule-hour-line" />
                      ))}
                      {(grouped.get(key) || []).map((item) => (
                        <ScheduleCard key={item.id || `${item.date}-${item.start_time}-${item.subject_name}`} item={item} />
                      ))}
                      {key === today && showNowLine && (
                        <div className="schedule-now-line" style={{ top: nowTop }} aria-label={`Сейчас ${now.timeLabel} (Хабаровск)`}>
                          <span className="schedule-now-dot" />
                          <span className="schedule-now-label">{now.timeLabel}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "day" && (
            <div className="space-y-3">
              <div className="schedule-day-picker">
                {days.map(({ key }) => (
                  <button
                    key={key}
                    type="button"
                    className={key === today ? "schedule-day-pill schedule-day-pill-active" : "schedule-day-pill"}
                    onClick={() => setWeekStart(startOfWeekYmd(key))}
                  >
                    <span>{weekdayShortRu(key)}</span>
                    <b>{dayDateRu(key)}</b>
                  </button>
                ))}
              </div>
              <div className="card relative divide-y overflow-hidden p-0">
                {currentDayItems.length === 0 ? (
                  <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>На сегодня занятий нет.</div>
                ) : (
                  currentDayItems.map((item) => (
                    <div key={item.id || `${item.start_time}-${item.subject_name}`} className="flex gap-4 p-4">
                      <div className="w-24 shrink-0 text-sm font-semibold" style={{ color: "var(--primary)" }}>
                        {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}
                      </div>
                      <div>
                        <div className="font-bold">{item.subject_name || "Занятие"}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {TYPE_LABELS[item.type] || item.type}
                          {[item.building, item.room].filter(Boolean).length > 0 ? ` · ${[item.building, item.room].filter(Boolean).join(", ")}` : ""}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div className="border-t px-4 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  Время: Хабаровск (Asia/Vladivostok) · сейчас {now.timeLabel}
                </div>
              </div>
            </div>
          )}

          {view !== "week" && view !== "day" && (
            <div className="card flex min-h-56 flex-col items-center justify-center text-center">
              <CalendarDays className="mb-3 h-10 w-10" style={{ color: "var(--primary)" }} />
              <h2 className="text-lg font-bold">{view === "month" ? "Месячный вид" : "Весь семестр"}</h2>
              <p className="mt-1 max-w-md text-sm" style={{ color: "var(--muted)" }}>
                Рабочая сетка из Supabase для {groupName}. Основной режим — неделя. Часовой пояс: Хабаровск.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
