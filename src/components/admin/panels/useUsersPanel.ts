"use client";

/** Пользователи: состояние и действия — поиск, фильтры, роли, группа/семестр. */
import { useCallback, useEffect, useState } from "react";
import { api, adminListUsers, adminSetUserRole, listGroups } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  USERS_PAGE_SIZE,
  USERS_ROLE_LABEL,
  type UsersAdminUser,
  type UsersGroup,
} from "@/components/admin/panels/model";

export function useUsersPanel() {
  const [users, setUsers] = useState<UsersAdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [groups, setGroups] = useState<UsersGroup[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { groupId: string; semester: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const { confirm, dialog } = useConfirm();

  function msg(err = "", good = "") { setError(err); setOk(good); }

  const load = useCallback(async (search: string, role: string, groupId: string, nextOffset: number) => {
    setLoading(true);
    const [u, g] = await Promise.all([
      adminListUsers({ q: search || undefined, role: role || undefined, groupId: groupId || undefined, limit: USERS_PAGE_SIZE, offset: nextOffset }),
      nextOffset === 0 ? listGroups() : Promise.resolve(null),
    ]);
    setLoading(false);
    if (g) {
      if (g.ok) setGroups(g.data.items as UsersGroup[]);
      else msg(describeApiError(g.error));
    }
    if (!u.ok) return msg(describeApiError(u.error));
    const list = (u.data.items || []) as UsersAdminUser[];
    setUsers(list);
    setTotal(Number(u.data.total ?? list.length));
    setOffset(nextOffset);
    const next: Record<string, { groupId: string; semester: string }> = {};
    list.forEach((x) => { next[x.id] = { groupId: String(x.group_id || ""), semester: String(x.semester || 3) }; });
    setDrafts(next);
  }, []);

  useEffect(() => { void load("", "", "", 0); }, [load]);

  function applyFilters(e?: React.FormEvent) {
    e?.preventDefault();
    const search = query.trim();
    setApplied(search);
    void load(search, roleFilter, groupFilter, 0);
  }

  function resetFilters() {
    setQuery("");
    setApplied("");
    setRoleFilter("");
    setGroupFilter("");
    void load("", "", "", 0);
  }

  async function saveAcademic(user: UsersAdminUser) {
    const draft = drafts[user.id] || { groupId: "", semester: "3" };
    if (!draft.groupId) return msg("Выберите группу");
    setSaving((x) => ({ ...x, [user.id]: true }));
    const r = await api(`/admin/users/${user.id}/academic`, { method: "PUT", body: JSON.stringify({ group_id: draft.groupId, semester: Number(draft.semester) || 3 }) });
    setSaving((x) => ({ ...x, [user.id]: false }));
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Учебная группа сохранена");
    await load(applied, roleFilter, groupFilter, offset);
  }

  async function toggleRole(user: UsersAdminUser, role: string) {
    const action = (user.roles || []).includes(role) ? "revoke" : "assign";
    if (action === "revoke") {
      const agreed = await confirm({
        title: `Снять роль «${USERS_ROLE_LABEL[role] || role}»?`,
        description: `${user.full_name || user.email} сразу потеряет доступ к соответствующим разделам.`,
        confirmLabel: "Снять роль",
        danger: true,
      });
      if (!agreed) return;
    }
    setSaving((x) => ({ ...x, [`${user.id}:${role}`]: true }));
    const r = await adminSetUserRole(user.id, role, action);
    setSaving((x) => ({ ...x, [`${user.id}:${role}`]: false }));
    if (!r.ok) return msg(describeApiError(r.error));
    setUsers((prev) => prev.map((z) => (z.id === user.id ? { ...z, roles: r.data.roles } : z)));
    msg("", action === "assign" ? `Роль «${role}» назначена` : `Роль «${role}» снята`);
  }

  return {
    users, total, offset, groups, drafts, setDrafts,
    saving, query, setQuery, applied, roleFilter, setRoleFilter,
    groupFilter, setGroupFilter, loading, error, ok,
    dialog, load, applyFilters, resetFilters, saveAcademic, toggleRole, msg,
  };
}
