"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { RichLectureEditor } from "@/components/admin/RichLectureEditor";
import { LectureLearningEditor } from "@/components/admin/LectureLearningEditor";
import Link from "next/link";
import { Save, Eye, EyeOff, X, ExternalLink } from "lucide-react";
import {
  adminDeleteLecture, adminGenerateLecture, adminListLectures, adminPublishLecture,
  adminRejectLecture, adminUpdateLecture, listSubjectsCatalog, getSubjectPlan,
  type Lecture,
} from "@/lib/api";

type Subject = { slug: string; name: string };
type LessonType = "lecture" | "practice" | "laboratory" | "seminar";
const LESSON_TYPES: Record<LessonType, string> = { lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная", seminar: "Семинар" };
type Attachment = {
  id?: string;
  file_id?: string;
  type: "image"|"video"|"pdf"|"file";
  name: string;
  url?: string;
  mime_type?: string;
  page?: number;
  caption?: string;
};
function htmlToPlainMarkdown(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/\u00a0/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const inner = [...el.childNodes].map(render).join("");
    switch (el.tagName) {
      case "H1": return "# "+inner.trim()+"\n\n";
      case "H2": return "## "+inner.trim()+"\n\n";
      case "H3": return "### "+inner.trim()+"\n\n";
      case "STRONG": case "B": return "**"+inner+"**";
      case "EM": case "I": return "*"+inner+"*";
      case "BLOCKQUOTE": return "> "+inner.trim()+"\n\n";
      case "LI": return "- "+inner.trim()+"\n";
      case "P": case "DIV": return inner.trim()+"\n\n";
      case "BR": return "\n";
      case "A": return "["+inner+"]("+(el.getAttribute("href")||"")+")";
      case "IMG": return `\n\`\`\`image\n${JSON.stringify({url:el.getAttribute("src"),caption:el.getAttribute("alt")||""})}\n\`\`\`\n`;
      default: return inner;
    }
  };
  return [...doc.body.childNodes].map(render).join("").replace(/\n{3,}/g,"\n\n").trim();
}

