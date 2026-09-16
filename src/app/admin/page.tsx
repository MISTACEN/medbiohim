"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, LayoutDashboard, BookOpen, Users, FileText, ShieldCheck, Settings2, Plus, Trash2, Ticket } from "lucide-react";
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
  const [gName, setGName] = useState("");
  const [gCode, setGCode] = useState("");
  const [sName, setSName] = useState("");
  const [course, setCourse] = useState("2");
  const msg = (e = "", o = "") => { setError(e); setOk(o); };

  useEffect(() => {
    if (!hasToken()) return;
    void (async () => {
      const r = await adminOverview();
      if (r.ok) {
        setCounts(r.data.counts);
        const s: any = r.data.site || {};
        setSite({ title: String(s.title || "Медбиохим"), subtitle: String(s.subtitle || ""), description: String(s.description || ""), announcement_banner: String(s.announcement_banner || "") });
      } else msg(r.error.message);
    })();
  }, []);

  useEffect(() => {
    if (!hasToken()) return;
    void (async () => {
      msg();
      if (tab === "schedule") {
        const [g, s, r] = await Promise.all([listGroups(), listSubjects(), adminListSchedule(groupId || undefined, Number(semester))]);
        if (g.ok) {
          const nextGroups = g.data.items as any[];
          setGroups(nextGroups);
          if (!groupId) {
            const mb = nextGroups.find(x => x.code === "МБ-201");
            setGroupId(String((mb || nextGroups[0])?.id || ""));
          }
        }
        if (s.ok) setSubjects(s.data.items as any[]);
        if (r.ok) setRows((r.data.items || []).map(x => ({ ...x, localId: lid() })));
      }
      if (tab === "groups" || tab === "subjects") {
        const [g, s] = await Promise.all([listGroups(), listSubjects()]);
        if (g.ok) setGroups(g.data.items as any[]);
        if (s.ok) setSubjects(s.data.items as any[]);
      }
      if (tab === "roles") {
        const [r, g] = await Promise.all([adminListUsers(), listGroups()]);
        if (r.ok) {
          const list = r.data.items as AdminUser[];
          setUsers(list);
          const drafts: Record<string, { groupId: string; semester: string }> = {};
          list.forEach(u => { drafts[u.id] = { groupId: String(u.group_id || ""), semester: String(u.semester || 3) }; });
          setAcademicDrafts(drafts);
        }
        if (g.ok) setGroups(g.data.items as any[]);
      }
      if (tab === "content") {
        const r = await adminListAnnouncements();
        if (r.ok) setAnns(r.data.items);
      }
    })();
  }, [tab, semester, groupId]);

  if (!hasToken()) return <div className="card mx-auto max-w-md p-8 text-center"><h1 className="page-title">CMS Медбиохим</h1><p className="page-subtitle">Сначала войдите</p><Link href="/login" className="btn-primary mt-4 inline-block">Войти</Link></div>;

  const upd = (id: string, patch: Partial<Row>) => setRows(x => x.map(r => r.localId === id ? { ...r, ...patch } : r));
  const add = () => setRows(x => [...x, { localId: lid(), id: lid(), group_id: groupId, date: new Date().toISOString().slice(0, 10), start_time: "08:30", end_time: "10:10", subject_id: String(subjects[0]?.id || ""), subject_name: String(subjects[0]?.name || ""), type: "lecture", room: "", building: "", notes: "", is_cancelled: false }]);
  const save = async () => {
    const entries = rows.map(({ localId, id, subject_name, ...x }) => x);
    const r = await adminSaveSchedule({ group_id: groupId, semester: Number(semester), entries });
    if (r.ok) msg("", `Расписание сохранено · версия ${r.data.version} · ${r.data.entries_saved} занятий`); else msg(r.error.message);
  };
  const saveAcademic = async (u: AdminUser) => {
    const draft = academicDrafts[u.id] || { groupId: String(u.group_id || ""), semester: String(u.semester || 3) };
    if (!draft.groupId) { msg("Выберите группу для пользователя"); return; }
    setSavingAcademic(x => ({ ...x, [u.id]: true }));
    const r = await api<{ academic: { user_id: string; group_id: string; group_name: string; group_code: string; course_number: number | null; semester: number } }>("/admin/users/academic", {
      method: "POST",
      body: JSON.stringify({ user_id: u.id, group_id: draft.groupId, semester: Number(draft.semester) }),
    });
    if (r.ok) {
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, group_id: r.data.academic.group_id, group_name: r.data.academic.group_name, group_code: r.data.academic.group_code, course_number: r.data.academic.course_number, semester: r.data.academic.semester } : x));
      msg("", `${u.email || u.full_name || "Пользователь"}: ${r.data.academic.group_name} · ${r.data.academic.course_number ?? "—"} курс · ${r.data.academic.semester} семестр`);
    } else msg(r.error.message);
    setSavingAcademic(x => ({ ...x, [u.id]: false }));
  };

  return <div className="space-y-5">
    <header><h1 className="page-title">CMS Медбиохим</h1><p className="page-subtitle">Управление сайтом и учебным контентом · {user?.name || user?.email}</p></header>
    <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
      <aside className="card h-fit p-2 lg:sticky lg:top-4">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Управление</div>
        <Link href="/admin/questions" className="mb-1 flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-left text-sm font-semibold text-indigo-700"><Ticket className="h-4 w-4" />Экзаменационные билеты</Link>
        {([ ["overview", "Обзор", LayoutDashboard], ["schedule", "Расписание", CalendarDays], ["subjects", "Предметы", BookOpen], ["groups", "Группы", Users], ["content", "Контент", FileText], ["roles", "Пользователи", ShieldCheck], ["tools", "Инструменты", Settings2] ] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}</button>)}
      </aside>
      <main className="min-w-0 space-y-5">
        {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {ok && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</div>}
        {tab === "overview" && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(counts).map(([k, v]) => <div className="card" key={k}><div className="text-xs uppercase text-slate-400">{k}</div><div className="text-2xl font-bold text-indigo-600">{v}</div></div>)}</div><div className="card"><h2 className="text-lg font-bold">Быстрые действия</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["schedule", "Расписание", "Редактор занятий"], ["subjects", "Предметы", "Учебные дисциплины"], ["groups", "Группы", "Группы студентов"], ["content", "Контент", "Объявления и сайт"]].map(([id, a, b]) => <button key={id} onClick={() => setTab(id as Tab)} className="rounded-xl border p-4 text-left hover:bg-slate-50"><b>{a}</b><p className="text-xs text-slate-500">{b}</p></button>)}<Link href="/admin/questions" className="rounded-xl border p-4 text-left hover:bg-slate-50"><b>Билеты</b><p className="text-xs text-slate-500">150 реальных вопросов в Supabase</p></Link></div></div></>}
        {tab === "schedule" && <div className="card space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Расписание МБ-201 · 3 семестр</h2><p className="text-sm text-slate-500">2026/2027 · активная версия Supabase · редактирование без JSON.</p></div><button type="button" className="btn-primary inline-flex items-center gap-2" onClick={add}><Plus className="h-4 w-4" />Занятие</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Группа<select value={groupId} onChange={e => setGroupId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">{groups.map(g => <option key={g.id} value={g.id}>{g.name || g.code}</option>)}</select></label><label className="text-sm">Семестр<select value={semester} onChange={e => setSemester(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="3">3</option><option value="4">4</option><option value="2">2</option><option value="1">1</option></select></label></div><div className="space-y-2">{rows.slice(0, 120).map(r => <div key={r.localId} className="rounded-2xl border bg-slate-50 p-4"><div className="grid gap-2 md:grid-cols-6"><input type="date" value={r.date || ""} onChange={e => upd(r.localId, { date: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" /><input type="time" value={r.start_time || ""} onChange={e => upd(r.localId, { start_time: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" /><input type="time" value={r.end_time || ""} onChange={e => upd(r.localId, { end_time: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" /><select value={String(r.subject_id || "")} onChange={e => { const s = subjects.find(x => String(x.id) === e.target.value); upd(r.localId, { subject_id: e.target.value, subject_name: s?.name || "" }); }} className="rounded-lg border px-2 py-2 text-sm md:col-span-2"><option value="">Предмет</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={r.type || "lecture"} onChange={e => upd(r.localId, { type: e.target.value })} className="rounded-lg border px-2 py-2 text-sm">{TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select><input value={r.building || ""} onChange={e => upd(r.localId, { building: e.target.value })} placeholder="Корпус" className="rounded-lg border px-2 py-2 text-sm" /><input value={r.room || ""} onChange={e => upd(r.localId, { room: e.target.value })} placeholder="Аудитория" className="rounded-lg border px-2 py-2 text-sm" /><input value={r.notes || ""} onChange={e => upd(r.localId, { notes: e.target.value })} placeholder="Примечание" className="rounded-lg border px-2 py-2 text-sm md:col-span-3" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!r.is_cancelled} onChange={e => upd(r.localId, { is_cancelled: e.target.checked })} />Отменено</label><button type="button" onClick={() => setRows(x => x.filter(a => a.localId !== r.localId))} className="inline-flex items-center gap-1 text-sm text-rose-600"><Trash2 className="h-4 w-4" />Удалить</button></div></div>)}</div>{rows.length > 120 && <p className="text-xs text-slate-500">Показаны первые 120 строк. Полное расписание сохраняется целиком через CMS API.</p>}<button type="button" disabled={!groupId} className="btn-primary" onClick={save}>Сохранить расписание</button></div>}
        {tab === "subjects" && <div className="grid gap-5 lg:grid-cols-2"><form className="card space-y-3" onSubmit={async e => { e.preventDefault(); const r = await createSubject({ name: sName, course_number: Number(course) || 2, semester: 3 }); if (r.ok) { setSName(""); msg("", "Предмет создан"); const x = await listSubjects(); if (x.ok) setSubjects(x.data.items as any[]); } else msg(r.error.message); }}><h2 className="text-lg font-bold">Добавить предмет</h2><input required value={sName} onChange={e => setSName(e.target.value)} placeholder="Название" className="w-full rounded-xl border px-3 py-2" /><input type="number" min="1" value={course} onChange={e => setCourse(e.target.value)} placeholder="Курс" className="w-full rounded-xl border px-3 py-2" /><button className="btn-primary">Создать</button></form><div className="card"><h2 className="mb-2 font-bold">Предметы</h2>{subjects.map(s => <div key={s.id} className="border-b py-2 text-sm last:border-0"><b>{s.name}</b>{s.course_number && <span className="ml-2 text-slate-400">{s.course_number} курс</span>}</div>)}</div></div>}
        {tab === "groups" && <div className="grid gap-5 lg:grid-cols-2"><form className="card space-y-3" onSubmit={async e => { e.preventDefault(); const r = await createGroup({ name: gName, code: gCode, course_number: 2 }); if (r.ok) { setGName(""); setGCode(""); msg("", "Группа создана"); const x = await listGroups(); if (x.ok) setGroups(x.data.items as any[]); } else msg(r.error.message); }}><h2 className="text-lg font-bold">Добавить группу</h2><input required value={gName} onChange={e => setGName(e.target.value)} placeholder="Название" className="w-full rounded-xl border px-3 py-2" /><input value={gCode} onChange={e => setGCode(e.target.value)} placeholder="Код" className="w-full rounded-xl border px-3 py-2" /><button className="btn-primary">Создать</button></form><div className="card"><h2 className="mb-2 font-bold">Группы</h2>{groups.map(g => <div key={g.id} className="border-b py-2 text-sm last:border-0"><b>{g.name}</b><span className="ml-2 text-slate-400">{g.code || ""}</span>{g.course_number ? <span className="ml-2 text-slate-400">{g.course_number} курс</span> : null}</div>)}</div></div>}
        {tab === "content" && <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-2"><form className="card space-y-3" onSubmit={async e => { e.preventDefault(); const r = await adminCreateAnnouncement(aTitle, aBody, false); if (r.ok) { setATitle(""); setABody(""); msg("", "Объявление опубликовано"); const x = await adminListAnnouncements(); if (x.ok) setAnns(x.data.items); } else msg(r.error.message); }}><h2 className="text-lg font-bold">Новое объявление</h2><input required value={aTitle} onChange={e => setATitle(e.target.value)} placeholder="Заголовок" className="w-full rounded-xl border px-3 py-2" /><textarea required rows={5} value={aBody} onChange={e => setABody(e.target.value)} placeholder="Текст" className="w-full rounded-xl border px-3 py-2" /><button className="btn-primary">Опубликовать</button></form><div className="card"><h2 className="mb-2 font-bold">Объявления</h2>{anns.map(a => <div key={a.id} className="border-b py-3 last:border-0"><b>{a.title}</b><p className="text-sm text-slate-600">{a.body}</p><button type="button" className="text-xs text-rose-600" onClick={async () => { await adminDeleteAnnouncement(a.id); const x = await adminListAnnouncements(); if (x.ok) setAnns(x.data.items); }}>Удалить</button></div>)}</div></div><form className="card space-y-3" onSubmit={async e => { e.preventDefault(); const r = await adminUpdateSite(site); if (r.ok) msg("", "Настройки сайта сохранены"); else msg(r.error.message); }}><h2 className="font-bold">Настройки сайта</h2>{(["title", "subtitle", "description", "announcement_banner"] as const).map(k => <label key={k} className="block text-sm">{k}<input value={site[k]} onChange={e => setSite({ ...site, [k]: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>)}<button className="btn-primary">Сохранить</button></form></div>}
        {tab === "roles" && <div className="card space-y-5"><div><h2 className="text-lg font-bold">Пользователи</h2><p className="text-sm text-slate-500">Для каждого пользователя можно назначить активную группу. Курс берётся из группы, семестр задаётся отдельно.</p></div><div className="space-y-3">{users.map(u => { const draft = academicDrafts[u.id] || { groupId: String(u.group_id || ""), semester: String(u.semester || 3) }; const selectedGroup = groups.find(g => String(g.id) === draft.groupId); return <div key={u.id} className="rounded-2xl border bg-slate-50 p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><b>{u.full_name || u.email}</b><div className="text-xs text-slate-500">{u.email}</div><div className="mt-1 text-xs text-slate-500">Роли: {(u.roles || []).join(", ") || "student"}</div></div><div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-600">{selectedGroup?.course_number ?? u.course_number ?? "—"} курс</div></div><div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto] items-end"><label className="text-xs font-semibold text-slate-500">Группа<select value={draft.groupId} onChange={e => setAcademicDrafts(x => ({ ...x, [u.id]: { ...draft, groupId: e.target.value } }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="">Не назначена</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name || g.code}{g.course_number ? ` · ${g.course_number} курс` : ""}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">Семестр<select value={draft.semester} onChange={e => setAcademicDrafts(x => ({ ...x, [u.id]: { ...draft, semester: e.target.value } }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label><button type="button" disabled={!!savingAcademic[u.id] || !draft.groupId} onClick={() => void saveAcademic(u)} className="btn-primary whitespace-nowrap disabled:opacity-50">{savingAcademic[u.id] ? "Сохранение…" : "Сохранить учебную группу"}</button></div><div className="mt-3 flex flex-wrap gap-1">{["student", "teacher", "moderator", "admin"].map(r => <button type="button" key={r} className="rounded-lg border bg-white px-2 py-1 text-xs" onClick={async () => { const x = await adminSetUserRole(u.id, r, "assign"); if (x.ok) { setUsers(prev => prev.map(z => z.id === u.id ? { ...z, roles: x.data.roles } : z)); msg("", `${r} назначена: ${u.email}`); } else msg(x.error.message); }}>+{r}</button>)}</div></div>; })}</div></div>}
        {tab === "tools" && <AdminMissingTools />}
      </main>
    </div>
  </div>;
}
