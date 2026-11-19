"use client";

/**
 * Данные и действия страницы «Предметы и группы»: справочники с архивом,
 * редактирование, состав групп. Вынесено из старого /admin.
 * Разметка — в компонентах `AcademicSubjectPanel` и `AcademicGroupPanel`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { addGroupMember, createGroup, createSubject, deleteGroup, deleteSubject, groupMembers, listGroups, listSubjectsAdmin, removeGroupMember, updateGroup, updateSubject } from "@/lib/api";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { describeApiError } from "@/lib/errors";
import { isActive, type Group, type Member, type Subject } from "./model";

export type AcademicAdminController = ReturnType<typeof useAcademicAdmin>;

export function useAcademicAdmin() {
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

  const msg = useCallback((err = "", good = "") => { setError(err); setOk(good); }, []);

  const load = useCallback(async () => {
    // Справочники тянем вместе с архивом: иначе «удалено» нельзя ни проверить,
    // ни отменить — строка просто исчезала из выдачи.
    const [g, s] = await Promise.all([listGroups(true), listSubjectsAdmin()]);
    if (g.ok) setGroups((g.data.items || []) as Group[]);
    else msg(describeApiError(g.error));
    if (s.ok) setSubjects((s.data.items || []) as Subject[]);
    else msg(describeApiError(s.error));
  }, [msg]);

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

  useEffect(() => { void load(); }, [load]);

  const activeGroups = useMemo(() => groups.filter(isActive), [groups]);
  const archivedGroups = useMemo(() => groups.filter((g) => !isActive(g)), [groups]);
  const activeSubjects = useMemo(() => subjects.filter(isActive), [subjects]);
  const archivedSubjects = useMemo(() => subjects.filter((s) => !isActive(s)), [subjects]);
  const filteredSubjects = useMemo(() => {
    const q = subjectFilter.trim().toLowerCase();
    if (!q) return activeSubjects;
    return activeSubjects.filter((s) => String(s.name || "").toLowerCase().includes(q));
  }, [activeSubjects, subjectFilter]);

  // --- Предметы ---

  async function createSubjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await createSubject({ name: subjectForm.name.trim(), course_number: Number(subjectForm.course) || 1, semester: Number(subjectForm.semester) || 1 });
    setBusy(false);
    if (!r.ok) return msg(describeApiError(r.error));
    setSubjectForm({ ...subjectForm, name: "" });
    msg("", "Предмет создан");
    await load();
  }

  function startSubjectEdit(s: Subject) {
    setEditingSubjectId(String(s.id));
    setEditingSubject({ name: String(s.name || ""), course: String(s.course_number || 1), semester: String(s.semester || 1) });
  }

  async function saveSubjectEdit(s: Subject) {
    const r = await updateSubject(String(s.id), { name: editingSubject.name.trim(), course_number: Number(editingSubject.course) || 1, semester: Number(editingSubject.semester) || 1 });
    if (!r.ok) return msg(describeApiError(r.error));
    setEditingSubjectId(null);
    msg("", "Предмет обновлён");
    await load();
  }

  async function deleteSubjectAction(s: Subject) {
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
  }

  async function restoreSubject(s: Subject) {
    const r = await updateSubject(String(s.id), { is_active: true });
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Предмет восстановлен");
    await load();
  }

  // --- Группы и состав ---

  async function createGroupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await createGroup({ name: groupForm.name.trim(), code: groupForm.code.trim(), course_number: Number(groupForm.course) || 1 });
    setBusy(false);
    if (!r.ok) return msg(describeApiError(r.error));
    setGroupForm({ ...groupForm, name: "", code: "" });
    msg("", "Группа создана");
    await load();
  }

  function startGroupEdit(g: Group) {
    setEditingGroupId(String(g.id));
    setEditingGroup({ name: String(g.name || ""), code: String(g.code || ""), course: String(g.course_number || 1) });
  }

  async function saveGroupEdit(id: string) {
    const r = await updateGroup(id, { name: editingGroup.name.trim(), code: editingGroup.code.trim(), course_number: Number(editingGroup.course) || 1 });
    if (!r.ok) return msg(describeApiError(r.error));
    setEditingGroupId(null);
    msg("", "Группа обновлена");
    await load();
  }

  async function deleteGroupAction(g: Group) {
    const id = String(g.id);
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
  }

  async function restoreGroup(g: Group) {
    const r = await updateGroup(String(g.id), { is_active: true });
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Группа восстановлена");
    await load();
  }

  async function moveMember(groupId: string, m: Member, target: string) {
    if (!target) return;
    const r = await addGroupMember(target, { user_id: m.user_id });
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Студент переведён в другую группу");
    await Promise.all([loadMembers(groupId), target !== groupId ? loadMembers(target) : Promise.resolve()]);
    await load();
  }

  async function removeMember(groupId: string, m: Member) {
    const r = await removeGroupMember(groupId, m.user_id);
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Студент убран из группы");
    await loadMembers(groupId);
    await load();
  }

  async function addMemberSubmit(groupId: string, e: React.FormEvent) {
    e.preventDefault();
    const email = String(addEmail[groupId] || "").trim();
    if (!email) return;
    const r = await addGroupMember(groupId, { email });
    if (!r.ok) return msg(describeApiError(r.error));
    setAddEmail((prev) => ({ ...prev, [groupId]: "" }));
    msg("", "Студент добавлен в группу");
    await loadMembers(groupId);
    await load();
  }

  return {
    groups, subjects, error, ok,
    subjectForm, setSubjectForm, groupForm, setGroupForm,
    editingSubjectId, setEditingSubjectId, editingSubject, setEditingSubject,
    editingGroupId, setEditingGroupId, editingGroup, setEditingGroup,
    busy,
    showArchivedSubjects, setShowArchivedSubjects,
    showArchivedGroups, setShowArchivedGroups,
    subjectFilter, setSubjectFilter,
    openGroupId, members, membersBusy, addEmail, setAddEmail,
    activeGroups, archivedGroups, activeSubjects, archivedSubjects, filteredSubjects,
    load, loadMembers, toggleMembers,
    createSubjectSubmit, startSubjectEdit, saveSubjectEdit, deleteSubjectAction, restoreSubject,
    createGroupSubmit, startGroupEdit, saveGroupEdit, deleteGroupAction, restoreGroup,
    moveMember, removeMember, addMemberSubmit,
    confirm, dialog,
  };
}
