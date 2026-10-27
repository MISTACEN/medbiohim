"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, adminListUsers, adminSetUserRole, hasToken, listGroups } from "@/lib/api";

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

/** Пользователи: роли + учебная группа/семестр (вынесено из старого /admin). */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { groupId: string; semester: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function msg(err = "", good = "") { setError(err); setOk(good); }

  async function load() {
    const [u, g] = await Promise.all([adminListUsers(), listGroups()]);
    if (g.ok) setGroups(g.data.items as Group[]);
    else msg(g.error.message);
    if (!u.ok) return msg(u.error.message);
    const list = (u.data.items || []) as AdminUser[];
    setUsers(list);
    const next: Record<string, { groupId: string; semester: string }> = {};
    list.forEach((x) => { next[x.id] = { groupId: String(x.group_id || ""), semester: String(x.semester || 3) }; });
    setDrafts(next);
  }

  useEffect(() => { void load(); }, []);

  async function saveAcademic(user: AdminUser) {
    const draft = drafts[user.id] || { groupId: "", semester: "3" };
    if (!draft.groupId) return msg("Выберите группу");
    setSaving((x) => ({ ...x, [user.id]: true }));
    const r = await api(`/admin/users/${user.id}/academic`, { method: "PUT", body: JSON.stringify({ group_id: draft.groupId, semester: Number(draft.semester) || 3 }) });
    setSaving((x) => ({ ...x, [user.id]: false }));
    if (!r.ok) return msg(r.error.message);
    msg("", "Учебная группа сохранена");
    await load();
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Пользователи и роли</h1>
        <p className="page-subtitle">Группа, семестр и роли для каждого пользователя · {users.length}</p>
      </header>
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {ok && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</div>}

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
                  <div className="mt-1 text-xs text-slate-500">Роли: {(u.roles || []).join(", ") || "student"}</div>
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
                {["student", "teacher", "moderator", "admin"].map((role) => (
                  <button
                    type="button"
                    key={role}
                    className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    onClick={async () => {
                      const r = await adminSetUserRole(u.id, role, "assign");
                      if (!r.ok) return msg(r.error.message);
                      setUsers((prev) => prev.map((z) => (z.id === u.id ? { ...z, roles: r.data.roles } : z)));
                      msg("", `${role} назначена: ${u.email}`);
                    }}
                  >
                    +{role}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {users.length === 0 && <div className="card text-sm text-slate-500">Пользователей пока нет.</div>}
      </div>
    </div>
  );
}
