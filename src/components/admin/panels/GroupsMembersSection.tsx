"use client";

/** Группы: участники — добавление по email, роль старосты, удаление. */
import { Loader2, Plus, UserMinus } from "lucide-react";
import type { GroupsMemberRow } from "@/components/admin/panels/model";

export function GroupsMembersSection({
  members,
  addEmail,
  onAddEmail,
  busy,
  onAdd,
  onSetRole,
  onRemove,
}: {
  members: GroupsMemberRow[];
  addEmail: string;
  onAddEmail: (value: string) => void;
  busy: string;
  onAdd: () => void;
  onSetRole: (member: GroupsMemberRow, role: "starosta" | "student") => void;
  onRemove: (member: GroupsMemberRow) => void;
}) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Участники ({members.length})</h2>
      <div className="flex gap-2">
        <input value={addEmail} onChange={(e) => onAddEmail(e.target.value)} placeholder="email студента" className="flex-1 rounded-xl border px-3 py-2 text-sm" />
        <button type="button" onClick={onAdd} disabled={busy === "add" || !addEmail.trim()} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Добавить
        </button>
      </div>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.membership_id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{m.name} {m.role === "starosta" && <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">староста</span>}</p>
              <p className="truncate text-xs text-slate-500">{m.email} · курс {m.course_number ?? "—"}</p>
            </div>
            {m.role === "starosta" ? (
              <button type="button" onClick={() => onSetRole(m, "student")} disabled={busy === `role-${m.user_id}`} className="rounded-lg border px-2 py-1 text-xs">Снять старосту</button>
            ) : (
              <button type="button" onClick={() => onSetRole(m, "starosta")} disabled={busy === `role-${m.user_id}`} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Сделать старостой</button>
            )}
            <button type="button" onClick={() => onRemove(m)} disabled={busy === `remove-${m.user_id}`} className="text-slate-400 hover:text-[var(--status-critical-fg)]" aria-label="Убрать из группы">
              {busy === `remove-${m.user_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
            </button>
          </div>
        ))}
        {members.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">Пока никого — добавьте по email.</p>}
      </div>
    </section>
  );
}
