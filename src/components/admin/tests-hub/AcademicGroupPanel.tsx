"use client";

import { ArchiveRestore, ChevronDown, ChevronRight, Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";

import { GroupMembersList } from "./GroupMembersList";
import type { AcademicAdminController } from "./useAcademicAdmin";

/** Правая колонка: форма создания группы, список с составом и архив. */
export function AcademicGroupPanel({ page }: { page: AcademicAdminController }) {
  const {
    groupForm, setGroupForm, busy, createGroupSubmit,
    activeGroups, archivedGroups, showArchivedGroups, setShowArchivedGroups, restoreGroup,
    openGroupId, members, membersBusy, addEmail, setAddEmail,
    editingGroupId, setEditingGroupId, editingGroup, setEditingGroup,
    toggleMembers, startGroupEdit, saveGroupEdit, deleteGroupAction,
    moveMember, removeMember, addMemberSubmit,
  } = page;

  return (
    <section className="space-y-4">
      <form className="card space-y-3" onSubmit={createGroupSubmit}>
        <h2 className="text-lg font-bold">Добавить группу</h2>
        <input required value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Название" className="w-full rounded-xl border px-3 py-2" />
        <div className="grid grid-cols-2 gap-2">
          <input value={groupForm.code} onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value })} placeholder="Код" className="rounded-xl border px-3 py-2" />
          <label className="text-xs font-semibold text-slate-500">Курс
            <input type="number" min={1} max={6} value={groupForm.course} onChange={(e) => setGroupForm({ ...groupForm, course: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>
        <button className="btn-primary inline-flex items-center gap-2" disabled={busy}><Plus className="h-4 w-4" />Создать</button>
      </form>

      <div className="card">
        <h2 className="mb-2 font-bold">Группы · {activeGroups.length}</h2>
        <div className="divide-y">
          {activeGroups.map((g) => {
            const id = String(g.id);
            const list = members[id];
            const open = openGroupId === id;
            const count = Number(g.member_count ?? list?.length ?? 0);
            return (
              <div key={id} className="py-2">
                {editingGroupId === id ? (
                  <div className="space-y-2 py-1">
                    <input value={editingGroup.name} onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })} className="w-full rounded-xl border px-3 py-2" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editingGroup.code} onChange={(e) => setEditingGroup({ ...editingGroup, code: e.target.value })} placeholder="Код" className="rounded-xl border px-3 py-2" />
                      <label className="text-xs font-semibold text-slate-500">Курс
                        <input type="number" min={1} max={6} value={editingGroup.course} onChange={(e) => setEditingGroup({ ...editingGroup, course: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={() => void saveGroupEdit(id)}><Save className="h-4 w-4" />Сохранить</button>
                      <button type="button" className="btn-secondary inline-flex items-center gap-1" onClick={() => setEditingGroupId(null)}><X className="h-4 w-4" />Отмена</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <b>{g.name}</b>
                      {g.code && <span className="ml-2 text-slate-400">{g.code}</span>}
                      {g.course_number && <span className="ml-2 text-slate-400">· {g.course_number} курс</span>}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${count ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                        {count} чел.
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" title="Состав группы" onClick={() => void toggleMembers(id)}>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <button type="button" className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" title="Редактировать" onClick={() => startGroupEdit(g)}><Pencil className="h-4 w-4" /></button>
                      <button type="button" className="rounded-lg border p-2 text-[var(--status-critical-fg)] hover:bg-[var(--status-critical-bg)]" title="Удалить" onClick={() => void deleteGroupAction(g)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}

                {open && (
                  <GroupMembersList
                    id={id}
                    list={list}
                    membersBusy={membersBusy}
                    activeGroups={activeGroups}
                    onMove={(m, target) => void moveMember(id, m, target)}
                    onRemove={(m) => void removeMember(id, m)}
                    addEmail={addEmail}
                    setAddEmail={setAddEmail}
                    onAdd={(e) => void addMemberSubmit(id, e)}
                  />
                )}
              </div>
            );
          })}
          {activeGroups.length === 0 && <div className="py-3 text-sm text-slate-500">Групп пока нет.</div>}
        </div>

        {archivedGroups.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600" onClick={() => setShowArchivedGroups((v) => !v)}>
              {showArchivedGroups ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Архив групп · {archivedGroups.length}
            </button>
            {showArchivedGroups && (
              <div className="mt-2 divide-y">
                {archivedGroups.map((g) => (
                  <div key={String(g.id)} className="flex items-center justify-between gap-3 py-2 text-sm text-slate-500">
                    <span className="line-through">{g.name}{g.code ? ` · ${g.code}` : ""}</span>
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-[var(--status-ok-fg)] hover:bg-[var(--status-ok-bg)]" onClick={() => void restoreGroup(g)}><ArchiveRestore className="h-4 w-4" />Вернуть</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-3 flex items-center gap-1 text-xs text-slate-400"><Users className="h-3.5 w-3.5" />Состав группы меняется раскрытием строки: добавление по email, перевод и удаление.</p>
      </div>
    </section>
  );
}
