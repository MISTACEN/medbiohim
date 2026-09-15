"use client";

import { useEffect, useState } from "react";

type Result = { ok: boolean; data?: any; error?: { message?: string } };
const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api/v1";

async function call(path: string, options: RequestInit = {}): Promise<Result> {
  const headers: Record<string, string> = { Accept: "application/json", ...(options.headers as Record<string, string> || {}) };
  const token = typeof window !== "undefined" ? localStorage.getItem("mb_access_token") : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  try {
    const r = await fetch(`${API}${path}`, { ...options, headers });
    const text = await r.text();
    const json = text ? JSON.parse(text) : {};
    return json;
  } catch { return { ok: false, error: { message: "Сеть недоступна или сервер вернул не JSON" } }; }
}

export default function AdminToolsPage() {
  const [tab, setTab] = useState<"homework" | "materials" | "community" | "import">("homework");
  const [items, setItems] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [importGroupId, setImportGroupId] = useState("");
  const [importSemester, setImportSemester] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function reload(t = tab) {
    const path = t === "homework" ? "/admin/homeworks" : t === "materials" ? "/admin/materials" : t === "community" ? "/admin/community" : "/admin/materials";
    const r = await call(path);
    if (r.ok) setItems(r.data?.items || []); else if (t !== "import") setMessage(r.error?.message || "Ошибка загрузки");
  }
  useEffect(() => { void reload(); void (async () => { const [g,s] = await Promise.all([call("/groups"), call("/subjects")]); if(g.ok) setGroups(g.data?.items || []); if(s.ok) setSubjects(s.data?.items || []); })(); }, [tab]);

  async function createHomework() {
    if (!title.trim()) return setMessage("Укажите название ДЗ");
    setBusy(true); const r = await call("/admin/homeworks", { method: "POST", body: JSON.stringify({ title: title.trim(), description, group_id: groupId || undefined, subject_id: subjectId || undefined, due_at: dueAt || undefined }) }); setBusy(false);
    if (!r.ok) return setMessage(r.error?.message || "Не удалось создать ДЗ");
    setTitle(""); setDescription(""); setDueAt(""); setMessage("ДЗ создано"); void reload("homework");
  }
  async function upload(file: File) {
    setBusy(true); const fd = new FormData(); fd.append("file", file); if(groupId) fd.append("group_id", groupId); const r = await call("/files/upload", { method: "POST", body: fd }); setBusy(false);
    setMessage(r.ok ? "Файл загружен" : (r.error?.message || "Ошибка загрузки")); if(r.ok) void reload("materials");
  }
  async function importExcel(mode: "curriculum" | "schedule", file: File) {
    setBusy(true); setMessage("");
    const fd = new FormData(); fd.append("file", file);
    if (mode === "schedule") { fd.append("group_id", importGroupId); if (importSemester) fd.append("semester", importSemester); }
    const r = await call(`/admin/import/${mode}`, { method: "POST", body: fd });
    setBusy(false);
    if (!r.ok) { setMessage(r.error?.message || "Импорт не выполнен"); return; }
    const d = r.data || {};
    setMessage(mode === "curriculum"
      ? `Учебный план импортирован: создано ${d.created ?? 0}, обновлено ${d.updated ?? 0}, пропущено ${d.skipped ?? 0}, ошибок ${d.errors?.length ?? 0}.`
      : `Расписание импортировано: сохранено ${d.saved ?? 0}, ошибок ${d.errors?.length ?? 0}.`);
  }
  async function mutate(path: string, method: string, body?: any) { const r = await call(path, { method, body: body ? JSON.stringify(body) : undefined }); setMessage(r.ok ? "Готово" : (r.error?.message || "Ошибка")); if(r.ok) void reload(); }

  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <div><a href="/admin" className="text-sm text-blue-600">← Вернуться в админку</a><h1 className="mt-2 text-3xl font-bold">Расширенное управление</h1><p className="text-slate-500">ДЗ, материалы, импорт Excel и модерация — без JSON.</p></div>
    {message && <div className="rounded-xl border p-3 text-sm">{message}</div>}
    <div className="flex flex-wrap gap-2">{[["homework","ДЗ и проверка"],["materials","Материалы"],["import","Импорт Excel"],["community","Сообщество"]].map(([id,label])=><button key={id} onClick={()=>setTab(id as any)} className={tab===id?"rounded-full bg-blue-600 px-4 py-2 text-sm text-white":"rounded-full border px-4 py-2 text-sm"}>{label}</button>)}</div>

    {tab === "homework" && <section className="space-y-4 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Создать домашнее задание</h2><div className="grid gap-3 md:grid-cols-2"><input className="rounded-xl border px-3 py-2" placeholder="Название ДЗ" value={title} onChange={e=>setTitle(e.target.value)}/><input className="rounded-xl border px-3 py-2" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/><select className="rounded-xl border px-3 py-2" value={subjectId} onChange={e=>setSubjectId(e.target.value)}><option value="">Любой предмет</option>{subjects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select className="rounded-xl border px-3 py-2" value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Все группы</option>{groups.map(x=><option key={x.id} value={x.id}>{x.name || x.code}</option>)}</select></div><textarea className="w-full rounded-xl border px-3 py-2" rows={4} placeholder="Условие / описание" value={description} onChange={e=>setDescription(e.target.value)}/><button disabled={busy} onClick={createHomework} className="rounded-xl bg-blue-600 px-4 py-2 text-white">Создать ДЗ</button><div className="space-y-2">{items.map(x=><div key={x.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><b>{x.title}</b><div className="text-sm text-slate-500">{x.subject_name || "Без предмета"} · {x.group_name || "Все группы"}</div></div><button className="text-sm text-red-600" onClick={()=>mutate(`/admin/homeworks/${x.id}`,"DELETE")}>Удалить</button></div>{x.submission_id && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{x.student_name || x.student_email} · {x.submission_status || "submitted"}<div className="mt-2">{x.text_answer}</div><div className="mt-2 flex gap-2"><input id={`g-${x.id}`} className="w-24 rounded border px-2 py-1" placeholder="Оценка"/><button className="rounded-lg bg-blue-600 px-3 py-1 text-white" onClick={()=>{const v=(document.getElementById(`g-${x.id}`) as HTMLInputElement)?.value; void mutate(`/submissions/${x.submission_id}/grade`,"POST",{grade:Number(v)})}}>Проверить</button></div></div>}</div>)}{!items.length&&<p className="text-sm text-slate-500">ДЗ пока нет.</p>}</div></section>}

    {tab === "materials" && <section className="space-y-4 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Материалы</h2><label className="inline-flex cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-white">{busy?"Загрузка…":"Загрузить файл"}<input type="file" className="hidden" disabled={busy} onChange={e=>{const f=e.target.files?.[0]; if(f) void upload(f); e.currentTarget.value=""}}/></label><p className="text-sm text-slate-500">До 15 МБ. Backend должен иметь настроенный B2 Storage.</p><div className="grid gap-3 md:grid-cols-3">{items.map(x=><div key={x.id} className="rounded-xl border p-4"><b>{x.original_name}</b><p className="text-xs text-slate-500">{x.mime_type} · {x.size_bytes || 0} B</p><button className="mt-2 text-sm text-red-600" onClick={()=>mutate(`/admin/materials/${x.id}`,"DELETE")}>Удалить</button></div>)}</div></section>}

    {tab === "import" && <section className="space-y-5 rounded-2xl border p-5"><div><h2 className="text-xl font-semibold">Импорт Excel</h2><p className="text-sm text-slate-500">Поддерживается XLSX. Перед импортом данные проверяются и ошибки возвращаются списком.</p></div><div className="grid gap-5 md:grid-cols-2"><div className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold">Учебный план</h3><p className="text-sm text-slate-500">Формат: Семестр, Дисциплина, Практические, Лекции, Форма контроля.</p><label className="inline-flex cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-white">{busy?"Импорт…":"Выбрать XLSX"}<input type="file" accept=".xlsx" className="hidden" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void importExcel("curriculum",f);e.currentTarget.value=""}}/></label></div><div className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold">Расписание</h3><select className="w-full rounded-xl border px-3 py-2" value={importGroupId} onChange={e=>setImportGroupId(e.target.value)}><option value="">Выберите группу</option>{groups.map(x=><option key={x.id} value={x.id}>{x.name || x.code}</option>)}</select><input className="w-full rounded-xl border px-3 py-2" placeholder="Семестр, например 3" value={importSemester} onChange={e=>setImportSemester(e.target.value)}/><p className="text-sm text-slate-500">Формат: Дата, Время/Начало/Конец, Дисциплина, Тип, Аудитория.</p><label className={`inline-flex cursor-pointer rounded-xl px-4 py-2 text-white ${importGroupId?"bg-blue-600":"bg-slate-400"}`}>{busy?"Импорт…":"Выбрать XLSX"}<input type="file" accept=".xlsx" className="hidden" disabled={busy||!importGroupId} onChange={e=>{const f=e.target.files?.[0];if(f)void importExcel("schedule",f);e.currentTarget.value=""}}/></label></div></div></section>}

    {tab === "community" && <section className="space-y-3 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Модерация сообщества</h2>{items.map(x=><article key={x.id} className={`rounded-xl border p-4 ${x.hidden?"opacity-50":""}`}><div className="flex justify-between gap-3"><div><b>{x.title}</b><p className="text-xs text-slate-500">{x.author_name || "Студент"} {x.pinned?"· закреплено":""}</p></div><button className="text-sm text-red-600" onClick={()=>mutate(`/admin/community/${x.id}`,"DELETE")}>Удалить</button></div><p className="mt-2 whitespace-pre-wrap text-sm">{x.body}</p><div className="mt-3 flex gap-2"><button className="rounded-lg border px-3 py-1 text-xs" onClick={()=>mutate(`/admin/community/${x.id}`,"PATCH",{pinned:!x.pinned})}>{x.pinned?"Открепить":"Закрепить"}</button><button className="rounded-lg border px-3 py-1 text-xs" onClick={()=>mutate(`/admin/community/${x.id}`,"PATCH",{hidden:!x.hidden})}>{x.hidden?"Показать":"Скрыть"}</button></div></article>)}{!items.length&&<p className="text-sm text-slate-500">Публикаций пока нет.</p>}</section>}
  </main>;
}
