"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CheckCircle2, ClipboardList, Loader2, Plus, Upload, X } from "lucide-react";
import { listHomeworks, createHomework, setHomeworkDone, submitHomework, uploadFile, listSubjectsCatalog, type ApiHomework } from "@/lib/api";

type Homework = ApiHomework & { due_date?: string; my_status?: string; my_completed?: boolean; created_by_role?: string; subject_slug?: string; color_hex?: string };
const PALETTE=["#2563eb","#7c3aed","#059669","#ea580c","#db2777","#0891b2","#65a30d","#9333ea","#0284c7","#ca8a04","#e11d48","#0f766e"];
function colorFor(h:any){if(/^#[0-9a-fA-F]{6}$/.test(String(h?.color_hex||"")))return h.color_hex;let s=String(h?.subject_slug||h?.subject_name||"subject"),n=0;for(let i=0;i<s.length;i++)n=((n<<5)-n+s.charCodeAt(i))|0;return PALETTE[Math.abs(n)%PALETTE.length]}
function monthDays(month:string){const [y,m]=month.split("-").map(Number);const first=new Date(Date.UTC(y,m-1,1));const start=(first.getUTCDay()+6)%7;const count=new Date(Date.UTC(y,m,0)).getUTCDate();const out:string[]=[];for(let i=0;i<start;i++){const d=new Date(Date.UTC(y,m-1,1-start+i));out.push(d.toISOString().slice(0,10))}for(let d=1;d<=count;d++)out.push(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`);while(out.length%7)out.push(new Date(Date.UTC(y,m-1,count+(out.length-(start+count))+1)).toISOString().slice(0,10));return out}
function status(h:Homework){if(h.my_completed===true||h.my_status==="done"||h.my_status==="completed"||h.submission_status==="submitted"||h.submission_status==="graded")return "done";if(h.due_date&&h.due_date<new Date().toISOString().slice(0,10))return "overdue";return "pending"}

export default function HomeworkPage(){
 const [items,setItems]=useState<Homework[]>([]);const [subjects,setSubjects]=useState<any[]>([]);
 const [month,setMonth]=useState(new Date().toISOString().slice(0,7));const [selectedDate,setSelectedDate]=useState(new Date().toISOString().slice(0,10));
 const [filter,setFilter]=useState<"all"|"pending"|"done">("all");const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState("");
 const [showAdd,setShowAdd]=useState(false);const [form,setForm]=useState({title:"",description:"",subject_id:"",due_date:selectedDate});
 const [openId,setOpenId]=useState<string|null>(null);const [answer,setAnswer]=useState("");

 async function reload(){const r=await listHomeworks();if(r.ok)setItems((r.data.items||[]) as Homework[]);else setError(r.error.message)}
 useEffect(()=>{void reload();void listSubjectsCatalog().then(r=>{if(r.ok)setSubjects(r.data.items||[])})},[]);
 useEffect(()=>setForm(f=>({...f,due_date:selectedDate})),[selectedDate]);

 const days=useMemo(()=>monthDays(month),[month]);
 const visible=items.filter(h=>filter==="all"||status(h)===filter);
 const dayItems=visible.filter(h=>(h.due_date||h.due_at?.slice(0,10))===selectedDate).sort((a,b)=>String(a.due_at||"").localeCompare(String(b.due_at||"")));
 const pending=items.filter(h=>status(h)!=="done").length;
 async function toggle(h:Homework){setBusy(h.id);const done=status(h)!=="done";const r=await setHomeworkDone(h.id,done);if(r.ok)setItems(xs=>xs.map(x=>x.id===h.id?{...x,my_status:done?"done":"pending"}:x));else setError(r.error.message);setBusy(null)}
 async function add(){if(!form.title.trim()||!form.subject_id||!form.due_date)return;setBusy("add");const r=await createHomework(form);if(r.ok){setShowAdd(false);setForm({title:"",description:"",subject_id:"",due_date:selectedDate});await reload()}else setError(r.error.message);setBusy(null)}
 async function submit(h:Homework,file?:File){setBusy(h.id);let fid:string|undefined;if(file){const u=await uploadFile(file);if(!u.ok){setError(u.error.message);setBusy(null);return}fid=u.data.file.id}const r=await submitHomework(h.id,answer||undefined,fid);if(r.ok){setItems(xs=>xs.map(x=>x.id===h.id?{...x,my_completed:true,submission_status:"submitted"}:x));setAnswer("");setOpenId(null)}else setError(r.error.message);setBusy(null)}

 return <div className="space-y-5">
  <header className="flex flex-wrap items-end justify-between gap-3">
   <div><h1 className="page-title">Задания</h1><p className="page-subtitle">Общий календарь ДЗ группы · каждый студент отмечает выполнение только для себя</p></div>
   <div className="flex items-center gap-2"><span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">Осталось: {pending}</span><button onClick={()=>setShowAdd(true)} className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4"/>Добавить ДЗ</button></div>
  </header>
  {error&&<div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button className="ml-2" onClick={()=>setError("")}>×</button></div>}
  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
   <section className="card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div className="flex items-center gap-2"><button className="rounded-lg border px-2 py-1" onClick={()=>setMonth(m=>{const [y,n]=m.split("-").map(Number);return new Date(Date.UTC(y,n-2,1)).toISOString().slice(0,7)})}>←</button><b>{new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(month+"-01T00:00:00Z"))}</b><button className="rounded-lg border px-2 py-1" onClick={()=>setMonth(m=>{const [y,n]=m.split("-").map(Number);return new Date(Date.UTC(y,n,1)).toISOString().slice(0,7)})}>→</button></div>
      <div className="flex gap-1">{([["all","Все"],["pending","Не сделано"],["done","Сделано"]] as const).map(([k,l])=><button key={k} onClick={()=>setFilter(k)} className={"rounded-lg px-3 py-1.5 text-xs font-semibold "+(filter===k?"bg-[var(--primary)] text-white":"border")}>{l}</button>)}</div>
    </div>
    <div className="grid grid-cols-7 border-b text-center text-xs font-semibold opacity-60">{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(x=><div key={x} className="p-2">{x}</div>)}</div>
    <div className="grid grid-cols-7">
      {days.map(day=>{const hs=visible.filter(h=>(h.due_date||h.due_at?.slice(0,10))===day);const inMonth=day.startsWith(month);return <button key={day} onClick={()=>setSelectedDate(day)} className={"min-h-24 border-b border-r p-2 text-left align-top "+(inMonth?"":"opacity-40")+" "+(day===selectedDate?"bg-[var(--primary-soft)]":"hover:bg-black/[.03]")}>
        <div className="flex items-center justify-between"><b className="text-sm">{Number(day.slice(8,10))}</b>{hs.length>0&&<span className="text-[10px] opacity-50">{hs.length}</span>}</div>
        <div className="mt-1 space-y-1">{hs.slice(0,3).map(h=><div key={h.id} className="truncate rounded px-1.5 py-1 text-[10px] font-semibold" style={{borderLeft:"3px solid "+colorFor(h),background:status(h)==="done"?"rgba(16,185,129,.10)":"rgba(255,255,255,.7)",textDecoration:status(h)==="done"?"line-through":"none"}}>{h.title}</div>)}{hs.length>3&&<div className="text-[10px] opacity-50">+ ещё {hs.length-3}</div>}</div>
      </button>})}
    </div>
   </section>
   <aside className="space-y-3">
    <div className="card p-4"><div className="mb-1 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--primary)]"/><b>{selectedDate}</b></div><p className="mb-3 text-xs opacity-60">Все ДЗ на этот день</p>
      {dayItems.length===0?<div className="rounded-xl border border-dashed p-5 text-center text-sm opacity-60">На этот день ДЗ нет</div>:dayItems.map(h=><article key={h.id} className="mb-3 rounded-xl border p-3" style={{borderLeft:"4px solid "+colorFor(h)}}>
        <div className="flex items-start gap-2"><button disabled={busy===h.id} onClick={()=>void toggle(h)} className={"mt-0.5 rounded-full "+(status(h)==="done"?"text-emerald-600":"text-slate-300")}><CheckCircle2 className="h-5 w-5"/></button><div className="min-w-0 flex-1"><b className={status(h)==="done"?"line-through opacity-60":""}>{h.title}</b><div className="mt-1 text-xs opacity-60">{h.subject_name||"Предмет"} · {h.created_by_role==="student"?"добавил студент":"добавлено системой"}{status(h)==="overdue"?" · просрочено":""}</div></div></div>
        {h.description&&<p className="mt-2 text-sm opacity-80">{h.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2">{status(h)!=="done"&&<button onClick={()=>void toggle(h)} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white">{busy===h.id?<Loader2 className="inline h-3 w-3 animate-spin"/>:"Отметить выполненным"}</button>}<button onClick={()=>setOpenId(openId===h.id?null:h.id)} className="rounded-lg border px-3 py-1.5 text-xs">Сдать работу</button></div>
        {openId===h.id&&<div className="mt-3 space-y-2 border-t pt-3"><textarea value={answer} onChange={e=>setAnswer(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-xs" rows={3} placeholder="Комментарий / ответ"/><div className="flex gap-2"><label className="cursor-pointer rounded-lg border px-3 py-2 text-xs"><Upload className="mr-1 inline h-3.5 w-3.5"/>Файл<input type="file" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void submit(h,f)}}/></label><button onClick={()=>void submit(h)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs text-white">Отправить</button></div></div>}
      </article>)}
    </div>
   </aside>
  </div>
  {showAdd&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="card w-full max-w-lg p-5">
    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Добавить ДЗ группе</h2><button onClick={()=>setShowAdd(false)}><X/></button></div>
    <p className="mb-4 rounded-xl bg-[var(--primary-soft)] p-3 text-xs">Это ДЗ увидит вся ваша группа. Каждый студент сам отметит, сделал он его или нет.</p>
    <div className="space-y-3"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Что нужно сделать" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><select value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm"><option value="">Выберите предмет</option>{subjects.map(s=><option key={s.id||s.slug} value={s.id}>{s.name}</option>)}</select><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm"/><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} placeholder="Подробности, страницы, номер задания..." className="w-full rounded-xl border px-3 py-2.5 text-sm"/><button disabled={busy==="add"} onClick={()=>void add()} className="btn-primary w-full">{busy==="add"?"Добавление…":"Добавить в календарь группы"}</button></div>
  </div></div>}
 </div>
}