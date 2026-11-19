"use client";

import { UserMinus, UserPlus } from "lucide-react";

import type { Member } from "./model";

type Props = {
  id: string;
  list: Member[] | undefined;
  membersBusy: string | null;
  activeGroups: Array<{ id: string; name?: string; code?: string }>;
  onMove: (m: Member, target: string) => void;
  onRemove: (m: Member) => void;
  addEmail: Record<string, string>;
  setAddEmail: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onAdd: (e: React.FormEvent) => void;
};

/** Раскрытый состав группы: список студентов, перевод, удаление, добавление по email. */
export function GroupMembersList({ id, list, membersBusy, activeGroups, onMove, onRemove, addEmail, setAddEmail, onAdd }: Props) {
  return (
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
                await onMove(m, target);
              }}
            >
              <option value="">Перевести в…</option>
              {activeGroups.filter((other) => String(other.id) !== id).map((other) => (
                <option key={other.id} value={String(other.id)}>{other.name || other.code}</option>
              ))}
            </select>
            <button type="button" className="inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs text-[var(--status-critical-fg)] hover:bg-[var(--status-critical-bg)]" onClick={() => void onRemove(m)}><UserMinus className="h-3.5 w-3.5" />Убрать</button>
          </div>
        </div>
      ))}
      {list && list.length === 0 && <div className="text-xs text-slate-500">В группе пока никого нет.</div>}
      <form className="flex gap-2 border-t pt-2" onSubmit={onAdd}>
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
  );
}
