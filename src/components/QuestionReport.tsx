"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { reportQuestion } from "@/lib/api";

const categories=[
 ["wrong_answer","Неверный ответ"],["wording","Ошибка в формулировке"],["multiple_correct","Несколько правильных ответов"],
 ["no_correct","Нет правильного варианта"],["typo","Опечатка"],["other","Другое"]
] as const;

export function QuestionReport({questionId}:{questionId:string}){
 const [open,setOpen]=useState(false),[category,setCategory]=useState("wrong_answer"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState("");
 async function send(){
  setBusy(true);setError("");
  const r=await reportQuestion(questionId,category,message);
  if(r.ok){setDone(true);setTimeout(()=>{setOpen(false);setDone(false)},1400)} else setError(r.error.message);
  setBusy(false);
 }
 return <div className="mt-2">
  <button type="button" onClick={()=>setOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-600"><Flag className="h-3.5 w-3.5"/>Сообщить об ошибке</button>
  {open&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4" onMouseDown={()=>setOpen(false)}>
   <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onMouseDown={e=>e.stopPropagation()}>
    <div className="text-lg font-bold">Сообщить об ошибке</div>
    {done?<div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">✓ Сообщение отправлено. Спасибо!</div>:<>
    <p className="mt-1 text-sm text-slate-500">Укажите, что именно нужно проверить.</p>
    <div className="mt-4 grid gap-2">{categories.map(([v,l])=><label key={v} className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="radio" checked={category===v} onChange={()=>setCategory(v)}/>{l}</label>)}</div>
    <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={3} placeholder="Что именно здесь не так? (необязательно)" className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"/>
    {error&&<div className="mt-2 text-sm text-rose-600">{error}</div>}
    <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border px-4 py-2 text-sm">Отмена</button><button type="button" disabled={busy} onClick={()=>void send()} className="btn-primary">{busy?"Отправка…":"Отправить"}</button></div>
    </>}
   </div>
  </div>}
 </div>
}