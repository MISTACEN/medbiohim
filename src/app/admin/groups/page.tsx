"use client";

/**
 * Полное управление группой (запрос владельца 2026-10-31):
 * участники конкретной группы, добавление по email, роль (староста/студент),
 * название, код, год поступления, поток, семестр, курс, архивация.
 *
 * Права на сервере: манипуляции — только admin/moderator/teacher (groups.ts
 * MANAGERS); роль назначает staff. Фронт только скрывает кнопки.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2, UserMinus, UserCheck } from "lucide-react";
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
import { describeApiError } from "@/lib/errors";

type GroupRow = {
  id: string; name?: string; code?: string; course_number?: number | null;
  admission_year?: number | null; stream?: string | null; semester?: number | null; is_active?: boolean;
};
type MemberRow = {
  membership_id: string; user_id: string; name: string; email: string | null;
  role: string | null; course_number: number | null; course_source?: string; subgroup?: string | null;
};

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
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
        const items = (res.data?.items || []) as GroupRow[];
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
      if (res.ok) setMembers((res.data?.items || []) as MemberRow[]);
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
    await run("archive", () => patchGroup(selectedId, { is_active: active }),
      active ? "Группа возвращена из архива." : "Группа архивирована — участники сохранены.", false);
  }

  async function createNewGroup() {
    if (!newGroup.trim()) return;
    const done = await run("create", () => createGroup({ name: newGroup.trim(), is_active: true }), `Группа «${newGroup.trim()}» создана`);
    if (done) setNewGroup("");
  }

  async function setRole(member: MemberRow, role: "starosta" | "student") {
    await run(`role-${member.user_id}`, () => patchGroupMember(selectedId, member.user_id, { role_in_group: role }),
      role === "starosta" ? `${member.name} — староста` : `${member.name} — студент`);
  }

  async function remove(member: MemberRow) {
    await run(`remove-${member.user_id}`, () => removeGroupMember(selectedId, member.user_id), `${member.name} убран из группы`);
  }

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
          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Настройки группы</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-500">Название
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Код
                <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Год поступления
                <input value={form.admission_year} onChange={(e) => setForm((f) => ({ ...f, admission_year: e.target.value }))} inputMode="numeric" placeholder="2025" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Поток
                <input value={form.stream} onChange={(e) => setForm((f) => ({ ...f, stream: e.target.value }))} placeholder="01" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Курс (ручной)
                <input value={form.course_number} onChange={(e) => setForm((f) => ({ ...f, course_number: e.target.value }))} inputMode="numeric" placeholder="авто от года" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Семестр (вручную)
                <input value={form.semester} onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))} inputMode="numeric" placeholder="авто" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void saveGroup()} disabled={busy === "save"} className="btn-primary inline-flex items-center gap-2 text-sm">
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Сохранить
              </button>
              {selected.is_active === false ? (
                <button type="button" onClick={() => { if (window.confirm(`Вернуть группу «${selected.code || selected.name}» из архива?`)) void toggleArchive(true); }} disabled={busy === "archive"} className="rounded-xl border px-3 py-2 text-sm">
                  Вернуть из архива
                </button>
              ) : (
                <button type="button" onClick={() => { if (!window.confirm(`Архивировать группу «${selected.code || selected.name}»? Она исчезнет из списков, участники сохранятся.`)) return; void toggleArchive(false); }} disabled={busy === "archive"} className="rounded-xl border px-3 py-2 text-sm text-[var(--status-warn-fg)]">
                  Архивировать
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Курс считается автоматически от года поступления (сентябрь — граница); «Курс (ручной)» и «Семестр» — точечные перекрытия.
            </p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Участники ({members.length})</h2>
            <div className="flex gap-2">
              <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="email студента" className="flex-1 rounded-xl border px-3 py-2 text-sm" />
              <button type="button" onClick={() => void addMember()} disabled={busy === "add" || !addEmail.trim()} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
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
                    <button type="button" onClick={() => void setRole(m, "student")} disabled={busy === `role-${m.user_id}`} className="rounded-lg border px-2 py-1 text-xs">Снять старосту</button>
                  ) : (
                    <button type="button" onClick={() => void setRole(m, "starosta")} disabled={busy === `role-${m.user_id}`} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Сделать старостой</button>
                  )}
                  <button type="button" onClick={() => void remove(m)} disabled={busy === `remove-${m.user_id}`} className="text-slate-400 hover:text-[var(--status-critical-fg)]" aria-label="Убрать из группы">
                    {busy === `remove-${m.user_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                  </button>
                </div>
              ))}
              {members.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">Пока никого — добавьте по email.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
