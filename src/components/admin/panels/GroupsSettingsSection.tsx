"use client";

/** Группы: настройки группы (название, код, год, поток, семестр, курс, архивация). */
import { Loader2, UserCheck } from "lucide-react";
import type { GroupsGroupRow } from "@/components/admin/panels/model";

export function GroupsSettingsSection({
  selected,
  form,
  onForm,
  busy,
  onSave,
  onToggleArchive,
}: {
  selected: GroupsGroupRow;
  form: { name: string; code: string; admission_year: string; stream: string; semester: string; course_number: string };
  onForm: (updater: (f: { name: string; code: string; admission_year: string; stream: string; semester: string; course_number: string }) => { name: string; code: string; admission_year: string; stream: string; semester: string; course_number: string }) => void;
  busy: string;
  onSave: () => void;
  onToggleArchive: (active: boolean) => void;
}) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Настройки группы</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-slate-500">Название
          <input value={form.name} onChange={(e) => onForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Код
          <input value={form.code} onChange={(e) => onForm((f) => ({ ...f, code: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Год поступления
          <input value={form.admission_year} onChange={(e) => onForm((f) => ({ ...f, admission_year: e.target.value }))} inputMode="numeric" placeholder="2025" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Поток
          <input value={form.stream} onChange={(e) => onForm((f) => ({ ...f, stream: e.target.value }))} placeholder="01" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Курс (ручной)
          <input value={form.course_number} onChange={(e) => onForm((f) => ({ ...f, course_number: e.target.value }))} inputMode="numeric" placeholder="авто от года" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Семестр (вручную)
          <input value={form.semester} onChange={(e) => onForm((f) => ({ ...f, semester: e.target.value }))} inputMode="numeric" placeholder="авто" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSave} disabled={busy === "save"} className="btn-primary inline-flex items-center gap-2 text-sm">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Сохранить
        </button>
        {selected.is_active === false ? (
          <button type="button" onClick={() => onToggleArchive(true)} disabled={busy === "archive"} className="rounded-xl border px-3 py-2 text-sm">
            Вернуть из архива
          </button>
        ) : (
          <button type="button" onClick={() => onToggleArchive(false)} disabled={busy === "archive"} className="rounded-xl border px-3 py-2 text-sm text-[var(--status-warn-fg)]">
            Архивировать
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Курс считается автоматически от года поступления (сентябрь — граница); «Курс (ручной)» и «Семестр» — точечные перекрытия.
      </p>
    </section>
  );
}
