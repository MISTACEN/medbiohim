"use client";

/**
 * Полное управление группой (запрос владельца 2026-10-31): композиция.
 * Участники, добавление по email, роль старосты, настройки и архивация.
 */
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { GroupInvites } from "@/components/admin/GroupInvites";
import { hasToken } from "@/lib/api";
import { GroupsMembersSection } from "@/components/admin/panels/GroupsMembersSection";
import { GroupsSettingsSection } from "@/components/admin/panels/GroupsSettingsSection";
import { useGroupsPanel } from "@/components/admin/panels/useGroupsPanel";

export function GroupsPanel() {
  const panel = useGroupsPanel();
  const {
    groups, selectedId, setSelectedId, selected,
    members, loading, busy, note, error,
    addEmail, setAddEmail, newGroup, setNewGroup,
    form, setForm,
    dialog,
    addMember, saveGroup, toggleArchive, createNewGroup, setRole, remove,
  } = panel;

  if (!hasToken()) {
    return <div className="card p-8 text-center"><p>Нужен вход администратора</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" aria-label="Группа">
          {groups.map((g) => <option key={g.id} value={g.id}>{g.code || g.name}{g.is_active === false ? " (архив)" : ""}</option>)}
        </select>
        <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Новая группа, напр. МБХ 201" className="rounded-xl border px-3 py-2 text-sm" />
        <button type="button" onClick={() => void createNewGroup()} disabled={busy === "create" || !newGroup.trim()} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
          {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Создать
        </button>
      </div>

      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">{note}</div>}

      {loading ? (
        <div className="card flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загружаем…</div>
      ) : !selected ? (
        <div className="card p-6 text-sm text-slate-500">Групп нет — создайте первую.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <GroupsSettingsSection
            selected={selected}
            form={form}
            onForm={setForm}
            busy={busy}
            onSave={() => void saveGroup()}
            onToggleArchive={(active) => void toggleArchive(active)}
          />

          <GroupsMembersSection
            members={members}
            addEmail={addEmail}
            onAddEmail={setAddEmail}
            busy={busy}
            onAdd={() => void addMember()}
            onSetRole={(m, role) => void setRole(m, role)}
            onRemove={(m) => void remove(m)}
          />
        </div>
      )}
      {dialog}
      {selected ? <GroupInvites groupId={selected.id} /> : null}
    </div>
  );
}
