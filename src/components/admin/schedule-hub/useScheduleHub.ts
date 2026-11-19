"use client";

/**
 * CMS · Сетка расписания: состояние и действия хаба — загрузка сетки,
 * черновики, drag-and-drop, импорт XLSX и сохранение в БД.
 * Источник истины = PostgreSQL/Supabase (policy=db_primary_no_merge).
 * Local JSON — только аварийный fallback.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminListSchedule,
  getScheduleMeta,
  adminResolveCohort,
  adminSaveSchedule,
  adminImportScheduleXlsx,
  listGroups,
  hasToken,
  type ScheduleItem,
} from "@/lib/api";
import { clearDraft, readDraft, saveDraft, useUnsavedChanges } from "@/lib/unsaved-changes";
import { describeApiError } from "@/lib/errors";
import {
  addDays,
  dateKey,
  dedupeItems,
  ymdFromKhToday,
  type ScheduleDraftOffer,
  type ScheduleGroupOption,
  type SchedulePeriod,
} from "@/components/admin/schedule-hub/model";

export function useScheduleHub() {
  const [groups, setGroups] = useState<ScheduleGroupOption[]>([]);
  const [groupId, setGroupId] = useState("");
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [weekStart, setWeekStart] = useState(() => ymdFromKhToday());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ScheduleItem | null>(null);
  const [importing, setImporting] = useState(false);
  // Снимок серверного состояния: без него нельзя отличить «сетка как была» от правок.
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draftOffer, setDraftOffer] = useState<ScheduleDraftOffer | null>(null);
  const [meta, setMeta] = useState<{ periods: SchedulePeriod[] }>({ periods: [] });
  const currentGroup = groups.find((g) => String(g.id) === String(groupId));

  useEffect(() => {
    void (async () => {
      const g = await listGroups();
      if (g.ok) {
        const list = (g.data.items || []) as ScheduleGroupOption[];
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

  const load = useCallback(async () => {
    if (!hasToken()) { setLoading(false); return; }
    if (!groupId) { setLoading(false); return; }
    setLoading(true); setNote(null);
    const metaRes = await getScheduleMeta(2, 3);
    if (metaRes.ok) setMeta({ periods: metaRes.data.periods });
    const res = await adminListSchedule(groupId, 3);
    setLoading(false);
    if (res.ok) {
      let list = dedupeItems(res.data.items || []);
      list = list.filter((x) => !x.group_id || x.group_id === groupId);
      setItems(list);
      setBaseline(JSON.stringify(list));
      const payload = res.data as {
        source?: string;
        degraded?: boolean;
        service_notice?: string;
        service_notice_title?: string;
      };
      const src = payload.source || "";
      setSource(src);
      if (payload.degraded || payload.service_notice || src === "local_fallback" || src === "local") {
        setNote(
          `${payload.service_notice_title || "Что-то пошло не так"}: ${
            payload.service_notice ||
            "Временный сбой — основная база недоступна, показан резервный режим. Скоро всё починят."
          } · загружено ${list.length}`
        );
      } else {
        setNote(`Загружено ${list.length} занятий · источник: ${src || "db"}`);
      }
    } else {
      setNote(`Что-то пошло не так: ${describeApiError(res.error)}. Скоро всё починят — попробуйте позже.`);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const draftKey = `admin:schedule:${groupId || "none"}:3`;
  const dirty = baseline !== null && JSON.stringify(items) !== baseline;
  useUnsavedChanges(dirty);

  // Черновик пишется только когда есть расхождения с сервером — иначе нечего восстанавливать.
  useEffect(() => {
    if (!dirty || !groupId) return;
    const timer = setTimeout(() => saveDraft(draftKey, { items, weekStart }), 800);
    return () => clearTimeout(timer);
  }, [dirty, groupId, draftKey, items, weekStart]);

  useEffect(() => {
    if (!groupId) return setDraftOffer(null);
    const stored = readDraft<{ items: ScheduleItem[]; weekStart?: string }>(draftKey);
    setDraftOffer(stored && Array.isArray(stored.data?.items) ? { savedAt: stored.savedAt, data: stored.data } : null);
  }, [draftKey, groupId]);

  function restoreDraft() {
    if (!draftOffer) return;
    setItems(draftOffer.data.items);
    const restoredWeek = draftOffer.data.weekStart ? new Date(draftOffer.data.weekStart) : null;
    if (restoredWeek && !Number.isNaN(restoredWeek.getTime())) setWeekStart(restoredWeek);
    setDraftOffer(null);
    setNote("Черновик восстановлен — проверьте сетку и нажмите «Сохранить»");
  }

  function discardDraft() {
    clearDraft(draftKey);
    setDraftOffer(null);
  }

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

  function dedupe() {
    setItems((p) => dedupeItems(p));
  }

  /**
   * Резолвер когорты (Блок 5): файл «МБХ 201» в 2026-27 — это когорта
   * поступления 2025. Если группа ещё не выбрана — распознаём из названия
   * файла и подставляем стабильный id; ручной выбор всегда сильнее.
   */
  async function resolveFromFile(file: File): Promise<string | null> {
    if (groupId) return groupId;
    const label = file.name.replace(/\.(xlsx|xls)$/i, "");
    const res = await adminResolveCohort(label);
    if (!res.ok) return null;
    const data = res.data as {
      match?: { id: string; code?: string; name?: string } | null;
      candidates?: Array<{ id: string; code?: string; name?: string }>;
      computed?: { course?: number | null; base?: string; academic_year?: number };
      reason?: string;
    };
    if (data?.match) {
      setGroupId(data.match.id);
      setNote(`Файл «${label}» распознан: группа ${data.match.code || data.match.name} (когорта ${data.computed?.academic_year ? data.computed.academic_year - (data.computed.course || 1) + 1 : "—"}). Проверьте и сохраняйте.`);
      return data.match.id;
    }
    if (data?.candidates?.length) {
      setNote(`Файл «${label}» подходит нескольким группам — выберите вручную: ${data.candidates.map((x) => x.code || x.name).join(", ")}.`);
      return null;
    }
    setNote(`Не удалось распознать группу из «${label}» — выберите вручную.`);
    return null;
  }

  async function importXlsx(file: File) {
    const resolved = await resolveFromFile(file);
    if (!resolved) { if (!groupId) setNote("Сначала выберите группу."); return; }
    setImporting(true); setNote(null);
    const res = await adminImportScheduleXlsx(file, resolved, 3);
    setImporting(false);
    if (!res.ok) { setNote(describeApiError(res.error)); return; }
    setNote("Расписание из XLSX импортировано. Обновляем сетку…");
    await load();
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
    const db = await adminSaveSchedule({ group_id: groupId, semester: 3, entries: clean });
    setSaving(false);
    if (!db.ok) {
      setNote(describeApiError(db.error));
      return;
    }
    clearDraft(draftKey);
    setDraftOffer(null);
    setNote(`Сохранено в БД · версия ${(db.data as { version?: number }).version ?? "—"} · ${(db.data as { entries_saved?: number }).entries_saved ?? clean.length} занятий`);
    await load();
  }

  return {
    groups, groupId, setGroupId,
    items, setItems, weekStart, setWeekStart,
    loading, saving, note, source, dragId, setDragId,
    edit, setEdit, importing, meta, currentGroup,
    days, weekItems, grouped,
    load, dirty, draftOffer,
    restoreDraft, discardDraft,
    onDrop, addItem, dedupe, importXlsx, saveAll,
  };
}
