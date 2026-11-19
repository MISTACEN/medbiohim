"use client";

/**
 * CMS · Сетка расписания (drag-and-drop): shell-композиция над хабом.
 * Источник истины = PostgreSQL/Supabase (policy=db_primary_no_merge).
 * Local JSON — только аварийный fallback.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Plus, Save, Upload } from "lucide-react";
import { hasToken, type ScheduleItem } from "@/lib/api";
import { formatDraftTime } from "@/lib/unsaved-changes";
import { ScheduleLessonModal } from "@/components/admin/schedule-hub/ScheduleLessonModal";
import { ScheduleWeekGrid } from "@/components/admin/schedule-hub/ScheduleWeekGrid";
import { addDays, dedupeItems, ymdFromKhToday } from "@/components/admin/schedule-hub/model";
import { useScheduleHub } from "@/components/admin/schedule-hub/useScheduleHub";

export function ScheduleHubPanel() {
  const hub = useScheduleHub();
  const {
    groups, groupId, setGroupId,
    setItems, weekStart, setWeekStart,
    loading, saving, note, source, setDragId,
    edit, setEdit, importing, meta, currentGroup,
    days, grouped,
    load, draftOffer,
    restoreDraft, discardDraft,
    onDrop, addItem, dedupe, importXlsx, saveAll,
  } = hub;

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
          <p className="page-subtitle">Сетка · drag-and-drop · БД primary · {source || "—"}</p>
          <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3"><div className="text-[11px] font-bold uppercase tracking-wide text-indigo-500">Сейчас редактируется расписание</div><div className="mt-1 text-lg font-bold text-indigo-950">{currentGroup?.name || "Группа не выбрана"}</div><div className="text-sm text-indigo-700">{currentGroup?.code || "—"} · {currentGroup?.course_number || "—"} курс · 3 семестр</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={addItem}><Plus className="h-4 w-4" /> Занятие</button>
          <button type="button" className="btn-secondary" onClick={dedupe}>Убрать дубли</button>
          <label className={"btn-secondary inline-flex items-center gap-2 cursor-pointer " + (importing ? "opacity-50 pointer-events-none" : "")}><Upload className="h-4 w-4"/> Импорт XLSX<input type="file" hidden accept=".xlsx,.xls" disabled={importing} onChange={(e) => { const file=e.target.files?.[0]; if(file) void importXlsx(file); e.currentTarget.value=""; }}/></label>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveAll()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {meta.periods.map((p) => <div key={p.id} className="rounded-xl border bg-slate-50 px-3 py-2 text-xs" title={p.notes || ""}><b>{p.title}</b> · {p.start_date}{p.end_date ? ` — ${p.end_date}` : ""}</div>)}
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

      {note && <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-2 text-sm text-[var(--status-warn-fg)]">{note}</div>}

      {draftOffer && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900">
          <span className="min-w-0 flex-1">
            Найден несохранённый черновик расписания от {formatDraftTime(draftOffer.savedAt)} — {draftOffer.data.items.length} занятий.
          </span>
          <button type="button" className="btn-secondary text-xs" onClick={restoreDraft}>Восстановить</button>
          <button type="button" className="text-xs font-semibold text-[var(--status-critical-fg)]" onClick={discardDraft}>Удалить черновик</button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 p-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Загрузка…</div>
      ) : (
        <ScheduleWeekGrid
          days={days}
          grouped={grouped}
          onDropCell={onDrop}
          onDragItem={(id) => setDragId(id)}
          onOpenItem={(item) => setEdit(item)}
        />
      )}

      {edit && (
        <ScheduleLessonModal
          edit={edit}
          onChange={(next: ScheduleItem) => setEdit(next)}
          onClose={() => setEdit(null)}
          onDelete={() => { setItems((p) => p.filter((x) => x.id !== edit.id)); setEdit(null); }}
          onSave={() => {
            setItems((p) => dedupeItems(p.map((x) => (x.id === edit.id ? edit : x))));
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}
