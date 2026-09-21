"use client";

/**
 * CMS · Сетка расписания (drag-and-drop).
 *
 * Источник данных (бэкенд, policy=single_source_no_merge):
 *  1) локальный schedule.json на SpaceWeb (после «Сохранить»)
 *  2) fallback Supabase/БД, только если local пуст
 * Нельзя склеивать local+db на клиенте — будут «дубли» карточек.
 *
 * Сохранение пишет в оба хранилища (local обязателен для студента на SpaceWeb,
 * db — зеркало в Supabase, если доступен). После save снова load() читает
 * single-source с сервера.
 *
 * Связано с: GET/PUT /api/v1/admin/schedule, PUT .../schedule/local,
 * ContentStore::listSchedule / dedupeScheduleItems, dashboard nearest.
 */
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

/** Таймзона кампуса (Хабаровск) — совпадает с фильтром nearest на бэкенде */
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

/**
 * Клиентский дедуп (страховка к ContentStore::dedupeScheduleItems).
 * Сигнатура: date|start|end|subject|type|room|group — без этого сетка
 * после повторного «Сохранить» или load всех групп показывает тройные карточки.
 */
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

export default function AdminSchedulePage() {
  const [groups, setGroups] = useState<Array<{ id: string; name?: string; code?: string }>>([]);
  const [groupId, setGroupId] = useState("");
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [weekStart, setWeekStart] = useState(() => ymdFromKhToday());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ScheduleItem | null>(null);

  useEffect(() => {
    void (async () => {
      const g = await listGroups();
      if (g.ok) {
        const list = (g.data.items || []) as Array<{ id: string; name?: string; code?: string }>;
        setGroups(list);
        const mb = list.find((x) => (x.code || "").includes("МБ-201") || (x.name || "").includes("201"));
        if (mb) setGroupId(String(mb.id));
        else if (list[0]) setGroupId(String(list[0].id));
      }
    })();
  }, []);

  const days = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = addDays(weekStart, i);
        return { date: d, key: dateKey(d) };
      }),
    [weekStart]
  );

  /** Загрузка: один источник с сервера + фильтр по выбранной группе */
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
      const src = (res.data as { source?: string }).source || "";
      setSource(src);
      setNote(`Загружено ${list.length} занятий · источник: ${src || "—"} (дубли отфильтрованы)`);
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
      setNote("Выберите группу перед сохранением — иначе сохранятся все группы и сетка «удвоится»");
      return;
    }
    const clean = dedupeItems(items).map((x) => ({ ...x, group_id: groupId }));
    setItems(clean);
    const local = await adminSaveScheduleLocal(clean);
    const db = await adminSaveSchedule({ group_id: groupId, semester: 3, entries: clean });
    setSaving(false);
    if (!db.ok && !local.ok) { setNote(db.error.message); return; }
    setNote(
      local.ok
        ? `Сохранено · локально ${local.data.count}${db.ok ? ` · БД ${(db.data as { entries_saved?: number }).entries_saved ?? clean.length}` : ` · БД: ${db.error?.message || "пропуск"}`}`
        : `Локально ошибка; БД: ${db.ok ? "ok" : db.error.message}`
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-primary">← Админ</Link>
          <h1 className="page-title mt-1">CMS · Расписание</h1>
          <p className="page-subtitle">Сетка · drag-and-drop · группа · Хабаровск (00:20) · {source || "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={addItem}><Plus className="h-4 w-4" /> Занятие</button>
          <button type="button" className="btn-secondary" onClick={() => setItems((p) => dedupeItems(p))}>Убрать дубли</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveAll()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Группа (обязательно)
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="mt-1 block rounded-xl border px-3 py-2">
            <option value="">—</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.code || g.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded-lg border p-2" onClick={() => setWeekStart((w) => addDays(w, -7))}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setWeekStart(ymdFromKhToday())}>Сегодня</button>
          <button type="button" className="rounded-lg border p-2" onClick={() => setWeekStart((w) => addDays(w, 7))}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {note && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{note}</div>}
      {loading ? (
        <div className="flex items-center gap-2 p-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Загрузка…</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b p-2 text-left"> </th>
                {days.map((d) => (
                  <th key={d.key} className="border-b p-2 text-center font-semibold">
                    {d.date.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((hour) => (
                <tr key={hour}>
                  <td className="border-b px-2 py-6 text-xs text-slate-400">{String(hour).padStart(2, "0")}:00</td>
                  {days.map((d) => {
                    const cell = (grouped.get(d.key) || []).filter((x) => Math.floor(timeToMinutes(x.start_time) / 60) === hour);
                    return (
                      <td
                        key={d.key + hour}
                        className="border-b border-l p-1 align-top"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDrop(d.key, hour, e)}
                      >
                        {cell.map((it) => (
                          <div
                            key={it.id}
                            draggable
                            onDragStart={() => setDragId(String(it.id))}
                            onClick={() => setEdit(it)}
                            className="mb-1 cursor-grab rounded-lg bg-indigo-50 px-2 py-1 text-left text-xs shadow-sm hover:bg-indigo-100"
                          >
                            <div className="font-semibold">{it.subject_name}</div>
                            <div className="text-[10px] text-slate-500">{TYPE_LABELS[it.type] || it.type} · {(it.start_time || "").slice(0, 5)}</div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card max-w-md space-y-3 p-5">
            <h2 className="font-bold">Редактировать</h2>
            <input className="w-full rounded-xl border px-3 py-2" value={edit.subject_name} onChange={(e) => setEdit({ ...edit, subject_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" className="rounded-xl border px-3 py-2" value={(edit.start_time || "").slice(0, 5)} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} />
              <input type="time" className="rounded-xl border px-3 py-2" value={(edit.end_time || "").slice(0, 5)} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} />
            </div>
            <select className="w-full rounded-xl border px-3 py-2" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="Аудитория" value={edit.room || ""} onChange={(e) => setEdit({ ...edit, room: e.target.value })} />
            <div className="flex justify-between gap-2">
              <button type="button" className="text-rose-600" onClick={() => { setItems((p) => p.filter((x) => x.id !== edit.id)); setEdit(null); }}><Trash2 className="inline h-4 w-4" /> Удалить</button>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Отмена</button>
                <button type="button" className="btn-primary" onClick={() => { setItems((p) => dedupeItems(p.map((x) => (x.id === edit.id ? edit : x)))); setEdit(null); }}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
