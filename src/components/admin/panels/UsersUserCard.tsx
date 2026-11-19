"use client";

/** Пользователи: карточка пользователя — группа, семестр и роли. */
import {
  USERS_ROLES,
  USERS_ROLE_LABEL,
  type UsersAdminUser,
  type UsersGroup,
} from "@/components/admin/panels/model";

export function UsersUserCard({
  u,
  draft,
  groups,
  saving,
  onDraft,
  onSaveAcademic,
  onToggleRole,
}: {
  u: UsersAdminUser;
  draft: { groupId: string; semester: string };
  groups: UsersGroup[];
  saving: Record<string, boolean>;
  onDraft: (patch: Partial<{ groupId: string; semester: string }>) => void;
  onSaveAcademic: (user: UsersAdminUser) => void;
  onToggleRole: (user: UsersAdminUser, role: string) => void;
}) {
  const selectedGroup = groups.find((g) => String(g.id) === draft.groupId);
  return (
    <div className="card text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <b>{u.full_name || u.email}</b>
          <div className="text-xs text-slate-500">{u.email}</div>
          <div className="mt-1 text-xs text-slate-500">
            Роли: {(u.roles || []).map((role) => USERS_ROLE_LABEL[role] || role).join(", ") || "студент по умолчанию"}
          </div>
        </div>
        <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          {selectedGroup?.course_number ?? u.course_number ?? "—"} курс
        </div>
      </div>

      <div className="mt-3 grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto]">
        <label className="text-xs font-semibold text-slate-500">Группа
          <select value={draft.groupId} onChange={(e) => onDraft({ groupId: e.target.value })} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
            <option value="">Не назначена</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.code}{g.course_number ? ` · ${g.course_number} курс` : ""}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">Семестр
          <select value={draft.semester} onChange={(e) => onDraft({ semester: e.target.value })} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" disabled={!!saving[u.id] || !draft.groupId} onClick={() => onSaveAcademic(u)} className="btn-primary whitespace-nowrap disabled:opacity-50">
          {saving[u.id] ? "Сохранение…" : "Сохранить группу"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {USERS_ROLES.map((role) => {
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
              onClick={() => onToggleRole(u, role)}
            >
              {assigned ? `− ${USERS_ROLE_LABEL[role]}` : `+ ${USERS_ROLE_LABEL[role]}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
