"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, adminListUsers, adminSetUserRole, hasToken, listGroups } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";

type AdminUser = {
  id: string;
  email?: string;
  full_name?: string;
  roles?: string[];
  group_id?: string | null;
  group_name?: string | null;
  group_code?: string | null;
  course_number?: number | null;
  semester?: number | null;
};
type Group = { id: string; name?: string; code?: string; course_number?: number };

const ROLES = ["student", "teacher", "moderator", "admin"] as const;
const ROLE_LABEL: Record<string, string> = {
  student: "Студент",
  teacher: "Преподаватель",
  moderator: "Модератор",
  admin: "Администратор",
};
const PAGE_SIZE = 50;

/** Пользователи: поиск, фильтры, роли, учебная группа/семестр. */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
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
      adminListUsers({ q: search || undefined, role: role || undefined, groupId: groupId || undefined, limit: PAGE_SIZE, offset: nextOffset }),
      nextOffset === 0 ? listGroups() : Promise.resolve(null),
    ]);
    setLoading(false);
    if (g) {
      if (g.ok) setGroups(g.data.items as Group[]);
      else msg(describeApiError(g.error));
    }
    if (!u.ok) return msg(describeApiError(u.error));
    const list = (u.data.items || []) as AdminUser[];
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

  async function saveAcademic(user: AdminUser) {
    const draft = drafts[user.id] || { groupId: "", semester: "3" };
    if (!draft.groupId) return msg("Выберите группу");
    setSaving((x) => ({ ...x, [user.id]: true }));
    const r = await api(`/admin/users/${user.id}/academic`, { method: "PUT", body: JSON.stringify({ group_id: draft.groupId, semester: Number(draft.semester) || 3 }) });
    setSaving((x) => ({ ...x, [user.id]: false }));
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Учебная группа сохранена");
    await load(applied, roleFilter, groupFilter, offset);
  }

  async function toggleRole(user: AdminUser, role: string) {
    const action = (user.roles || []).includes(role) ? "revoke" : "assign";
    if (action === "revoke") {
      const agreed = await confirm({
        title: `Снять роль «${ROLE_LABEL[role] || role}»?`,
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

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Пользователи</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const shown = users.length;
  const hasPrev = offset > 0;
  const hasNext = offset + shown < total;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Пользователи и роли</h1>
        <p className="page-subtitle">
          Поиск по почте и имени, фильтры по роли и группе · всего {total}
        </p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {ok && <div className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]">{ok}</div>}

      <form onSubmit={applyFilters} className="card grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_200px_auto]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Почта или ФИО"
          aria-label="Поиск пользователя"
          className="rounded-xl border px-3 py-2 text-sm"
        />
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); void load(applied, e.target.value, groupFilter, 0); }} aria-label="Фильтр по роли" className="rounded-xl border px-3 py-2 text-sm">
          <option value="">Все роли</option>
          {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
        </select>
        <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); void load(applied, roleFilter, e.target.value, 0); }} aria-label="Фильтр по группе" className="rounded-xl border px-3 py-2 text-sm">
          <option value="">Все группы</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.code}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={loading}>{loading ? "Ищем…" : "Найти"}</button>
          <button type="button" className="btn-secondary" onClick={resetFilters} disabled={loading}>Сброс</button>
        </div>
      </form>

      <div className="space-y-3">
        {users.map((u) => {
          const draft = drafts[u.id] || { groupId: String(u.group_id || ""), semester: String(u.semester || 3) };
          const selectedGroup = groups.find((g) => String(g.id) === draft.groupId);
          return (
            <div key={u.id} className="card text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <b>{u.full_name || u.email}</b>
                  <div className="text-xs text-slate-500">{u.email}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Роли: {(u.roles || []).map((role) => ROLE_LABEL[role] || role).join(", ") || "студент по умолчанию"}
                  </div>
                </div>
                <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                  {selectedGroup?.course_number ?? u.course_number ?? "—"} курс
                </div>
              </div>

              <div className="mt-3 grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto]">
                <label className="text-xs font-semibold text-slate-500">Группа
                  <select value={draft.groupId} onChange={(e) => setDrafts((x) => ({ ...x, [u.id]: { ...draft, groupId: e.target.value } }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                    <option value="">Не назначена</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.code}{g.course_number ? ` · ${g.course_number} курс` : ""}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">Семестр
                  <select value={draft.semester} onChange={(e) => setDrafts((x) => ({ ...x, [u.id]: { ...draft, semester: e.target.value } }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <button type="button" disabled={!!saving[u.id] || !draft.groupId} onClick={() => void saveAcademic(u)} className="btn-primary whitespace-nowrap disabled:opacity-50">
                  {saving[u.id] ? "Сохранение…" : "Сохранить группу"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {ROLES.map((role) => {
                  const assigned = (u.roles || []).includes(role);
                  const busy = !!saving[`${u.id}:${role}`];
                  return (
                    <button
                      type="button"
                      key={role}
                      disabled={busy}
                      aria-pressed={assigned}
                      title={assigned ? "Нажмите, чтобы снять роль" : "Нажмите, чтобы назначить роль"}
                      className={`rounded-lg border px-2 py-1 text-xs disabled:opacity-50 ${assigned ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "bg-white hover:bg-slate-50"}`}
                      onClick={() => void toggleRole(u, role)}
                    >
                      {assigned ? `− ${ROLE_LABEL[role]}` : `+ ${ROLE_LABEL[role]}`}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!loading && users.length === 0 && (
          <div className="card text-sm text-slate-500">
            {applied || roleFilter || groupFilter ? "Никого не нашли — измените фильтры." : "Пользователей пока нет."}
          </div>
        )}
      </div>

      {dialog}

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">
            {offset + 1}–{offset + shown} из {total}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!hasPrev || loading} onClick={() => void load(applied, roleFilter, groupFilter, Math.max(offset - PAGE_SIZE, 0))}>
              Назад
            </button>
            <button type="button" className="btn-secondary" disabled={!hasNext || loading} onClick={() => void load(applied, roleFilter, groupFilter, offset + PAGE_SIZE)}>
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