export default function AdminLecturesPage() {
  const [items,setItems]=useState<Lecture[]>([]);
  const [status,setStatus]=useState("pending_review");
  const [subjects,setSubjects]=useState<Subject[]>([]);
  const [slug,setSlug]=useState("");
  const [topic,setTopic]=useState("");
  const [lessonType,setLessonType]=useState<LessonType>("lecture");
  const [planTopics,setPlanTopics]=useState<string[]>([]);
  const [planLoading,setPlanLoading]=useState(false);
  const [notes,setNotes]=useState("");
  const [subjectFilter,setSubjectFilter]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState<string|null>(null);
  const [editId,setEditId]=useState<string|null>(null);
  const [editTitle,setEditTitle]=useState("");
  const [editTopic,setEditTopic]=useState("");
  const [editLessonType,setEditLessonType]=useState<LessonType>("lecture");
  const [editSummary,setEditSummary]=useState("");
  const [editBody,setEditBody]=useState("");
  const [editBodyHtml,setEditBodyHtml]=useState("");
  const [editAttachments,setEditAttachments]=useState<Attachment[]>([]);
  const [editLearning,setEditLearning]=useState<any>({methodics:[],files:[],preparations:[],electronograms:[]});
  const currentSubject=useMemo(()=>subjects.find(s=>s.slug===slug)||null,[subjects,slug]);

  async function reload(st=status){const r:any=await adminListLectures(st==="all"?undefined:st, subjectFilter || undefined);if(r.ok)setItems((r.data.items||[]) as Lecture[]);else setMsg(String(r.error?.message||"Ошибка"));}
  useEffect(()=>{void reload();},[status,subjectFilter]);
  useEffect(()=>{
    let alive=true;
    void listSubjectsCatalog().then((r:any)=>{
      if(!alive || !r.ok) return;
      const list=((r.data?.items||[]) as any[])
        .map(x=>({slug:String(x.slug||"").trim(),name:String(x.name||"").trim()}))
        .filter((x:Subject)=>x.slug && x.name);
      setSubjects(list);
      setSlug(current=>current && list.some(x=>x.slug===current) ? current : (list[0]?.slug||""));
    });
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{
    if(!slug){setPlanTopics([]);setTopic("");return;}
    let alive=true;
    setPlanLoading(true);
    void getSubjectPlan(slug).then((r:any)=>{
      if(!alive) return;
      const weeks=Array.isArray(r?.data?.plan?.weeks)?r.data.plan.weeks:[];
      const key=lessonType==="lecture"?"lecture":lessonType==="practice"?"practice":lessonType==="laboratory"?"practice":"practice";
      const topics=weeks
        .map((w:any)=>String(w?.[key]||"").trim())
        .filter(Boolean)
        .filter((v:string,i:number,a:string[])=>a.indexOf(v)===i);
      setPlanTopics(topics);
      setTopic(current=>current && topics.includes(current) ? current : "");
      setPlanLoading(false);
    }).catch(()=>{if(alive){setPlanTopics([]);setPlanLoading(false);}});
    return ()=>{alive=false;};
  },[slug,lessonType]);
  async function onGenerate(e:FormEvent){e.preventDefault();if(!topic.trim())return setMsg("Укажите тему");setBusy(true);setMsg(null);const r:any=await adminGenerateLecture({subject_slug:slug,topic:topic.trim(),lesson_type:lessonType,notes:notes.trim()||undefined});setBusy(false);if(!r.ok)return setMsg(String(r.error?.message||"Ошибка"));setMsg("Черновик создан и отправлен на проверку");setTopic("");await reload();}
  function openEdit(lec:any){setEditId(String(lec.id));setEditTitle(String(lec.title||""));setEditTopic(String(lec.topic||""));setEditLessonType((String(lec.lesson_type||"lecture") as LessonType));setEditSummary(String(lec.summary||""));setEditBody(String(lec.body_md || htmlToPlainMarkdown(String(lec.body_html||""))));setEditBodyHtml(String(lec.body_html||""));setEditAttachments(Array.isArray(lec.attachments)?lec.attachments:[]);setEditLearning(Array.isArray(lec.related_learning?.methodics)||Array.isArray(lec.related_learning?.files)||Array.isArray(lec.related_learning?.preparations)||Array.isArray(lec.related_learning?.electronograms)?lec.related_learning:{methodics:[],files:[],preparations:[],electronograms:[]});}
  async function saveEdit(){if(!editId)return;setBusy(true);const r:any=await adminUpdateLecture(editId,{title:editTitle,topic:editTopic,lesson_type:editLessonType,summary:editSummary,body_html:editBodyHtml,body_md:editBody,attachments:editAttachments,related_learning:editLearning});setBusy(false);setMsg(r.ok?"Лекция сохранена":"Ошибка сохранения: "+String(r.error?.message||""));if(r.ok){await reload();}}
  const subjectForEdit=subjects.find(s=>s.slug===String((items.find((x:any)=>x.id===editId) as any)?.subject_slug||""))||null;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="page-title">Лекции и контент</h1><p className="page-subtitle">Редактор лекций · форматирование · изображения · видео · PDF · поиск по интернету · публикация</p></div><Link href="/admin" className="text-sm text-[var(--primary)]">← Админ</Link></div>
    <form onSubmit={onGenerate} className="card space-y-3 p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--primary)]"/><h2 className="font-bold">Создать лекцию по учебному плану</h2></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Предмет</span><select value={slug} onChange={e=>setSlug(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">{subjects.map(s=><option key={s.slug} value={s.slug}>{s.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Тип занятия</span><select value={lessonType} onChange={e=>setLessonType(e.target.value as LessonType)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">{Object.entries(LESSON_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Тема</span>{planTopics.length>0?<select value={topic} onChange={e=>setTopic(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2"><option value="">{planLoading?"Загрузка тем…":"Выберите тему из учебного плана"}</option>{planTopics.map((t,i)=><option key={i} value={t}>{t}</option>)}</select>:<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder={planLoading?"Загрузка тем…":"Для этого предмета темы не найдены — введите тему вручную"} className="w-full rounded-xl border border-[var(--border)] px-3 py-2"/>}</label></div><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="Дополнительные акценты…"/><button disabled={busy} className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white">{busy?"Создание…":"Сгенерировать черновик"}</button></form>
    {msg&&<div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">{msg}</div>}
    <div className="flex flex-wrap items-center gap-2"><select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)} className="rounded-full border px-3 py-1.5 text-xs font-semibold"><option value="">Все предметы</option>{subjects.map(s=><option key={s.slug} value={s.slug}>{s.name}</option>)}</select>{["pending_review","published","rejected","all"].map(s=><button key={s} type="button" onClick={()=>setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status===s?"bg-[var(--primary)] text-white":"border border-[var(--border)]"}`}>{s==="pending_review"?"На проверке":s==="published"?"Опубликовано":s==="rejected"?"Отклонено":"Все"}</button>)}</div>
    <div className="space-y-3">{items.map((lec:any)=><div key={lec.id} className="card space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{lec.title}</div><div className="mt-1 flex flex-wrap gap-1.5 text-xs"><span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{lec.subject || "Предмет не указан"}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{LESSON_TYPES[String(lec.lesson_type||"lecture") as LessonType] || "Лекция"}</span><span className="text-[var(--muted)]">{lec.topic || "Тема не указана"} · {lec.status}</span></div></div><div className="flex flex-wrap gap-2">{lec.status!=="published"&&<button type="button" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={async()=>{const r:any=await adminPublishLecture(lec.id);setMsg(r.ok?"Опубликовано":String(r.error?.message||"Ошибка"));await reload();}}>Опубликовать</button>}{lec.status==="pending_review"&&<button type="button" className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700" onClick={async()=>{const r:any=await adminRejectLecture(lec.id);setMsg(r.ok?"Отклонено":String(r.error?.message||"Ошибка"));await reload();}}>Отклонить</button>}<button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" onClick={()=>openEdit(lec)}>{editId===lec.id?"Редактор открыт":"Открыть редактор"}</button><button type="button" className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600" onClick={async()=>{if(!confirm("Удалить лекцию?"))return;await adminDeleteLecture(lec.id);await reload();}}>Удалить</button></div></div>{lec.summary&&<p className="text-xs text-[var(--muted)]">{lec.summary}</p>}{editId===lec.id&&<div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3"><div className="grid gap-3 sm:grid-cols-2"><input value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="rounded-xl border p-2 text-sm" placeholder="Название лекции"/><input value={editTopic} onChange={e=>setEditTopic(e.target.value)} className="rounded-xl border p-2 text-sm" placeholder="Тема"/><select value={editLessonType} onChange={e=>setEditLessonType(e.target.value as LessonType)} className="rounded-xl border p-2 text-sm">{Object.entries(LESSON_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input value={editSummary} onChange={e=>setEditSummary(e.target.value)} className="rounded-xl border p-2 text-sm sm:col-span-2" placeholder="Краткое описание"/></div><div className="mt-3"><RichLectureEditor value={editBody} onChange={(next)=>{setEditBody(next.markdown);setEditBodyHtml(next.html)}} attachments={editAttachments} setAttachments={setEditAttachments} subject={subjectForEdit||currentSubject} topic={editTopic}/><LectureLearningEditor value={editLearning} onChange={setEditLearning} subject={subjectForEdit||currentSubject}/></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void saveEdit()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white"><Save className="h-4 w-4"/>{busy?"Сохраняю…":"Сохранить лекцию"}</button><button type="button" className="rounded-xl border px-4 py-2.5 text-sm" onClick={()=>setEditId(null)}>Закрыть</button></div></div>}{Array.isArray(lec.attachments)&&lec.attachments.length>0&&editId!==lec.id&&<div className="flex flex-wrap gap-2">{lec.attachments.map((a:any,i:number)=><span key={i} className="rounded-full border px-2 py-1 text-xs">{String(a.type||"file").toUpperCase()} · {String(a.name||"файл")}</span>)}</div>}</div>)}{items.length===0&&<div className="card p-6 text-sm text-[var(--muted)]">Пусто в этом фильтре.</div>}</div>
  </div>;
}
