"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { createGroup, createSubject, deleteGroup, deleteSubject, hasToken, listGroups, listSubjects, updateGroup, updateSubject } from "@/lib/api";

type Subject = { id: string; name?: string; course_number?: number; semester?: number };
type Group = { id: string; name?: string; code?: string; course_number?: number };

/** Предметы и учебные группы — вынесено из старого /admin. */
export default function AdminAcademicPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [subjectForm, setSubjectForm] = useState({ name: "", course: "2", semester: "3" });
  const [groupForm, setGroupForm] = useState({ name: "", code: "", course: "2" });
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubject, setEditingSubject] = useState({ name: "", course: "2", semester: "3" });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState({ name: "", code: "", course: "2" });
  const [busy, setBusy] = useState(false);

  function msg(err = "", good = "") { setError(err); setOk(good); }

  async function load() {
    const [g, s] = await Promise.all([listGroups(), listSubjects()]);
    if (g.ok) setGroups(g.data.items as Group[]);
    else msg(g.error.message);
    if (s.ok) setSubjects(s.data.items as Subject[]);
    else msg(s.error.message);
  }

  useEffect(() => { void load(); }, []);

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Предметы и группы</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Предметы и группы</h1>
        <p className="page-subtitle">Дисциплины, курс и семестр; учебные группы студентов.</p>
      </header>
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {ok && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4">
          <form
            className="card space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await createSubject({ name: subjectForm.name.trim(), course_number: Number(subjectForm.course) || 1, semester: Number(subjectForm.semester) || 1 });
              setBusy(false);
              if (!r.ok) return msg(r.error.message);
              setSubjectForm({ ...subjectForm, name: "" });
              msg("", "Предмет создан");
              await load();
            }}
          >
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
            <h2 className="mb-2 font-bold">Предметы · {subjects.length}</h2>
            <div className="divide-y">
              {subjects.map((s) => (editingSubjectId === String(s.id) ? (
                <div key={s.id} className="space-y-2 py-3">
                  <input value={editingSubject.name} onChange={(e) => setEditingSubject({ ...editingSubject, name: e.target.value })} className="w-full rounded-xl border px-3 py-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min={1} max={6} value={editingSubject.course} onChange={(e) => setEditingSubject({ ...editingSubject, course: e.target.value })} className="rounded-xl border px-3 py-2" />
                    <input type="number" min={1} max={12} value={editingSubject.semester} onChange={(e) => setEditingSubject({ ...editingSubject, semester: e.target.value })} className="rounded-xl border px-3 py-2" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={async () => {
                      const r = await updateSubject(String(s.id), { name: editingSubject.name.trim(), course_number: Number(editingSubject.course) || 1, semester: Number(editingSubject.semester) || 1 });
                      if (!r.ok) return msg(r.error.message);
                      setEditingSubjectId(null);
                      msg("", "Предмет обновлён");
                      await load();
                    }}><Save className="h-4 w-4" />Сохранить</button>
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
                    <button type="button" className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" title="Редактировать" onClick={() => {
                      setEditingSubjectId(String(s.id));
                      setEditingSubject({ name: String(s.name || ""), course: String(s.course_number || 1), semester: String(s.semester || 1) });
                    }}><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg border p-2 text-rose-600 hover:bg-rose-50" title="Удалить" onClick={async () => {
                      if (!window.confirm(`Удалить предмет «${s.name}»?`)) return;
                      const r = await deleteSubject(String(s.id));
                      if (!r.ok) return msg(r.error.message);
                      msg("", "Предмет удалён");
                      await load();
                    }}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )))}
              {subjects.length === 0 && <div className="py-3 text-sm text-slate-500">Предметов пока нет.</div>}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <form
            className="card space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await createGroup({ name: groupForm.name.trim(), code: groupForm.code.trim(), course_number: Number(groupForm.course) || 1 });
              setBusy(false);
              if (!r.ok) return msg(r.error.message);
              setGroupForm({ ...groupForm, name: "", code: "" });
              msg("", "Группа создана");
              await load();
            }}
          >
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
            <h2 className="mb-2 font-bold">Группы · {groups.length}</h2>
            <div className="divide-y">
              {groups.map((g) => (editingGroupId === String(g.id) ? (
                <div key={g.id} className="space-y-2 py-3">
                  <input value={editingGroup.name} onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })} className="w-full rounded-xl border px-3 py-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={editingGroup.code} onChange={(e) => setEditingGroup({ ...editingGroup, code: e.target.value })} placeholder="Код" className="rounded-xl border px-3 py-2" />
                    <input type="number" min={1} max={6} value={editingGroup.course} onChange={(e) => setEditingGroup({ ...editingGroup, course: e.target.value })} placeholder="Курс" className="rounded-xl border px-3 py-2" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={async () => {
                      const r = await updateGroup(String(g.id), { name: editingGroup.name.trim(), code: editingGroup.code.trim(), course_number: Number(editingGroup.course) || 1 });
                      if (!r.ok) return msg(r.error.message);
                      setEditingGroupId(null);
                      msg("", "Группа обновлена");
                      await load();
                    }}><Save className="h-4 w-4" />Сохранить</button>
                    <button type="button" className="btn-secondary inline-flex items-center gap-1" onClick={() => setEditingGroupId(null)}><X className="h-4 w-4" />Отмена</button>
                  </div>
                </div>
              ) : (
                <div key={g.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <b>{g.name}</b>
                    {g.code && <span className="ml-2 text-slate-400">{g.code}</span>}
                    {g.course_number && <span className="ml-2 text-slate-400">· {g.course_number} курс</span>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" title="Редактировать" onClick={() => {
                      setEditingGroupId(String(g.id));
                      setEditingGroup({ name: String(g.name || ""), code: String(g.code || ""), course: String(g.course_number || 1) });
                    }}><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg border p-2 text-rose-600 hover:bg-rose-50" title="Удалить" onClick={async () => {
                      if (!window.confirm(`Удалить группу «${g.name}»?`)) return;
                      const r = await deleteGroup(String(g.id));
                      if (!r.ok) return msg(r.error.message);
                      msg("", "Группа удалена");
                      await load();
                    }}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )))}
              {groups.length === 0 && <div className="py-3 text-sm text-slate-500">Групп пока нет.</div>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
