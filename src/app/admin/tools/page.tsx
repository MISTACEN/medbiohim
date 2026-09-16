"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Database, FileUp, GraduationCap, HardDrive, LayoutDashboard, RefreshCw, Search, ShieldCheck, Users, BookOpen, CalendarDays, Settings2, Ticket } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  adminOverview,
  adminUpdateSite,
  adminListAnnouncements,
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  adminListUsers,
  adminSetUserRole,
  adminListSchedule,
  adminListHomeworks,
  adminCreateHomework,
  adminDeleteHomework,
  adminListMaterials,
  adminDeleteMaterial,
  adminListCommunity,
  adminUpdateCommunity,
  adminDeleteCommunity,
  listGroups,
  listSubjects,
  createGroup,
  createSubject,
  uploadFile,
  adminSaveSchedule,
  health,
  hasToken,
  api,
  type ScheduleItem,
} from "@/lib/api";

type Tab = "overview" | "users" | "academic" | "schedule" | "content" | "learning" | "media" | "system";
type AdminUser = { id: string; email?: string; full_name?: string; roles?: string[]; group_id?: string | null; group_name?: string | null; group_code?: string | null; course_number?: number | null; semester?: number | null };
type Row = ScheduleItem & { localId: string };
const lid = () => Math.random().toString(36).slice(2);
const TYPES = ["lecture", "practice", "laboratory", "seminar", "exam", "credit", "consultation", "other"];
const TYPE_LABELS: Record<string, string> = { lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная", seminar: "Семинар", exam: "Экзамен", credit: "Зачёт", consultation: "Консультация", other: "Занятие" };

export default function AdminToolsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { groupId: string; semester: string }>>({});
  const [site, setSite] = useState({ title: "Медбиохим", subtitle: "", description: "", announcement_banner: "" });
  const [anns, setAnns] = useState<any[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [hwTitle, setHwTitle] = useState("");
  const [hwDescription, setHwDescription] = useState("");
  const [hwGroup, setHwGroup] = useState("");
  const [hwSubject, setHwSubject] = useState("");
  const [hwDue, setHwDue] = useState("");
  const [materials, setMaterials] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [groupCourse, setGroupCourse] = useState("2");
  const [subjectName, setSubjectName] = useState("");
  const [subjectCourse, setSubjectCourse] = useState("2");
  const [subjectSemester, setSubjectSemester] = useState("3");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("3");
  const [scheduleRows, setScheduleRows] = useState<Row[]>([]);
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const msg = (ok: string, err = "") => { setMessage(ok); setError(err); };

  async function loadBase() {
    const [o, g, s] = await Promise.all([adminOverview(), listGroups(), listSubjects()]);
    if (o.ok) { setCounts(o.data.counts); const x = o.data.site || {}; setSite({ title: String(x.title || "Медбиохим"), subtitle: String(x.subtitle || ""), description: String(x.description || ""), announcement_banner: String(x.announcement_banner || "") }); }
    else msg("", o.error.message);
    if (g.ok) { const list = g.data.items as any[]; setGroups(list); if (!selectedGroupId && list[0]) setSelectedGroupId(String(list.find(x => x.code === "МБ-201")?.id || list[0].id)); }
    if (s.ok) setSubjects(s.data.items as any[]);
  }

  async function loadTab(next = tab) {
    if (next === "users") {
      const [u, g] = await Promise.all([adminListUsers(), listGroups()]);
      if (g.ok) setGroups(g.data.items as any[]);
      if (u.ok) {
        const list = u.data.items as AdminUser[]; setUsers(list);
        const d: Record<string, { groupId: string; semester: string }> = {};
        list.forEach(x => d[x.id] = { groupId: String(x.group_id || ""), semester: String(x.semester || 3) });
        setDrafts(d);
      }
    }
    if (next === "schedule" && selectedGroupId) {
      const r = await adminListSchedule(selectedGroupId, Number(selectedSemester));
      if (r.ok) setScheduleRows((r.data.items || []).map(x => ({ ...x, localId: lid() })));
      else msg("", r.error.message);
    }
    if (next === "content") { const r = await adminListAnnouncements(); if (r.ok) setAnns(r.data.items); }
    if (next === "learning") { const r = await adminListHomeworks(); if (r.ok) setHomeworks(r.data.items || []); }
    if (next === "media") { const r = await adminListMaterials(); if (r.ok) setMaterials(r.data.items || []); }
    if (next === "learning" || next === "system") { const r = await adminListCommunity(); if (r.ok) setPosts(r.data.items || []); }
    if (next === "system") { const r = await health(); if (r.ok) setBackendHealth(r.data); }
  }

  useEffect(() => { if (!hasToken()) return; void loadBase(); }, []);
  useEffect(() => { if (!hasToken()) return; void loadTab(tab); }, [tab, selectedGroupId, selectedSemester]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter(x => !q || `${x.email || ""} ${x.full_name || ""} ${x.group_name || ""} ${x.group_code || ""}`.toLowerCase().includes(q));
  }, [users, userSearch]);

  if (!hasToken()) return <div className="card mx-auto max-w-md p-8 text-center"><h1 className="page-title">CMS Медбиохим</h1><p className="page-subtitle">Сначала войдите</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;

  const saveAcademic = async (u: AdminUser) => {
    const d = drafts[u.id];
    if (!d?.groupId) return msg("", "Выберите группу для пользователя");
    setBusy(true);
    const r = await api<{ academic: any }>("/admin/users/academic", { method: "POST", body: JSON.stringify({ user_id: u.id, group_id: d.groupId, semester: Number(d.semester) }) });
    setBusy(false);
    if (!r.ok) return msg("", r.error.message);
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, group_id: r.data.academic.group_id, group_name: r.data.academic.group_name, group_code: r.data.academic.group_code, course_number: r.data.academic.course_number, semester: r.data.academic.semester } : x));
    msg("Учебный контекст сохранён");
  };

  const saveSchedule = async () => {
    if (!selectedGroupId) return msg("", "Выберите группу");
    const entries = scheduleRows.map(({ localId, id, subject_name, ...x }) => x);
    setBusy(true); const r = await adminSaveSchedule({ group_id: selectedGroupId, semester: Number(selectedSemester), entries }); setBusy(false);
    if (!r.ok) return msg("", r.error.message); msg(`Расписание сохранено · версия ${r.data.version} · ${r.data.entries_saved} занятий`); await loadTab("schedule");
  };
  const addSchedule = () => setScheduleRows(x => [...x, { localId: lid(), id: lid(), group_id: selectedGroupId, date: new Date().toISOString().slice(0,10), start_time: "08:30", end_time: "10:10", subject_id: String(subjects[0]?.id || ""), subject_name: String(subjects[0]?.name || ""), type: "lecture", room: "", building: "", notes: "", is_cancelled: false }]);
  const patchRow = (id: string, p: Partial<Row>) => setScheduleRows(xs => xs.map(x => x.localId === id ? { ...x, ...p } : x));

  async function saveAnnouncement() { if (!announcementTitle.trim() || !announcementBody.trim()) return msg("", "Заполните заголовок и текст"); const r = await adminCreateAnnouncement(announcementTitle, announcementBody); if (!r.ok) return msg("", r.error.message); setAnnouncementTitle(""); setAnnouncementBody(""); msg("Объявление опубликовано"); await loadTab("content"); }
  async function saveSite() { const r = await adminUpdateSite(site); if (!r.ok) return msg("", r.error.message); msg("Настройки сайта сохранены"); }
  async function saveHomework() { if (!hwTitle.trim()) return msg("", "Введите название ДЗ"); const r = await adminCreateHomework({ title: hwTitle.trim(), description: hwDescription, group_id: hwGroup || undefined, subject_id: hwSubject || undefined, due_at: hwDue || undefined }); if (!r.ok) return msg("", r.error.message); setHwTitle(""); setHwDescription(""); setHwDue(""); msg("ДЗ создано"); await loadTab("learning"); }
  async function upload(file: File) { const r = await uploadFile(file, hwGroup || undefined); if (!r.ok) return msg("", r.error.message); msg("Файл загружен в storage"); await loadTab("media"); }

  const nav: Array<[Tab, string, any]> = [["overview","Обзор",LayoutDashboard],["users","Пользователи",Users],["academic","Академия",GraduationCap],["schedule","Расписание",CalendarDays],["content","Контент",BookOpen],["learning","ДЗ и сообщество",ShieldCheck],["media","Файлы / B2",HardDrive],["system","Система",Settings2]];

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><Link href="/admin" className="text-sm font-semibold" style={{color:"var(--primary)"}}>← Основная админка</Link><h1 className="mt-2 page-title">Центр управления Медбиохим</h1><p className="page-subtitle">Единая CMS: пользователи, группы, учебный контекст, расписание, контент, ДЗ, media и состояние backend.</p></div><button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={async()=>{setRefreshing(true);await loadBase();await loadTab();setRefreshing(false)}}><RefreshCw className={`h-4 w-4 ${refreshing?"animate-spin":""}`}/>Обновить</button></header>
    {error && <div className="rounded-xl px-4 py-3 text-sm" style={{background:"color-mix(in srgb,var(--danger) 10%,transparent)",color:"var(--danger)"}}>{error}</div>}
    {message && <div className="rounded-xl px-4 py-3 text-sm" style={{background:"color-mix(in srgb,var(--success) 10%,transparent)",color:"var(--success)"}}>{message}</div>}
    <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
      <aside className="card h-fit p-2 lg:sticky lg:top-4"><div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider" style={{color:"var(--muted)"}}>Control Center</div>{nav.map(([id,label,Icon])=><button key={id} type="button" onClick={()=>setTab(id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${tab===id?"app-sidebar-active":""}`} style={tab===id?undefined:{color:"var(--muted)"}}><Icon className="h-4 w-4"/>{label}</button>)}<Link href="/admin/questions" className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold" style={{background:"var(--primary-soft)",color:"var(--primary)"}}><Ticket className="h-4 w-4"/>Вопросы / билеты</Link><Link href="/admin/tools" className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold" style={{background:"var(--primary-soft)",color:"var(--primary)"}}><FileUp className="h-4 w-4"/>Импорт / инструменты</Link></aside>
      <section className="min-w-0 space-y-5">
        {tab==="overview"&&<><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(counts).map(([k,v])=><div className="card" key={k}><div className="text-xs uppercase" style={{color:"var(--muted)"}}>{k}</div><div className="mt-1 text-3xl font-extrabold" style={{color:"var(--primary)"}}>{v}</div></div>)}</div><div className="grid gap-4 lg:grid-cols-3"><div className="card lg:col-span-2"><h2 className="text-lg font-bold">Что управляется из CMS</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Feature title="Пользователи" text="Группа → курс из группы → семестр, роли, поиск."/><Feature title="Академия" text="Группы, предметы, курс, семестр, учебный контекст."/><Feature title="Расписание" text="Активная версия Supabase, редактирование занятий."/><Feature title="Контент" text="Сайт, объявления, экзаменационные вопросы и билеты."/><Feature title="Обучение" text="ДЗ, материалы, сообщество и проверка работ."/><Feature title="Storage" text="Загрузка и удаление файлов через backend/B2."/></div></div><div className="card"><div className="flex items-center gap-2 font-bold"><Activity className="h-5 w-5"/> Система</div><p className="mt-3 text-sm" style={{color:"var(--muted)"}}>CMS работает через API backend. Секреты Supabase/SpaceWeb не выдаются в браузер и не редактируются пользователем — только серверная конфигурация.</p><div className="mt-4 space-y-2 text-sm"><Status name="API" ok={Boolean(counts.groups!==undefined)}/><Status name="Supabase" ok={Boolean(Object.keys(counts).length)}/><Status name="Авторизация" ok={Boolean(user)}/></div></div></div></>}

        {tab==="users"&&<div className="card space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Пользователи и учебный контекст</h2><p className="text-sm" style={{color:"var(--muted)"}}>Для каждого пользователя: группа → курс из группы → семестр.</p></div><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4" style={{color:"var(--muted)"}}/><input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Поиск пользователя, группы…" className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm"/></div></div><div className="space-y-3">{filteredUsers.map(u=>{const d=drafts[u.id]||{groupId:String(u.group_id||""),semester:String(u.semester||3)};return <div key={u.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold">{u.full_name||u.email}</div><div className="text-xs" style={{color:"var(--muted)"}}>{u.email} · роли: {(u.roles||[]).join(", ")||"student"}</div></div><div className="text-xs font-semibold" style={{color:"var(--primary)"}}>{u.group_name||"Группа не назначена"} · {u.course_number??"—"} курс · {u.semester??"—"} сем.</div></div><div className="mt-3 grid gap-2 md:grid-cols-[1fr_150px_auto]"><select value={d.groupId} onChange={e=>setDrafts(x=>({...x,[u.id]:{...d,groupId:e.target.value}}))} className="rounded-xl border px-3 py-2 text-sm"><option value="">Выберите группу</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name||g.code} · {g.course_number?`${g.course_number} курс`:"курс не задан"}</option>)}</select><select value={d.semester} onChange={e=>setDrafts(x=>({...x,[u.id]:{...d,semester:e.target.value}}))} className="rounded-xl border px-3 py-2 text-sm">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} семестр</option>)}</select><button type="button" className="btn-primary" disabled={busy} onClick={()=>void saveAcademic(u)}>Сохранить</button></div><div className="mt-3 flex flex-wrap gap-1">{["student","teacher","moderator","admin"].map(role=><button key={role} type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={async()=>{const r=await adminSetUserRole(u.id,role,"assign");if(r.ok)msg(`Роль ${role} назначена`);else msg("",r.error.message)}}>+ {role}</button>)}</div></div>})}{filteredUsers.length===0&&<div className="py-8 text-center text-sm" style={{color:"var(--muted)"}}>Пользователи не найдены.</div>}</div></div>}

        {tab==="academic"&&<div className="grid gap-5 lg:grid-cols-2"><form className="card space-y-3" onSubmit={async e=>{e.preventDefault();const r=await createGroup({name:groupName,code:groupCode,course_number:Number(groupCourse)||undefined});if(!r.ok)return msg("",r.error.message);setGroupName("");setGroupCode("");msg("Группа создана");await loadBase()}}><h2 className="text-lg font-bold">Новая группа</h2><input required value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Название группы" className="w-full rounded-xl border px-3 py-2"/><input value={groupCode} onChange={e=>setGroupCode(e.target.value)} placeholder="Код, например МБ-202" className="w-full rounded-xl border px-3 py-2"/><input type="number" min="1" max="6" value={groupCourse} onChange={e=>setGroupCourse(e.target.value)} placeholder="Курс" className="w-full rounded-xl border px-3 py-2"/><button className="btn-primary">Создать группу</button></form><form className="card space-y-3" onSubmit={async e=>{e.preventDefault();const r=await createSubject({name:subjectName,course_number:Number(subjectCourse)||2,semester:Number(subjectSemester)||3});if(!r.ok)return msg("",r.error.message);setSubjectName("");msg("Предмет создан");await loadBase()}}><h2 className="text-lg font-bold">Новый предмет</h2><input required value={subjectName} onChange={e=>setSubjectName(e.target.value)} placeholder="Название предмета" className="w-full rounded-xl border px-3 py-2"/><div className="grid grid-cols-2 gap-2"><input type="number" min="1" max="6" value={subjectCourse} onChange={e=>setSubjectCourse(e.target.value)} className="rounded-xl border px-3 py-2" placeholder="Курс"/><input type="number" min="1" max="12" value={subjectSemester} onChange={e=>setSubjectSemester(e.target.value)} className="rounded-xl border px-3 py-2" placeholder="Семестр"/></div><button className="btn-primary">Создать предмет</button></form><div className="card lg:col-span-2"><h2 className="font-bold">Академический справочник</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{groups.map(g=><div key={g.id} className="rounded-xl border p-3"><b>{g.name}</b><div className="text-xs" style={{color:"var(--muted)"}}>{g.code||"—"} · {g.course_number?`${g.course_number} курс`:"курс не задан"}</div></div>)}</div></div></div>}

        {tab==="schedule"&&<div className="card space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Редактор расписания</h2><p className="text-sm" style={{color:"var(--muted)"}}>Сохраняет новую активную версию в Supabase.</p></div><button type="button" className="btn-primary" onClick={addSchedule}>+ Занятие</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Группа<select value={selectedGroupId} onChange={e=>setSelectedGroupId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">{groups.map(g=><option key={g.id} value={g.id}>{g.name||g.code}</option>)}</select></label><label className="text-sm">Семестр<select value={selectedSemester} onChange={e=>setSelectedSemester(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label></div><div className="space-y-2">{scheduleRows.slice(0,160).map(r=><div key={r.localId} className="rounded-2xl border p-3"><div className="grid gap-2 md:grid-cols-8"><input type="date" value={r.date||""} onChange={e=>patchRow(r.localId,{date:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input type="time" value={r.start_time||""} onChange={e=>patchRow(r.localId,{start_time:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input type="time" value={r.end_time||""} onChange={e=>patchRow(r.localId,{end_time:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><select value={String(r.subject_id||"")} onChange={e=>{const s=subjects.find(x=>String(x.id)===e.target.value);patchRow(r.localId,{subject_id:e.target.value,subject_name:s?.name||""})}} className="rounded-lg border px-2 py-2 text-xs md:col-span-2"><option value="">Предмет</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={r.type||"other"} onChange={e=>patchRow(r.localId,{type:e.target.value})} className="rounded-lg border px-2 py-2 text-xs">{TYPES.map(t=><option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select><input value={r.building||""} onChange={e=>patchRow(r.localId,{building:e.target.value})} placeholder="Корпус" className="rounded-lg border px-2 py-2 text-xs"/><input value={r.room||""} onChange={e=>patchRow(r.localId,{room:e.target.value})} placeholder="Аудитория" className="rounded-lg border px-2 py-2 text-xs"/><input value={r.notes||""} onChange={e=>patchRow(r.localId,{notes:e.target.value})} placeholder="Примечание" className="rounded-lg border px-2 py-2 text-xs md:col-span-3"/><button type="button" onClick={()=>setScheduleRows(xs=>xs.filter(x=>x.localId!==r.localId))} className="text-xs text-rose-600">Удалить</button></div></div>)}</div><button type="button" className="btn-primary" disabled={busy||!selectedGroupId} onClick={()=>void saveSchedule()}>Сохранить активную версию</button></div>}

        {tab==="content"&&<div className="space-y-5"><div className="grid gap-5 lg:grid-cols-2"><form className="card space-y-3" onSubmit={e=>{e.preventDefault();void saveAnnouncement()}}><h2 className="text-lg font-bold">Объявление</h2><input required value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} placeholder="Заголовок" className="w-full rounded-xl border px-3 py-2"/><textarea required rows={5} value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} placeholder="Текст" className="w-full rounded-xl border px-3 py-2"/><button className="btn-primary">Опубликовать</button></form><div className="card"><h2 className="text-lg font-bold">Текущие объявления</h2><div className="mt-3 space-y-2">{anns.map(a=><div key={a.id} className="rounded-xl border p-3"><b>{a.title}</b><p className="mt-1 text-sm" style={{color:"var(--muted)"}}>{a.body}</p><button className="mt-2 text-xs text-rose-600" onClick={async()=>{const r=await adminDeleteAnnouncement(a.id);if(!r.ok)return msg("",r.error.message);await loadTab("content")}}>Удалить</button></div>)}</div></div></div><form className="card space-y-3" onSubmit={e=>{e.preventDefault();void saveSite()}}><h2 className="text-lg font-bold">Настройки сайта</h2>{(["title","subtitle","description","announcement_banner"] as const).map(k=><label key={k} className="block text-sm">{k}<input value={site[k]} onChange={e=>setSite({...site,[k]:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2"/></label>)}<button className="btn-primary">Сохранить сайт</button></form></div>}

        {tab==="learning"&&<div className="space-y-5"><div className="grid gap-5 lg:grid-cols-2"><form className="card space-y-3" onSubmit={e=>{e.preventDefault();void saveHomework()}}><h2 className="text-lg font-bold">Новое ДЗ</h2><input required value={hwTitle} onChange={e=>setHwTitle(e.target.value)} placeholder="Название" className="w-full rounded-xl border px-3 py-2"/><textarea value={hwDescription} onChange={e=>setHwDescription(e.target.value)} rows={4} placeholder="Описание" className="w-full rounded-xl border px-3 py-2"/><select value={hwSubject} onChange={e=>setHwSubject(e.target.value)} className="w-full rounded-xl border px-3 py-2"><option value="">Все предметы</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={hwGroup} onChange={e=>setHwGroup(e.target.value)} className="w-full rounded-xl border px-3 py-2"><option value="">Все группы</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name||g.code}</option>)}</select><input type="datetime-local" value={hwDue} onChange={e=>setHwDue(e.target.value)} className="w-full rounded-xl border px-3 py-2"/><button className="btn-primary">Создать ДЗ</button></form><div className="card"><h2 className="text-lg font-bold">Задания</h2><div className="mt-3 space-y-2">{homeworks.map(h=><div key={h.id} className="rounded-xl border p-3 flex items-start justify-between gap-3"><div><b>{h.title}</b><div className="text-xs" style={{color:"var(--muted)"}}>{h.subject_name||"Без предмета"} · {h.group_name||"Все группы"}</div></div><button className="text-xs text-rose-600" onClick={async()=>{const r=await adminDeleteHomework(String(h.id));if(!r.ok)return msg("",r.error.message);await loadTab("learning")}}>Удалить</button></div>)}</div></div></div><div className="card"><h2 className="text-lg font-bold">Модерация сообщества</h2><div className="mt-3 space-y-2">{posts.map(p=><div key={p.id} className={`rounded-xl border p-3 ${p.hidden?"opacity-50":""}`}><div className="font-semibold">{p.title}</div><div className="text-xs" style={{color:"var(--muted)"}}>{p.author_name||"Студент"}</div><p className="mt-2 text-sm whitespace-pre-wrap">{p.body}</p><div className="mt-2 flex gap-2"><button className="rounded-lg border px-3 py-1 text-xs" onClick={async()=>{const r=await adminUpdateCommunity(String(p.id),{hidden:!p.hidden});if(!r.ok)return msg("",r.error.message);await loadTab("learning")}}>{p.hidden?"Показать":"Скрыть"}</button><button className="rounded-lg border px-3 py-1 text-xs" onClick={async()=>{const r=await adminDeleteCommunity(String(p.id));if(!r.ok)return msg("",r.error.message);await loadTab("learning")}}>Удалить</button></div></div>)}</div></div></div>}

        {tab==="media"&&<div className="space-y-5"><div className="card"><h2 className="text-lg font-bold">Storage / материалы</h2><p className="mt-1 text-sm" style={{color:"var(--muted)"}}>Файлы проходят через backend и metadata в Supabase; фактическое blob-хранилище остаётся на B2/Storage backend.</p><label className="mt-4 inline-flex cursor-pointer btn-primary"><span>Загрузить файл</span><input type="file" className="hidden" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.currentTarget.value=""}}/></label></div><div className="grid gap-3 md:grid-cols-3">{materials.map(m=><div key={m.id} className="card"><b className="line-clamp-2">{m.original_name||m.name||m.title}</b><div className="mt-1 text-xs" style={{color:"var(--muted)"}}>{m.mime_type||""} · {m.size_bytes||0} B</div><button className="mt-3 text-xs text-rose-600" onClick={async()=>{const r=await adminDeleteMaterial(String(m.id));if(!r.ok)return msg("",r.error.message);await loadTab("media")}}>Удалить</button></div>)}</div></div>}

        {tab==="system"&&<div className="grid gap-5 lg:grid-cols-2"><div className="card space-y-4"><h2 className="text-lg font-bold">Состояние backend / SpaceWeb</h2><Status name="API отвечает" ok={Boolean(backendHealth)}/><div className="rounded-xl border p-3 text-sm"><b>Health</b><pre className="mt-2 overflow-auto text-xs" style={{color:"var(--muted)"}}>{JSON.stringify(backendHealth||{loading:true},null,2)}</pre></div><button className="btn-secondary" onClick={()=>void loadTab("system")}>Проверить снова</button></div><div className="card space-y-4"><h2 className="text-lg font-bold">Supabase / CMS data</h2><div className="grid grid-cols-2 gap-3"><Mini label="Группы" value={groups.length}/><Mini label="Предметы" value={subjects.length}/><Mini label="Объявления" value={anns.length}/><Mini label="Пользователи" value={users.length}/></div><p className="text-xs" style={{color:"var(--muted)"}}>CMS работает через server-side API. Service key, DB password и B2 secret намеренно не выдаются в frontend и не должны редактироваться через браузер.</p><div className="flex flex-wrap gap-2"><Link href="/admin/questions" className="btn-secondary">Вопросы / билеты</Link><Link href="/progress" className="btn-secondary">Проверить прогресс</Link><Link href="/schedule" className="btn-secondary">Проверить расписание</Link></div></div></div>}
      </section>
    </div>
  </main>;
}

function Feature({title,text}:{title:string;text:string}){return <div className="rounded-xl border p-4"><div className="font-semibold">{title}</div><p className="mt-1 text-xs" style={{color:"var(--muted)"}}>{text}</p></div>}
function Status({name,ok}:{name:string;ok:boolean}){return <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>{name}</span><span className={ok?"badge-success":"badge-danger"}>{ok?"OK":"Проблема"}</span></div>}
function Mini({label,value}:{label:string;value:number}){return <div className="rounded-xl border p-3"><div className="text-xs" style={{color:"var(--muted)"}}>{label}</div><div className="mt-1 text-xl font-bold" style={{color:"var(--primary)"}}>{value}</div></div>}
