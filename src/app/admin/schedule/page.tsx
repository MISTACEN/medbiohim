"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  adminListSchedule,
  adminSaveSchedule,
  adminSaveScheduleLocal,
  listGroups,
  hasToken,
  type ScheduleItem,
} from "@/lib/api";
import { ChevronLeft, ChevronRight, Loader2, Plus, Save, Trash2 } from "lucide-react";

const TZ = "Asia/Vladivostok";
const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная",
  seminar: "Семинар", exam: "Экзамен", credit: "Зачёт",
  consultation: "Консультация", other: "Другое",
};
const TYPES = Object.keys(TYPE_LABELS);
const SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function nowPartsKh() {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const raw = Object.fromEntries(
    dtf.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return {
    date: `${raw.year}-${raw.month}-${raw.day}`,
    minutes: Number(raw.hour) * 60 + Number(raw.minute),
    timeLabel: `${raw.hour}:${raw.minute}`,
  };
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(value: Date) {
  const d = new Date(value); d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function addDays(value: Date, days: number) {
  const d = new Date(value); d.setDate(d.getDate() + days); return d;
}
function timeToMinutes(v: string) {
  const [h, m] = (v || "08:00").slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}
function ymdFromKhToday() {
  const n = nowPartsKh();
  const [y, m, d] = n.date.split("-").map(Number);
  return startOfWeek(new Date(y, m - 1, d, 12));
}

function dedupeItems(list: ScheduleItem[]): ScheduleItem[] {
  const byId = new Set<string>();
  const bySig = new Map<string, ScheduleItem>();
  for (const it of list) {
    const id = String(it.id || "");
    if (id && byId.has(id)) continue;
    const sig = [
      it.date || "",
      (it.start_time || "").slice(0, 5),
      (it.end_time || "").slice(0, 5),
      (it.subject_name || "").trim().toLowerCase(),
      (it.type || "").toLowerCase(),
      (it.room || "").trim().toLowerCase(),
      it.group_id || "",
    ].join("|");
    if (bySig.has(sig)) continue;
    if (id) byId.add(id);
    bySig.set(sig, it);
  }
  return Array.from(bySig.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
  );
}

type Group = { id: string; name?: string; code?: string };

export default function AdminSchedulePage() {
  const [weekStart, setWeekStart] = useState(() => ymdFromKhToday());
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [edit, setEdit] = useState<ScheduleItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [now, setNow] = useState(() => nowPartsKh());

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowPartsKh()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!hasToken()) return;
    void listGroups().then((g) => {
      if (g.ok) {
        const list = (g.data.items || []) as Group[];
        setGroups(list);
        setGroupId((prev) => prev || list[0]?.id || "");
      }
    });
  }, []);

  const days = useMemo(
    () => Array.from({ length: 6 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, key: dateKey(d) };
    }),
    [weekStart]
  );

  const load = useCallback(async () => {
    if (!hasToken()) { setLoading(false); return; }
    if (!groupId) { setLoading(false); return; }
    setLoading(true); setNote(null);
    const res = await adminListSchedule(groupId, 3);
    setLoading(false);
    if (res.ok) {
      let list = dedupeItems(res.data.items || []);
      list = list.filter((x) => !x.group_id || x.group_id === groupId);
      setItems(list);
      setSource((res.data as { source?: string }).source || "");
      setNote(`Загружено ${list.length} занятий (дубли отфильтрованы)`);
    } else setNote(res.error.message);
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const weekItems = useMemo(() => {
    const from = dateKey(weekStart);
    const to = dateKey(addDays(weekStart, 6));
    return items.filter((x) => x.date >= from && x.date <= to);
  }, [items, weekStart]);

  const grouped = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const it of weekItems) m.set(it.date, [...(m.get(it.date) || []), it]);
    m.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return m;
  }, [weekItems]);

  function onDrop(date: string, hour: number, e?: { preventDefault?: () => void; stopPropagation?: () => void }) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!dragId) return;
    const movingId = dragId;
    setDragId(null);
    const snaps: Record<number, [string, string]> = {
      8: ["08:30", "10:10"], 10: ["10:40", "12:20"],
      12: ["12:50", "14:30"], 14: ["14:45", "16:25"],
    };
    const pair = snaps[hour] || [`${String(hour).padStart(2, "0")}:00`, `${String(hour + 1).padStart(2, "0")}:30`];
    setItems((prev) =>
      dedupeItems(prev.map((it) => (it.id === movingId ? { ...it, date, start_time: pair[0], end_time: pair[1] } : it)))
    );
  }

  function addItem() {
    const id = `new-${Date.now()}`;
    const row: ScheduleItem = {
      id, date: dateKey(weekStart), start_time: "08:30", end_time: "10:10",
      subject_name: "Новый предмет", type: "lecture", room: "", notes: "",
      is_cancelled: false, group_id: groupId || undefined,
    };
    setItems((prev) => [...prev, row]);
    setEdit(row);
  }

  async function saveAll() {
    setSaving(true); setNote(null);
    if (!groupId) {
      setSaving(false);
      setNote("Выберите группу перед сохранением — иначе сохранятся все группы и сетка удвоится");
      return;
    }
    const clean = dedupeItems(items).map((x) => ({ ...x, group_id: groupId }));
    setItems(clean);
    const local = await adminSaveScheduleLocal(clean);
    const db = await adminSaveSchedule({ group_id: groupId, semester: 3, entries: clean });
    setSaving(false);
    if (!db.ok && !local.ok) { setNote(db.error.message); return; }
    setNote(
      db.ok
        ? `Сохранено без дублей · БД ${(db.data as { entries_saved?: number }).entries_saved ?? clean.length} · локально ${local.ok ? local.data.count : "—"}`
        : `Локально ${local.ok ? local.data.count : "ошибка"}; БД: ${db.error.message}`
    );
    await load();
  }

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p>Нужен вход администратора</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const today = now.date;
  const showNow = now.minutes >= 8 * 60 && now.minutes <= 18 * 60 + 30;
  const nowTop = (now.minutes - 8 * 60) * (64 / 60);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-primary">← Админ</Link>
          <h1 className="page-title">CMS · Расписание</h1>
          <p className="page-subtitle">
            Сетка · drag-and-drop · группа · Хабаровск ({now.timeLabel})
            {source ? ` · ${source}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm" onClick={addItem}>
            <Plus className="mr-1 inline h-4 w-4" /> Занятие
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
            onClick={() => {
              setItems((prev) => {
                const n = dedupeItems(prev);
                setNote(`Дубли убраны: было ${prev.length}, стало ${n.length}`);
                return n;
              });
            }}
          >
            Убрать дубли
          </button>
          <button type="button" disabled={saving} className="btn-primary inline-flex items-center gap-2 text-sm" onClick={() => void saveAll()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Группа (обязательно)</span>
          <select className="w-full rounded-xl border px-3 py-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">— выберите группу —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.code || g.name || g.id}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="schedule-today-btn" onClick={() => setWeekStart(ymdFromKhToday())}>Сегодня</button>
          <button type="button" className="schedule-icon-btn" onClick={() => setWeekStart((d) => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {note && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{note}</div>}

      {edit && (
        <div className="card space-y-3 border-primary/30 p-5">
          <h2 className="font-semibold">Редактирование занятия</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Предмет
              <input className="mt-1 w-full rounded-xl border px-3 py-2" value={edit.subject_name || ""} onChange={(e) => setEdit({ ...edit, subject_name: e.target.value })} />
            </label>
            <label className="text-sm">Тип
              <select className="mt-1 w-full rounded-xl border px-3 py-2" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="text-sm">Дата
              <input type="date" className="mt-1 w-full rounded-xl border px-3 py-2" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
            </label>
            <label className="text-sm">Аудитория
              <input className="mt-1 w-full rounded-xl border px-3 py-2" value={edit.room || ""} onChange={(e) => setEdit({ ...edit, room: e.target.value })} />
            </label>
            <label className="text-sm">Начало
              <input type="time" className="mt-1 w-full rounded-xl border px-3 py-2" value={(edit.start_time || "").slice(0, 5)} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} />
            </label>
            <label className="text-sm">Конец
              <input type="time" className="mt-1 w-full rounded-xl border px-3 py-2" value={(edit.end_time || "").slice(0, 5)} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-sm" onClick={() => { setItems((prev) => dedupeItems(prev.map((x) => (x.id === edit.id ? edit : x)))); setEdit(null); }}>Применить</button>
            <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm" onClick={() => setEdit(null)}>Отмена</button>
            <button type="button" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600" onClick={() => { setItems((prev) => prev.filter((x) => x.id !== edit.id)); setEdit(null); }}>
              <Trash2 className="mr-1 inline h-3 w-3" /> Удалить
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</div>
      ) : !groupId ? (
        <div className="card p-6 text-sm text-slate-600">Выберите группу — иначе в сетке смешаются занятия всех групп и появятся «дубли».</div>
      ) : (
        <div className="schedule-shell overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="grid" style={{ gridTemplateColumns: "56px repeat(6, 1fr)", gridTemplateRows: `48px repeat(${SLOTS.length}, 64px)` }}>
              <div className="schedule-corner" />
              {days.map(({ date, key }) => (
                <div key={key} className={`schedule-day-head border-b px-2 py-2 text-center text-sm font-semibold ${key === today ? "schedule-day-today" : ""}`}>
                  {new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date)}{" "}
                  {new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date)}
                </div>
              ))}
              {SLOTS.map((hour) => (
                <Fragment key={`row-${hour}`}>
                  <div className="border-r border-b px-1 py-2 text-xs text-slate-400">{String(hour).padStart(2, "0")}:00</div>
                  {days.map(({ key }) => (
                    <div key={`${key}-${hour}`} className="relative border-b border-r bg-white/40" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(key, hour, e)}>
                      {(grouped.get(key) || [])
                        .filter((it) => Math.floor(timeToMinutes(it.start_time) / 60) === hour)
                        .map((it) => (
                          <div
                            key={it.id}
                            draggable
                            onDragStart={() => setDragId(it.id)}
                            onClick={() => setEdit(it)}
                            className="m-0.5 cursor-grab rounded-lg border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-[11px] leading-tight active:cursor-grabbing"
                            title="Перетащите или нажмите для редактирования"
                          >
                            <div className="font-semibold text-indigo-900">{it.subject_name}</div>
                            <div className="text-indigo-600/80">{(TYPE_LABELS[it.type] || it.type).slice(0, 8)} · {it.start_time?.slice(0, 5)}</div>
                          </div>
                        ))}
                      {key === today && hour === Math.floor(now.minutes / 60) && showNow && (
                        <div className="schedule-now-line" style={{ top: nowTop % 64 }} aria-label={`Сейчас ${now.timeLabel}`}>
                          <span className="schedule-now-dot" />
                          <span className="schedule-now-label">{now.timeLabel}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Drag-and-drop · клик — правка · за неделю {weekItems.length} / всего {items.length} (без дублей)
          </p>
        </div>
      )}
    </div>
  );
}
