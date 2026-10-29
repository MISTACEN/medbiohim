"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  addGroupMember,
  createGroup,
  createSubject,
  deleteGroup,
  deleteSubject,
  groupMembers,
  hasToken,
  listGroups,
  listSubjectsAdmin,
  removeGroupMember,
  updateGroup,
  updateSubject,
} from "@/lib/api";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { describeApiError } from "@/lib/errors";

type Subject = { id: string; name?: string; course_number?: number; semester?: number; is_active?: boolean };
type Group = { id: string; name?: string; code?: string; course_number?: number; is_active?: boolean; member_count?: number };
type Member = { user_id: string; name?: string; email?: string; course_number?: number; semester?: number };

function isActive(row: { is_active?: boolean }) {
  return row.is_active !== false;
}

/** Предметы и учебные группы — вынесено из старого /admin. */
export default function AdminAcademicPage() {
  const { confirm, dialog } = useConfirm();
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
  const [showArchivedSubjects, setShowArchivedSubjects] = useState(false);
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [membersBusy, setMembersBusy] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState<Record<string, string>>({});

  function msg(err = "", good = "") { setError(err); setOk(good); }

  async function load() {
    // Справочники тянем вместе с архивом: иначе «удалено» нельзя ни проверить,
    // ни отменить — строка просто исчезала из выдачи.
    const [g, s] = await Promise.all([listGroups(true), listSubjectsAdmin()]);
    if (g.ok) setGroups((g.data.items || []) as Group[]);
    else msg(describeApiError(g.error));
    if (s.ok) setSubjects((s.data.items || []) as Subject[]);
    else msg(describeApiError(s.error));
  }

  async function loadMembers(groupId: string) {
    setMembersBusy(groupId);
    const r = await groupMembers(groupId);
    setMembersBusy(null);
    if (!r.ok) return msg(describeApiError(r.error));
    setMembers((prev) => ({ ...prev, [groupId]: (r.data.items || []) as Member[] }));
  }

  async function toggleMembers(groupId: string) {
    if (openGroupId === groupId) { setOpenGroupId(null); return; }
    setOpenGroupId(groupId);
    if (!members[groupId]) await loadMembers(groupId);
  }

  useEffect(() => { void load(); }, []);

  const activeGroups = useMemo(() => groups.filter(isActive), [groups]);
  const archivedGroups = useMemo(() => groups.filter((g) => !isActive(g)), [groups]);
  const activeSubjects = useMemo(() => subjects.filter(isActive), [subjects]);
  const archivedSubjects = useMemo(() => subjects.filter((s) => !isActive(s)), [subjects]);
  const filteredSubjects = useMemo(() => {
    const q = subjectFilter.trim().toLowerCase();
    if (!q) return activeSubjects;
    return activeSubjects.filter((s) => String(s.name || "").toLowerCase().includes(q));
  }, [activeSubjects, subjectFilter]);

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
        <p className="page-subtitle">
          Дисциплины, курс и семестр; учебные группы и их состав. Курс и семестр конкретного студента —{" "}
          <Link href="/admin/users" className="text-indigo-600 underline">в разделе «Пользователи»</Link>.
        </p>
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
              if (!r.ok) return msg(describeApiError(r.error));
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
                    <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={async () => {
                      const r = await updateSubject(String(s.id), { name: editingSubject.name.trim(), course_number: Number(editingSubject.course) || 1, semester: Number(editingSubject.semester) || 1 });
                      if (!r.ok) return msg(describeApiError(r.error));
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
                      const agreed = await confirm({
                        title: "Удалить предмет?",
                        description: `«${String(s.name || "")}» — связанные модули, темы и материалы станут недоступны. Строку можно вернуть из архива.`,
                        confirmLabel: "Удалить",
                        danger: true,
                      });
                      if (!agreed) return;
                      const r = await deleteSubject(String(s.id));
                      if (!r.ok) return msg(describeApiError(r.error));
                      msg("", `Предмет удалён${r.data?.archived > 1 ? ` (строк: ${r.data.archived})` : ""}`);
                      await load();
                    }}><Trash2 className="h-4 w-4" /></button>
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
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50" onClick={async () => {
                          const r = await updateSubject(String(s.id), { is_active: true });
                          if (!r.ok) return msg(describeApiError(r.error));
                          msg("", "Предмет восстановлен");
                          await load();
                        }}><ArchiveRestore className="h-4 w-4" />Вернуть</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              if (!r.ok) return msg(describeApiError(r.error));
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
                            <input type="number" min={1} max={6} value={editingGroup.course} onChange={(e) => setEditingGroup({ ...editingGroup, course: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={async () => {
                            const r = await updateGroup(id, { name: editingGroup.name.trim(), code: editingGroup.code.trim(), course_number: Number(editingGroup.course) || 1 });
                            if (!r.ok) return msg(describeApiError(r.error));
                            setEditingGroupId(null);
                            msg("", "Группа обновлена");
                            await load();
                          }}><Save className="h-4 w-4" />Сохранить</button>
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
                          <button type="button" className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" title="Редактировать" onClick={() => {
                            setEditingGroupId(id);
                            setEditingGroup({ name: String(g.name || ""), code: String(g.code || ""), course: String(g.course_number || 1) });
                          }}><Pencil className="h-4 w-4" /></button>
                          <button type="button" className="rounded-lg border p-2 text-rose-600 hover:bg-rose-50" title="Удалить" onClick={async () => {
                            const agreed = await confirm({
                              title: "Удалить группу?",
                              description: `«${String(g.name || "")}» — группа исчезнет из справочника. Студенты сначала должны быть переведены или убраны.`,
                              confirmLabel: "Удалить",
                              danger: true,
                            });
                            if (!agreed) return;
                            const r = await deleteGroup(id);
                            if (!r.ok) {
                              msg(describeApiError(r.error));
                              setOpenGroupId(id);
                              await loadMembers(id);
                              return;
                            }
                            msg("", r.data?.mode === "archived" ? "Группа отправлена в архив" : "Группа удалена");
                            setOpenGroupId(null);
                            setMembers((prev) => { const next = { ...prev }; delete next[id]; return next; });
                            await load();
                          }}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    )}

                    {open && (
                      <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3">
                        {membersBusy === id && !list && <div className="text-xs text-slate-500">Загружаем состав…</div>}
                        {(list || []).map((m) => (
                          <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div>
                              <b>{m.name}</b>
                              {m.email && <div className="text-xs text-slate-500">{m.email}</div>}
                              {(m.course_number || m.semester) && (
                                <div className="text-xs text-slate-400">{[m.course_number && `${m.course_number} курс`, m.semester && `${m.semester} сем`].filter(Boolean).join(" · ")}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                className="rounded-lg border bg-white px-2 py-1 text-xs"
                                value=""
                                onChange={async (e) => {
                                  const target = e.target.value;
                                  if (!target) return;
                                  const r = await addGroupMember(target, { user_id: m.user_id });
                                  if (!r.ok) return msg(describeApiError(r.error));
                                  msg("", "Студент переведён в другую группу");
                                  await Promise.all([loadMembers(id), target !== id ? loadMembers(target) : Promise.resolve()]);
                                  await load();
                                }}
                              >
                                <option value="">Перевести в…</option>
                                {activeGroups.filter((other) => String(other.id) !== id).map((other) => (
                                  <option key={other.id} value={String(other.id)}>{other.name || other.code}</option>
                                ))}
                              </select>
                              <button type="button" className="inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50" onClick={async () => {
                                const r = await removeGroupMember(id, m.user_id);
                                if (!r.ok) return msg(describeApiError(r.error));
                                msg("", "Студент убран из группы");
                                await loadMembers(id);
                                await load();
                              }}><UserMinus className="h-3.5 w-3.5" />Убрать</button>
                            </div>
                          </div>
                        ))}
                        {list && list.length === 0 && <div className="text-xs text-slate-500">В группе пока никого нет.</div>}
                        <form
                          className="flex gap-2 border-t pt-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const email = String(addEmail[id] || "").trim();
                            if (!email) return;
                            const r = await addGroupMember(id, { email });
                            if (!r.ok) return msg(describeApiError(r.error));
                            setAddEmail((prev) => ({ ...prev, [id]: "" }));
                            msg("", "Студент добавлен в группу");
                            await loadMembers(id);
                            await load();
                          }}
                        >
                          <input
                            value={addEmail[id] || ""}
                            onChange={(e) => setAddEmail((prev) => ({ ...prev, [id]: e.target.value }))}
                            placeholder="email студента"
                            className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs"
                          />
                          <button className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                            <UserPlus className="h-3.5 w-3.5" />Добавить
                          </button>
                        </form>
                      </div>
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
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50" onClick={async () => {
                          const r = await updateGroup(String(g.id), { is_active: true });
                          if (!r.ok) return msg(describeApiError(r.error));
                          msg("", "Группа восстановлена");
                          await load();
                        }}><ArchiveRestore className="h-4 w-4" />Вернуть</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="mt-3 flex items-center gap-1 text-xs text-slate-400"><Users className="h-3.5 w-3.5" />Состав группы меняется раскрытием строки: добавление по email, перевод и удаление.</p>
          </div>
        </section>
      </div>
      {dialog}
    </div>
  );
}
