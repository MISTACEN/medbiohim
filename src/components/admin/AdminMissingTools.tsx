"use client";

import { useEffect, useState } from "react";
import {
  adminCreateHomework, adminDeleteCommunity, adminDeleteHomework, adminDeleteMaterial,
  adminListCommunity, adminListHomeworks, adminListMaterials, adminUpdateCommunity,
  listGroups, listSubjects, uploadFile, api,
} from "@/lib/api";

type Props = { onMessage?: (message: string, error?: boolean) => void };
type AdminRow = Record<string, any>;

export function AdminMissingTools({ onMessage }: Props) {
  const [section, setSection] = useState<"homework" | "materials" | "community">("homework");
  const [homeworks, setHomeworks] = useState<AdminRow[]>([]);
  const [materials, setMaterials] = useState<AdminRow[]>([]);
  const [posts, setPosts] = useState<AdminRow[]>([]);
  const [groups, setGroups] = useState<AdminRow[]>([]);
  const [subjects, setSubjects] = useState<AdminRow[]>([]);
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState(""); const [groupId, setGroupId] = useState(""); const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload(kind = section) {
    if (kind === "homework") { const r = await adminListHomeworks(); if (r.ok) setHomeworks(r.data.items || []); }
    if (kind === "materials") { const r = await adminListMaterials(); if (r.ok) setMaterials(r.data.items || []); }
    if (kind === "community") { const r = await adminListCommunity(); if (r.ok) setPosts(r.data.items || []); }
  }
  useEffect(() => { void reload(section); void (async()=>{ const [g,s]=await Promise.all([listGroups(),listSubjects()]); if(g.ok)setGroups(g.data.items as AdminRow[]); if(s.ok)setSubjects(s.data.items as AdminRow[]); })(); }, [section]);

  async function createHomework() {
    if (!title.trim()) return onMessage?.("Укажите название ДЗ", true); setBusy(true);
    const r=await adminCreateHomework({title:title.trim(),description,subject_id:subjectId||undefined,group_id:groupId||undefined,due_at:dueAt||undefined}); setBusy(false);
    if(!r.ok)return onMessage?.(r.error.message,true); setTitle("");setDescription("");setDueAt("");await reload("homework");onMessage?.("Домашнее задание создано");
  }
  async function uploadMaterial(file: File) { setBusy(true);const r=await uploadFile(file,groupId||undefined);setBusy(false);if(!r.ok)return onMessage?.(r.error.message,true);await reload("materials");onMessage?.("Файл загружен"); }
  async function moderate(id:string,patch:Record<string,unknown>){const r=await adminUpdateCommunity(id,patch);if(!r.ok)return onMessage?.(r.error.message,true);await reload("community");onMessage?.("Пост обновлён");}

  return <div className="card space-y-5">
    <div><h2 className="text-lg font-semibold">ДЗ, файлы и сообщество</h2><p className="text-sm text-slate-500">Проверка заданий, загрузка материалов и модерация — без JSON и SQL.</p></div>
    <div className="flex flex-wrap gap-2">{([['homework','ДЗ и проверка'],['materials','Материалы'],['community','Сообщество']] as const).map(([id,label])=><button key={id} type="button" onClick={()=>setSection(id)} className={section===id?"rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white":"rounded-full border px-3 py-1.5 text-xs"}>{label}</button>)}</div>

    {section==="homework"&&<div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-2">
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Название ДЗ" className="rounded-xl border px-3 py-2 text-sm"/>
        <input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"/>
        <select value={subjectId} onChange={e=>setSubjectId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="">Предмет — любой</option>{subjects.map(s=><option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}</select>
        <select value={groupId} onChange={e=>setGroupId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="">Группа — все</option>{groups.map(g=><option key={String(g.id)} value={String(g.id)}>{String(g.name||g.code)}</option>)}</select>
      </div>
      <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Условие / описание" className="w-full rounded-xl border px-3 py-2 text-sm"/>
      <button type="button" disabled={busy} onClick={createHomework} className="btn-primary">Создать ДЗ</button>
      <div className="space-y-2">{homeworks.map((h,i)=><div key={String(h.id||i)} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{String(h.title)}</div><div className="text-xs text-slate-500">{String(h.subject_name||"Без предмета")} · {String(h.group_name||"Все группы")}</div></div><button type="button" className="text-xs text-rose-600" onClick={async()=>{if(!confirm("Удалить это задание?"))return;const r=await adminDeleteHomework(String(h.id));if(!r.ok)return onMessage?.(r.error.message,true);await reload("homework");onMessage?.("Задание удалено")}}>Удалить</button></div>
      {h.submission_id&&<div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><b>{String(h.student_name||h.student_email||"Студент")}</b> · {String(h.submission_status||"submitted")} {h.grade!=null?`· оценка ${String(h.grade)}`:""}<p className="mt-1 whitespace-pre-wrap">{String(h.text_answer||"")}</p><GradeBox id={String(h.submission_id)} onDone={()=>reload("homework")} onMessage={onMessage}/></div>}</div>)}{homeworks.length===0&&<div className="text-sm text-slate-500">ДЗ пока нет.</div>}</div>
    </div>}

    {section==="materials"&&<div className="space-y-4"><div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4"><label className="btn-primary cursor-pointer">Загрузить файл<input type="file" className="hidden" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void uploadMaterial(f);e.currentTarget.value=""}}/></label><span className="text-xs text-slate-500">До 12 МБ · ограничение API загрузки.</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{materials.map((m,i)=><div key={String(m.id||i)} className="rounded-xl border p-3"><div className="font-medium line-clamp-2">{String(m.original_name)}</div><div className="mt-1 text-xs text-slate-500">{String(m.mime_type||"")} · {String(m.size_bytes||0)} B</div><button type="button" className="mt-2 text-xs text-rose-600" onClick={async()=>{if(!confirm("Удалить материал?"))return;const r=await adminDeleteMaterial(String(m.id));if(!r.ok)return onMessage?.(r.error.message,true);await reload("materials");onMessage?.("Материал удалён")}}>Удалить</button></div>)}</div>{materials.length===0&&<div className="text-sm text-slate-500">Материалов пока нет.</div>}</div>}

    {section==="community"&&<div className="space-y-3">{posts.map((p,i)=><div key={String(p.id||i)} className={`rounded-xl border p-3 ${p.hidden?"opacity-50":""}`}><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{String(p.title)}</div><div className="text-xs text-slate-500">{String(p.author_name||"Студент")} {p.pinned?"· закреплено":""}</div></div><button type="button" className="text-xs text-rose-600" onClick={async()=>{if(!confirm("Удалить публикацию?"))return;const r=await adminDeleteCommunity(String(p.id));if(!r.ok)return onMessage?.(r.error.message,true);await reload("community");onMessage?.("Публикация удалена")}}>Удалить</button></div><p className="mt-2 text-sm whitespace-pre-wrap">{String(p.body)}</p><div className="mt-3 flex gap-2"><button type="button" disabled title="В текущей схеме community_posts нет поля закрепления" className="rounded-lg border px-3 py-1 text-xs opacity-50 cursor-not-allowed">Закрепление недоступно</button><button type="button" className="rounded-lg border px-3 py-1 text-xs" onClick={()=>moderate(String(p.id),{hidden:!Boolean(p.hidden)})}>{p.hidden?"Показать":"Скрыть"}</button></div></div>)}{posts.length===0&&<div className="text-sm text-slate-500">Публикаций пока нет.</div>}</div>}
  </div>;
}

function GradeBox({id,onDone,onMessage}:{id:string;onDone:()=>void;onMessage?:Props['onMessage']}){const[g,setG]=useState("");const[c,setC]=useState("");const[b,setB]=useState(false);async function save(){if(!g)return onMessage?.("Укажите оценку",true);setB(true);const r=await api(`/submissions/${id}/grade`,{method:"POST",body:JSON.stringify({grade:Number(g),comment:c})});setB(false);if(!r.ok)return onMessage?.(r.error.message,true);onDone();onMessage?.("Работа оценена")}return <div className="mt-2 flex flex-wrap gap-2"><input type="number" min="0" max="100" step="0.1" value={g} onChange={e=>setG(e.target.value)} placeholder="Оценка" className="w-24 rounded border px-2 py-1 text-xs"/><input value={c} onChange={e=>setC(e.target.value)} placeholder="Комментарий" className="min-w-48 flex-1 rounded border px-2 py-1 text-xs"/><button type="button" disabled={b} onClick={save} className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white">Проверить</button></div>}
