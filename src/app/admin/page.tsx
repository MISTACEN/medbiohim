"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, LayoutDashboard, BookOpen, Users, FileText, ShieldCheck, Settings2, Plus, Trash2, Ticket, Grid3X3 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminMissingTools } from "@/components/admin/AdminMissingTools";
import { adminOverview, adminUpdateSite, adminListAnnouncements, adminCreateAnnouncement, adminDeleteAnnouncement, adminListUsers, adminSetUserRole, listGroups, listSubjects, adminListSchedule, adminSaveSchedule, createGroup, createSubject, hasToken, api, type ScheduleItem } from "@/lib/api";

type Tab = "overview" | "schedule" | "subjects" | "groups" | "content" | "roles" | "tools";
type Row = ScheduleItem & { localId: string };
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
const TYPES = ["lecture", "practice", "laboratory", "seminar", "exam", "credit", "consultation", "other"];
const TYPE_LABELS: Record<string, string> = { lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная", seminar: "Семинар", exam: "Экзамен", credit: "Зачёт", consultation: "Консультация", other: "Другое" };
const lid = () => Math.random().toString(36).slice(2);

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [academicDrafts, setAcademicDrafts] = useState<Record<string, { groupId: string; semester: string }>>({});
  const [savingAcademic, setSavingAcademic] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [groupId, setGroupId] = useState("");
  const [semester, setSemester] = useState("3");
  const [site, setSite] = useState({ title: "Медбиохим", subtitle: "", description: "", announcement_banner: "" });
  const [anns, setAnns] = useState<any[]>([]);
  const [aTitle, setATitle] = useState("");
  const [aBody, setABody] = useState("");
  const [sName, setSName] = useState("");
  const [course, setCourse] = useState("2");
  const [gName, setGName] = useState("");
  const [gCode, setGCode] = useState("");

  function msg(err = "", good = "") { setError(err); setOk(good); }

  async function loadBase() {
    if (!hasToken()) return;
    const [o, g, s, u, a] = await Promise.all([
      adminOverview(),
      listGroups(),
      listSubjects(),
      adminListUsers(),
      adminListAnnouncements(),
    ]);
    if (o.ok) {
      setCounts(o.data.counts || {});
      if (o.data.site) setSite({ title: String(o.data.site.title || "Медбиохим"), subtitle: String(o.data.site.subtitle || ""), description: String(o.data.site.description || ""), announcement_banner: String(o.data.site.announcement_banner || "") });
    }
    if (g.ok) {
      const list = g.data.items as any[];
      setGroups(list);
      if (!groupId && list[0]?.id) setGroupId(String(list[0].id));
    }
    if (s.ok) setSubjects(s.data.items as any[]);
    if (u.ok) {
      const list = (u.data.items || []) as AdminUser[];
      setUsers(list);
      const drafts: Record<string, { groupId: string; semester: string }> = {};
      list.forEach((x) => { drafts[x.id] = { groupId: String(x.group_id || ""), semester: String(x.semester || 3) }; });
      setAcademicDrafts(drafts);
    }
    if (a.ok) setAnns(a.data.items || []);
  }

  async function loadSchedule() {
    if (!groupId) return;
    const r = await adminListSchedule(groupId, Number(semester) || 3);
    if (!r.ok) return msg(r.error.message);
    setRows((r.data.items || []).map((x) => ({ ...x, localId: lid() })));
  }

  useEffect(() => { void loadBase(); }, []);
  useEffect(() => { if (tab === "schedule") void loadSchedule(); }, [tab, groupId, semester]);

  function add() {
    setRows((x) => [{ localId: lid(), date: "", start_time: "09:00", end_time: "10:30", type: "lecture", subject_id: "", subject_name: "", room: "", building: "", notes: "", is_cancelled: false }, ...x]);
  }
  function upd(id: string, patch: Partial<Row>) {
    setRows((x) => x.map((r) => (r.localId === id ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!groupId) return msg("Выберите группу");
    const entries = rows.map(({ localId, ...e }) => e);
    const r = await adminSaveSchedule({ group_id: groupId, semester: Number(semester), entries });
    if (!r.ok) return msg(r.error.message);
    msg("", `Сохранено в БД · version ${(r.data as any).version ?? "—"} · ${(r.data as any).entries_saved ?? entries.length} занятий`);
    await loadSchedule();
  }

  async function saveAcademic(u: AdminUser) {
    const draft = academicDrafts[u.id] || { groupId: "", semester: "3" };
    if (!draft.groupId) return msg("Выберите группу");
    setSavingAcademic((x) => ({ ...x, [u.id]: true }));
    const r = await api(`/admin/users/${u.id}/academic`, { method: "PUT", body: JSON.stringify({ group_id: draft.groupId, semester: Number(draft.semester) || 3 }) });
    setSavingAcademic((x) => ({ ...x, [u.id]: false }));
    if (!r.ok) return msg(r.error.message);
    msg("", "Учебная группа сохранена");
    await loadBase();
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">CMS Медбиохим</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="page-title">CMS Медбиохим</h1>
        <p className="page-subtitle">Управление сайтом и учебным контентом · {user?.name || user?.email}</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <aside className="card h-fit space-y-1 p-2 lg:sticky lg:top-4">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Управление</div>
          <Link href="/admin/schedule" className="flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-left text-sm font-semibold text-indigo-700"><Grid3X3 className="h-4 w-4" />Сетка расписания</Link>
          <Link href="/admin/questions" className="flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-left text-sm font-semibold text-indigo-700"><Ticket className="h-4 w-4" />Экзаменационные билеты</Link>
          <Link href="/admin/lectures" className="flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-left text-sm font-semibold text-indigo-700"><BookOpen className="h-4 w-4" />AI-лекции</Link>
          <Link href="/admin/tools" className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left text-sm font-semibold text-slate-700"><Settings2 className="h-4 w-4" />Импорт / tools</Link>
          <div className="my-2 border-t border-slate-100" />
          {([ ["overview", "Обзор", LayoutDashboard], ["schedule", "Расписание", CalendarDays], ["subjects", "Предметы", BookOpen], ["groups", "Группы", Users], ["content", "Контент", FileText], ["roles", "Пользователи", ShieldCheck], ["tools", "ДЗ / медиа", Settings2] ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </aside>
        <main className="min-w-0 space-y-5">
          {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {ok && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</div>}

          {tab === "overview" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(counts).map(([k, v]) => (
                  <div className="card" key={k}><div className="text-xs uppercase text-slate-400">{k}</div><div className="text-2xl font-bold text-indigo-600">{v}</div></div>
                ))}
              </div>
              <div className="card">
                <h2 className="text-lg font-bold">Быстрые действия</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {([ ["schedule", "Расписание", "Список занятий"], ["subjects", "Предметы", "Дисциплины"], ["groups", "Группы", "Студенты"], ["content", "Контент", "Объявления"], ["roles", "Пользователи", "Роли и группы"] ] as const).map(([id, a, b]) => (
                    <button key={id} type="button" onClick={() => setTab(id)} className="rounded-xl border p-4 text-left hover:bg-slate-50"><b>{a}</b><p className="text-xs text-slate-500">{b}</p></button>
                  ))}
                  <Link href="/admin/schedule" className="rounded-xl border p-4 text-left hover:bg-slate-50"><b>Сетка</b><p className="text-xs text-slate-500">Drag-and-drop</p></Link>
                  <Link href="/admin/questions" className="rounded-xl border p-4 text-left hover:bg-slate-50"><b>Билеты</b><p className="text-xs text-slate-500">Supabase</p></Link>
                  <Link href="/admin/lectures" className="rounded-xl border p-4 text-left hover:bg-slate-50"><b>AI-лекции</b><p className="text-xs text-slate-500">Редактор</p></Link>
                </div>
              </div>
            </>
          )}

          {tab === "schedule" && (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Расписание · список</h2>
                  <p className="text-sm text-slate-500">Источник истины — БД (Supabase). Для сетки: <Link href="/admin/schedule" className="text-indigo-600 underline">/admin/schedule</Link></p>
                </div>
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={add}><Plus className="h-4 w-4" />Занятие</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Группа<select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">{groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.code}</option>)}</select></label>
                <label className="text-sm">Семестр<select value={semester} onChange={(e) => setSemester(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="3">3</option><option value="4">4</option><option value="2">2</option><option value="1">1</option></select></label>
              </div>
              <div className="space-y-2">
                {rows.slice(0, 120).map((r) => (
                  <div key={r.localId} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="grid gap-2 md:grid-cols-6">
                      <input type="date" value={r.date || ""} onChange={(e) => upd(r.localId, { date: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
                      <input type="time" value={r.start_time || ""} onChange={(e) => upd(r.localId, { start_time: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
                      <input type="time" value={r.end_time || ""} onChange={(e) => upd(r.localId, { end_time: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
                      <select value={String(r.subject_id || "")} onChange={(e) => { const s = subjects.find((x) => String(x.id) === e.target.value); upd(r.localId, { subject_id: e.target.value, subject_name: s?.name || "" }); }} className="rounded-lg border px-2 py-2 text-sm md:col-span-2"><option value="">Предмет</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                      <select value={r.type || "lecture"} onChange={(e) => upd(r.localId, { type: e.target.value })} className="rounded-lg border px-2 py-2 text-sm">{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select>
                      <input value={r.building || ""} onChange={(e) => upd(r.localId, { building: e.target.value })} placeholder="Корпус" className="rounded-lg border px-2 py-2 text-sm" />
                      <input value={r.room || ""} onChange={(e) => upd(r.localId, { room: e.target.value })} placeholder="Аудитория" className="rounded-lg border px-2 py-2 text-sm" />
                      <input value={r.notes || ""} onChange={(e) => upd(r.localId, { notes: e.target.value })} placeholder="Примечание" className="rounded-lg border px-2 py-2 text-sm md:col-span-3" />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!r.is_cancelled} onChange={(e) => upd(r.localId, { is_cancelled: e.target.checked })} />Отменено</label>
                      <button type="button" onClick={() => setRows((x) => x.filter((a) => a.localId !== r.localId))} className="inline-flex items-center gap-1 text-sm text-rose-600"><Trash2 className="h-4 w-4" />Удалить</button>
                    </div>
                  </div>
                ))}
              </div>
              {rows.length > 120 && <p className="text-xs text-slate-500">Показаны первые 120. Сохранение пишет весь список в БД.</p>}
              <button type="button" disabled={!groupId} className="btn-primary" onClick={() => void save()}>Сохранить расписание в БД</button>
            </div>
          )}

          {tab === "subjects" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <form className="card space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await createSubject({ name: sName, course_number: Number(course) || 2, semester: 3 }); if (r.ok) { setSName(""); msg("", "Предмет создан"); const x = await listSubjects(); if (x.ok) setSubjects(x.data.items as any[]); } else msg(r.error.message); }}>
                <h2 className="text-lg font-bold">Добавить предмет</h2>
                <input required value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Название" className="w-full rounded-xl border px-3 py-2" />
                <input type="number" min={1} value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Курс" className="w-full rounded-xl border px-3 py-2" />
                <button className="btn-primary">Создать</button>
              </form>
              <div className="card"><h2 className="mb-2 font-bold">Предметы</h2>{subjects.map((s) => <div key={s.id} className="border-b py-2 text-sm last:border-0"><b>{s.name}</b>{s.course_number && <span className="ml-2 text-slate-400">{s.course_number} курс</span>}</div>)}</div>
            </div>
          )}

          {tab === "groups" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <form className="card space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await createGroup({ name: gName, code: gCode, course_number: 2 }); if (r.ok) { setGName(""); setGCode(""); msg("", "Группа создана"); const x = await listGroups(); if (x.ok) setGroups(x.data.items as any[]); } else msg(r.error.message); }}>
                <h2 className="text-lg font-bold">Добавить группу</h2>
                <input required value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Название" className="w-full rounded-xl border px-3 py-2" />
                <input value={gCode} onChange={(e) => setGCode(e.target.value)} placeholder="Код" className="w-full rounded-xl border px-3 py-2" />
                <button className="btn-primary">Создать</button>
              </form>
              <div className="card"><h2 className="mb-2 font-bold">Группы</h2>{groups.map((g) => <div key={g.id} className="border-b py-2 text-sm last:border-0"><b>{g.name}</b><span className="ml-2 text-slate-400">{g.code || ""}</span></div>)}</div>
            </div>
          )}

          {tab === "content" && (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <form className="card space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await adminCreateAnnouncement(aTitle, aBody, false); if (r.ok) { setATitle(""); setABody(""); msg("", "Объявление опубликовано"); const x = await adminListAnnouncements(); if (x.ok) setAnns(x.data.items); } else msg(r.error.message); }}>
                  <h2 className="text-lg font-bold">Новое объявление</h2>
                  <input required value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Заголовок" className="w-full rounded-xl border px-3 py-2" />
                  <textarea required rows={5} value={aBody} onChange={(e) => setABody(e.target.value)} placeholder="Текст" className="w-full rounded-xl border px-3 py-2" />
                  <button className="btn-primary">Опубликовать</button>
                </form>
                <div className="card"><h2 className="mb-2 font-bold">Объявления</h2>{anns.map((a) => <div key={a.id} className="border-b py-3 last:border-0"><b>{a.title}</b><p className="text-sm text-slate-600">{a.body}</p><button type="button" className="text-xs text-rose-600" onClick={async () => { await adminDeleteAnnouncement(a.id); const x = await adminListAnnouncements(); if (x.ok) setAnns(x.data.items); }}>Удалить</button></div>)}</div>
              </div>
              <form className="card space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await adminUpdateSite(site); if (r.ok) msg("", "Настройки сайта сохранены"); else msg(r.error.message); }}>
                <h2 className="font-bold">Настройки сайта</h2>
                {(["title", "subtitle", "description", "announcement_banner"] as const).map((k) => (
                  <label key={k} className="block text-sm">{k}<input value={site[k]} onChange={(e) => setSite({ ...site, [k]: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
                ))}
                <button className="btn-primary">Сохранить</button>
              </form>
            </div>
          )}

          {tab === "roles" && (
            <div className="card space-y-5">
              <div>
                <h2 className="text-lg font-bold">Пользователи</h2>
                <p className="text-sm text-slate-500">Группа, семестр и роли для каждого пользователя.</p>
              </div>
              <div className="space-y-3">
                {users.map((u) => {
                  const draft = academicDrafts[u.id] || { groupId: String(u.group_id || ""), semester: String(u.semester || 3) };
                  const selectedGroup = groups.find((g) => String(g.id) === draft.groupId);
                  return (
                    <div key={u.id} className="rounded-2xl border bg-slate-50 p-4 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <b>{u.full_name || u.email}</b>
                          <div className="text-xs text-slate-500">{u.email}</div>
                          <div className="mt-1 text-xs text-slate-500">Роли: {(u.roles || []).join(", ") || "student"}</div>
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-600">{selectedGroup?.course_number ?? u.course_number ?? "—"} курс</div>
                      </div>
                      <div className="mt-3 grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto]">
                        <label className="text-xs font-semibold text-slate-500">Группа
                          <select value={draft.groupId} onChange={(e) => setAcademicDrafts((x) => ({ ...x, [u.id]: { ...draft, groupId: e.target.value } }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                            <option value="">Не назначена</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.code}{g.course_number ? ` · ${g.course_number} курс` : ""}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-500">Семестр
                          <select value={draft.semester} onChange={(e) => setAcademicDrafts((x) => ({ ...x, [u.id]: { ...draft, semester: e.target.value } }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                        <button type="button" disabled={!!savingAcademic[u.id] || !draft.groupId} onClick={() => void saveAcademic(u)} className="btn-primary whitespace-nowrap disabled:opacity-50">{savingAcademic[u.id] ? "Сохранение…" : "Сохранить учебную группу"}</button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {["student", "teacher", "moderator", "admin"].map((r) => (
                          <button type="button" key={r} className="rounded-lg border bg-white px-2 py-1 text-xs" onClick={async () => { const x = await adminSetUserRole(u.id, r, "assign"); if (x.ok) { setUsers((prev) => prev.map((z) => (z.id === u.id ? { ...z, roles: x.data.roles } : z))); msg("", `${r} назначена: ${u.email}`); } else msg(x.error.message); }}>+{r}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "tools" && <AdminMissingTools onMessage={(m, err) => msg(err ? m : "", err ? "" : m)} />}
        </main>
      </div>
    </div>
  );
}
