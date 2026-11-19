"use client";

import { ArchiveRestore, ChevronDown, ChevronRight, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import type { AcademicAdminController } from "./useAcademicAdmin";

/** Левая колонка: форма создания предмета, список с поиском и архив. */
export function AcademicSubjectPanel({ page }: { page: AcademicAdminController }) {
  const {
    subjectForm, setSubjectForm, busy, createSubjectSubmit,
    subjectFilter, setSubjectFilter, activeSubjects, filteredSubjects,
    editingSubjectId, setEditingSubjectId, editingSubject, setEditingSubject,
    startSubjectEdit, saveSubjectEdit, deleteSubjectAction,
    archivedSubjects, showArchivedSubjects, setShowArchivedSubjects, restoreSubject,
  } = page;

  return (
    <section className="space-y-4">
      <form className="card space-y-3" onSubmit={createSubjectSubmit}>
        <h2 className="text-lg font-bold">Добавить предмет</h2>
        <input required value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} placeholder="Название" className="w-full rounded-xl border px-3 py-2" />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-500">Курс
            <input type="number" min={1} max={6} value={subjectForm.course} onChange={(e) => setSubjectForm({ ...subjectForm, course: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-500">Семестр
            <input type="number" min={1} max={12} value={subjectForm.semester} onChange={(e) => setSubjectForm({ ...subjectForm, semester: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>
        <button className="btn-primary inline-flex items-center gap-2" disabled={busy}><Plus className="h-4 w-4" />Создать</button>
      </form>

      <div className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Предметы · {activeSubjects.length}</h2>
          <input value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} placeholder="Поиск по названию" className="w-48 rounded-xl border px-3 py-1.5 text-sm" />
        </div>
        <div className="max-h-[30rem] divide-y overflow-y-auto">
          {filteredSubjects.map((s) => (editingSubjectId === String(s.id) ? (
            <div key={s.id} className="space-y-2 py-3">
              <input value={editingSubject.name} onChange={(e) => setEditingSubject({ ...editingSubject, name: e.target.value })} className="w-full rounded-xl border px-3 py-2" />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-500">Курс
                  <input type="number" min={1} max={6} value={editingSubject.course} onChange={(e) => setEditingSubject({ ...editingSubject, course: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="text-xs font-semibold text-slate-500">Семестр
                  <input type="number" min={1} max={12} value={editingSubject.semester} onChange={(e) => setEditingSubject({ ...editingSubject, semester: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={() => void saveSubjectEdit(s)}><Save className="h-4 w-4" />Сохранить</button>
                <button type="button" className="btn-secondary inline-flex items-center gap-1" onClick={() => setEditingSubjectId(null)}><X className="h-4 w-4" />Отмена</button>
              </div>
            </div>
          ) : (
            <div key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <b>{s.name}</b>
                {s.course_number && <span className="ml-2 text-slate-400">{s.course_number} курс</span>}
                {s.semester && <span className="ml-2 text-slate-400">· {s.semester} семестр</span>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" title="Редактировать" onClick={() => startSubjectEdit(s)}><Pencil className="h-4 w-4" /></button>
                <button type="button" className="rounded-lg border p-2 text-[var(--status-critical-fg)] hover:bg-[var(--status-critical-bg)]" title="Удалить" onClick={() => void deleteSubjectAction(s)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          )))}
          {activeSubjects.length === 0 && <div className="py-3 text-sm text-slate-500">Предметов пока нет.</div>}
          {activeSubjects.length > 0 && filteredSubjects.length === 0 && <div className="py-3 text-sm text-slate-500">Ничего не найдено по запросу.</div>}
        </div>

        {archivedSubjects.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600" onClick={() => setShowArchivedSubjects((v) => !v)}>
              {showArchivedSubjects ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Архив предметов · {archivedSubjects.length}
            </button>
            {showArchivedSubjects && (
              <div className="mt-2 max-h-64 divide-y overflow-y-auto">
                {archivedSubjects.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm text-slate-500">
                    <span className="line-through">{s.name}{s.course_number ? ` · ${s.course_number} курс` : ""}{s.semester ? ` · ${s.semester} сем` : ""}</span>
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-[var(--status-ok-fg)] hover:bg-[var(--status-ok-bg)]" onClick={() => void restoreSubject(s)}><ArchiveRestore className="h-4 w-4" />Вернуть</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
