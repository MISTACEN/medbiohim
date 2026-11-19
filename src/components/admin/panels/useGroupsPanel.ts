"use client";

/**
 * Полное управление группой: состояние и действия — участники конкретной
 * группы, добавление по email, роль (староста/студент), название, код, год
 * поступления, поток, семестр, курс, архивация.
 *
 * Права на сервере: манипуляции — только admin/moderator/teacher (groups.ts
 * MANAGERS); роль назначает staff. Фронт только скрывает кнопки.
 */
import { useCallback, useEffect, useState } from "react";
import {
  listGroups,
  groupMembers,
  addGroupMember,
  removeGroupMember,
  patchGroup,
  patchGroupMember,
  createGroup,
  hasToken,
} from "@/lib/api";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { describeApiError } from "@/lib/errors";
import { type GroupsGroupRow, type GroupsMemberRow } from "@/components/admin/panels/model";

export function useGroupsPanel() {
  const { confirm, dialog } = useConfirm();
  const [groups, setGroups] = useState<GroupsGroupRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [members, setMembers] = useState<GroupsMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [addEmail, setAddEmail] = useState("");
  const [newGroup, setNewGroup] = useState("");
  // Активность группы — НЕ часть формы сохранения: снятый галочкой чекбокс
  // молча архивировал группу «при редактировании» и она исчезала из списков.
  // Архивация — отдельная кнопка с подтверждением.
  const [form, setForm] = useState({ name: "", code: "", admission_year: "", stream: "", semester: "", course_number: "" });

  const selected = groups.find((g) => g.id === selectedId) || null;

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listGroups();
      if (res.ok) {
        const items = (res.data?.items || []) as GroupsGroupRow[];
        setGroups(items);
        setSelectedId((current) => current || items[0]?.id || "");
      } else setError(describeApiError(res.error));
    } catch { setError("Не удалось загрузить группы."); }
    setLoading(false);
  }, []);

  const loadMembers = useCallback(async (groupId: string) => {
    if (!groupId) { setMembers([]); return; }
    try {
      const res = await groupMembers(groupId);
      if (res.ok) setMembers((res.data?.items || []) as GroupsMemberRow[]);
      else setError(describeApiError(res.error));
    } catch { setError("Не удалось загрузить состав."); }
  }, []);

  useEffect(() => { if (hasToken()) void loadGroups(); else setLoading(false); }, [loadGroups]);
  useEffect(() => {
    setError(null); setNote(null);
    void loadMembers(selectedId);
    const g = groups.find((x) => x.id === selectedId);
    setForm({
      name: g?.name || "", code: g?.code || "",
      admission_year: g?.admission_year != null ? String(g.admission_year) : "",
      stream: g?.stream || "", semester: g?.semester != null ? String(g.semester) : "",
      course_number: g?.course_number != null ? String(g.course_number) : "",
    });
  }, [selectedId, groups, loadMembers]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: { code: string }; data?: unknown }>, success: string, reloadMembers = true) {
    setBusy(key); setError(null); setNote(null);
    try {
      const res = await fn();
      if (!res.ok) { setError(describeApiError(res.error)); return false; }
      setNote(success);
      if (reloadMembers) await loadMembers(selectedId);
      await loadGroups();
      return true;
    } finally { setBusy(""); }
  }

  async function addMember() {
    if (!addEmail.trim()) return;
    const done = await run("add", () => addGroupMember(selectedId, { email: addEmail.trim() }), `Добавлен: ${addEmail.trim()}`);
    if (done) setAddEmail("");
  }

  async function saveGroup() {
    // is_active намеренно не отправляется: сохранение настроек не должно
    // уметь архивировать группу (см. заметку над form).
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      code: form.code.trim() || null,
    };
    if (form.admission_year.trim()) payload.admission_year = Number(form.admission_year); else payload.admission_year = null;
    if (form.stream.trim()) payload.stream = form.stream.trim(); else payload.stream = null;
    if (form.semester.trim()) payload.semester = Number(form.semester); else payload.semester = null;
    if (form.course_number.trim()) payload.course_number = Number(form.course_number); else payload.course_number = null;
    await run("save", () => patchGroup(selectedId, payload), "Группа обновлена.", false);
  }

  async function toggleArchive(active: boolean) {
    const label = selected ? `«${selected.code || selected.name}»` : "группу";
    const agreed = active
      ? await confirm({ title: `Вернуть группу ${label} из архива?`, confirmLabel: "Вернуть" })
      : await confirm({
          title: `Архивировать группу ${label}?`,
          description: "Она исчезнет из списков, участники сохранятся.",
          confirmLabel: "Архивировать",
          danger: true,
        });
    if (!agreed) return;
    await run("archive", () => patchGroup(selectedId, { is_active: active }),
      active ? "Группа возвращена из архива." : "Группа архивирована — участники сохранены.", false);
  }

  async function createNewGroup() {
    if (!newGroup.trim()) return;
    const done = await run("create", () => createGroup({ name: newGroup.trim(), is_active: true }), `Группа «${newGroup.trim()}» создана`);
    if (done) setNewGroup("");
  }

  async function setRole(member: GroupsMemberRow, role: "starosta" | "student") {
    await run(`role-${member.user_id}`, () => patchGroupMember(selectedId, member.user_id, { role_in_group: role }),
      role === "starosta" ? `${member.name} — староста` : `${member.name} — студент`);
  }

  async function remove(member: GroupsMemberRow) {
    await run(`remove-${member.user_id}`, () => removeGroupMember(selectedId, member.user_id), `${member.name} убран из группы`);
  }

  return {
    groups, selectedId, setSelectedId, selected,
    members, loading, busy, note, error,
    addEmail, setAddEmail, newGroup, setNewGroup,
    form, setForm,
    dialog,
    loadGroups, addMember, saveGroup, toggleArchive, createNewGroup, setRole, remove,
  };
}
