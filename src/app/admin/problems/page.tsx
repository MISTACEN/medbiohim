"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {Flag,Save,Plus,CheckCircle2} from "lucide-react";
import {adminProblemCenter,adminUpdateBankQuestion,adminUpdateQuestionReport,adminCreateWork,adminUpdateWork,hasToken} from "@/lib/api";

const labels:any={wrong_answer:"Неверный ответ",wording:"Ошибка формулировки",multiple_correct:"Несколько правильных",no_correct:"Нет правильного",typo:"Опечатка",other:"Другое"};

export default function ProblemCenter(){
 const [problems,setProblems]=useState<any[]>([]),[works,setWorks]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[draft,setDraft]=useState<any>(null),[tab,setTab]=useState("problems"),[msg,setMsg]=useState("");
 async function load(){const r=await adminProblemCenter();if(r.ok){setProblems(r.data.problems||[]);setWorks(r.data.works||[])}else setMsg(r.error.message)}
 useEffect(()=>{if(hasToken())void load()},[]);
 useEffect(()=>setDraft(selected?.question?{...selected.question}:null),[selected]);
 async function save(){if(!draft?.id)return;const r=await adminUpdateBankQuestion(draft.id,{text:draft.text,answer:draft.answer,options:draft.options});if(r.ok){setMsg("Вопрос исправлен.");setDraft(r.data.question);await load()}else setMsg(r.error.message)}
 async function close(p:any,status:any){for(const r of p.reports||[])await adminUpdateQuestionReport(r.id,status);await load();setMsg(status==="fixed"?"Проблема закрыта.":"Статус обновлён.")}
 async function work(p:any){const r=await adminCreateWork({title:"Исправить вопрос",description:(p.reports||[]).map((x:any)=>x.message).filter(Boolean).join("\n")||labels[p.category],question_id:p.question_id,report_id:p.reports?.[0]?.id,priority:"normal"});if(r.ok){setMsg("Работа создана.");await load()}else setMsg(r.error.message)}
 if(!hasToken())return <div className="card p-8">Войдите как администратор.</div>;
 return <div className="space-y-5">
  <header className="flex justify-between"><div><h1 className="page-title">Проблемы и работы</h1><p className="page-subtitle">Жалобы студентов, исправления и задачи</p></div><Link href="/admin" className="text-indigo-600">← Админка</Link></header>
  <div className="grid gap-3 sm:grid-cols-3">{[["Новые",problems.filter(p=>p.status==="new").length],["На проверке",problems.filter(p=>p.status==="reviewing").length],["Исправлены",problems.filter(p=>p.status==="fixed").length]].map(([a,n])=><div className="card" key={String(a)}><div className="text-xs text-slate-500">{a}</div><div className="text-2xl font-bold">{n}</div></div>)}</div>
  <div className="flex gap-2"><button onClick={()=>setTab("problems")} className={tab==="problems"?"btn-primary":"rounded-xl border px-4 py-2"}>Проблемы</button><button onClick={()=>setTab("works")} className={tab==="works"?"btn-primary":"rounded-xl border px-4 py-2"}>Работы ({works.filter(w=>w.status!=="done").length})</button></div>
  {msg&&<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
  {tab==="problems"?<div className="grid gap-5 lg:grid-cols-2"><div className="card divide-y p-0">{problems.length===0?<div className="p-8 text-center text-slate-500">Проблем нет.</div>:problems.map(p=><button key={p.question_id+"-"+p.category} onClick={()=>setSelected(p)} className="block w-full p-4 text-left hover:bg-slate-50"><b>{p.question?.text||"Вопрос"}</b><div className="text-xs text-slate-500">{labels[p.category]} · {p.report_count} обращ.</div></button>)}</div>
  <div className="card">{!selected?<div className="p-8 text-center text-slate-400">Выберите проблему.</div>:<div className="space-y-4"><h2 className="text-lg font-bold">Исправить вопрос</h2>
   <textarea rows={5} value={draft?.text||""} onChange={e=>setDraft({...draft,text:e.target.value})} className="w-full rounded-xl border p-3"/>
   <input value={draft?.answer||""} onChange={e=>setDraft({...draft,answer:e.target.value})} placeholder="Правильный ответ" className="w-full rounded-xl border p-3"/>
   <textarea rows={4} value={Array.isArray(draft?.options)?draft.options.join("\n"):""} onChange={e=>setDraft({...draft,options:e.target.value.split("\n").filter(Boolean)})} placeholder="Варианты, по одному в строке" className="w-full rounded-xl border p-3"/>
   <div className="rounded-xl bg-slate-50 p-3 text-sm"><b>{labels[selected.category]}</b>{(selected.reports||[]).map((r:any)=><div key={r.id} className="mt-2">{r.message||"Без комментария"}</div>)}</div>
   <div className="flex flex-wrap gap-2"><button onClick={()=>void save()} className="btn-primary inline-flex gap-2"><Save className="h-4 w-4"/>Сохранить</button><button onClick={()=>void work(selected)} className="rounded-xl border px-3 py-2 inline-flex gap-2"><Plus className="h-4 w-4"/>Работа</button><button onClick={()=>void close(selected,"fixed")} className="rounded-xl border px-3 py-2 text-emerald-700"><CheckCircle2 className="inline h-4 w-4"/> Исправлено</button><button onClick={()=>void close(selected,"rejected")} className="rounded-xl border px-3 py-2">Отклонить</button></div>
  </div>}</div></div>:<div className="card divide-y p-0">{works.map(w=><div key={w.id} className="p-4 flex justify-between gap-3"><div><b>{w.title}</b><p className="text-sm text-slate-500">{w.description}</p></div><select value={w.status} onChange={async e=>{await adminUpdateWork(w.id,{status:e.target.value});await load()}} className="h-10 rounded-xl border px-2"><option value="new">Новая</option><option value="in_progress">В работе</option><option value="review">На проверке</option><option value="done">Выполнена</option></select></div>)}</div>}
 </div>
}