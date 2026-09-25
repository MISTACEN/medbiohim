"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, FileText, SkipForward, X } from "lucide-react";
import { getTrainerImageUrl } from "@/lib/api";
import { listTrainerFeed, submitTrainerAnswer, type TrainerCard } from "@/lib/content-api";

type Mode = "all" | "preparation" | "electronogram" | "electronogram_label";
type Experience = "study" | "prepare" | "exam";
const shuffle = <T,>(a:T[]) => {
  const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x;
};
function Reference({items}:{items:any[]}) {
  if(!items.length) return null;
  return <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
    <b>Эталонная разметка</b><div className="mt-2 grid gap-2 sm:grid-cols-2">{items.map((h:any)=><div key={h.id} className="rounded-lg bg-white/80 px-2 py-1.5"><b>{h.id}.</b> {h.label}</div>)}</div>
  </div>;
}

export default function HistologyTrainerPage(){
  const [cards,setCards]=useState<TrainerCard[]>([]),[index,setIndex]=useState(0),[selected,setSelected]=useState<string|null>(null);
  const [result,setResult]=useState<boolean|null>(null),[showAnswer,setShowAnswer]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
  const [startedAt,setStartedAt]=useState(Date.now),[mode,setMode]=useState<Mode>("all"),[experience,setExperience]=useState<Experience>("prepare"),[category,setCategory]=useState("all");
  const [practiceCards,setPracticeCards]=useState<TrainerCard[]>([]),[examCards,setExamCards]=useState<TrainerCard[]>([]),[examAnswers,setExamAnswers]=useState<Record<string,{optionId:string;correct:boolean}>>({}),[examFinished,setExamFinished]=useState(false);
  const [labels,setLabels]=useState<Record<string,string>>({}),[labelChecked,setLabelChecked]=useState(false),[currentImage,setCurrentImage]=useState<string|null>(null);

  useEffect(()=>{ void listTrainerFeed("histology","mbh",500).then(r=>{
    if(!r.ok){setError(r.error.message);setLoading(false);return;}
    setCards(r.data.items||[]);
    setLoading(false);
  });},[]);

  const base=useMemo(()=>{let a=mode==="all"?cards:cards.filter(c=>c.mode_set===mode);return category==="all"?a:a.filter(c=>Array.isArray(c.tags)&&c.tags.includes(category));},[cards,mode,category]);
  useEffect(()=>{setIndex(0);setSelected(null);setResult(null);setShowAnswer(false);setLabels({});setLabelChecked(false);if(experience==="exam"){setExamCards(shuffle(base));setExamAnswers({});setExamFinished(false);}else{setPracticeCards(shuffle(base));setExamCards([]);}},[experience,base]);
  const visible=experience==="exam"?examCards:practiceCards, card:any=visible[index];
  useEffect(()=>{
    let alive=true;
    let objectUrl:string|null=null;
    setCurrentImage(null);
    if(!card) return;
    void getTrainerImageUrl(card.id).then((url)=>{
      if(!alive){if(url)URL.revokeObjectURL(url);return;}
      objectUrl=url;
      setCurrentImage(url);
    });
    return ()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[card?.id]);
  const options=Array.isArray(card?.question?.options)?card.question.options:[], hotspots=Array.isArray(card?.hotspots)?card.hotspots:[];
  const answered=result!==null||labelChecked||(experience==="exam"&&!!examAnswers[card?.id]);
  const categories=useMemo(()=>["all",...Array.from(new Set(cards.flatMap((c:any)=>Array.isArray(c.tags)?c.tags:[]))).sort()],[cards]);

  const reset=()=>{setSelected(null);setResult(null);setShowAnswer(false);setLabels({});setLabelChecked(false);setStartedAt(Date.now());};
  const changeMode=(m:Mode)=>{setMode(m);reset();};
  async function answer(id:string){
    if(!card||answered)return; setSelected(id);
    const correct=options.some((o:any)=>o.id===id&&o.correct===true);
    if(experience==="exam"){setExamAnswers(v=>({...v,[card.id]:{optionId:id,correct}}));return;}
    const r=await submitTrainerAnswer({card_id:card.id,option_id:id,time_ms:Date.now()-startedAt});
    if(!r.ok){setError(r.error.message);return;} setResult(r.data.correct);setShowAnswer(true);
  }
  async function skip(){if(!card||answered||experience==="exam")return;await submitTrainerAnswer({card_id:card.id,is_skipped:true,time_ms:Date.now()-startedAt});next();}
  function next(){setIndex(i=>visible.length?(i+1)%visible.length:0);reset();}
  async function finish(){for(const c of visible){const a=examAnswers[c.id];if(a)await submitTrainerAnswer({card_id:c.id,option_id:a.optionId,time_ms:0});}setExamFinished(true);}

  if(loading)return <div className="card p-6 text-sm text-slate-500">Загрузка тренажёра…</div>;
  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline"><ArrowLeft className="h-4 w-4"/>К предметам</Link><div className="mt-3 text-xs font-bold uppercase tracking-wider text-indigo-500">Только МБХ · Гистология</div><h1 className="page-title">Тренажёр препаратов и электронограмм</h1><p className="page-subtitle">Подготовка: эталон появляется только после ошибки. Экзамен: карточки перемешиваются, разбор — после завершения.</p></div><Link href="/materials?subject_slug=histology" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><FileText className="h-4 w-4"/>Материалы</Link></header>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    <div className="flex flex-wrap items-center gap-2">
      <b className="text-sm text-slate-700">Формат:</b>{([["study","📚 Изучение"],["prepare","🎯 Подготовка"],["exam","📝 Экзамен"]] as const).map(([id,l])=><button key={id} onClick={()=>setExperience(id)} className={"rounded-xl px-3 py-2 text-sm font-semibold "+(experience===id?"bg-indigo-600 text-white":"border bg-white")}>{l}</button>)}
      <span className="mx-1 h-6 w-px bg-slate-200"/><b className="text-sm text-slate-700">Материал:</b>
      {([["all","Все"],["preparation","Микропрепараты"],["electronogram","Электронограммы"],["electronogram_label","Заполнить подписи"]] as const).map(([id,l])=><button key={id} disabled={id==="electronogram_label"&&cards.filter(c=>c.mode_set===id).length===0} onClick={()=>changeMode(id)} className={"rounded-xl px-3 py-2 text-sm font-semibold "+(mode===id?"bg-indigo-600 text-white":"border bg-white")}>{l}</button>)}
      <label className="ml-2 text-sm font-semibold">Раздел <select value={category} onChange={e=>setCategory(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm">{categories.map(c=><option key={c} value={c}>{c==="all"?"Все":c}</option>)}</select></label>
      <label className="text-sm font-semibold">Вопросов <select value={questionCount} onChange={e=>setQuestionCount(Number(e.target.value))} className="rounded-xl border bg-white px-3 py-2 text-sm">{[5,10,20,30,50,100].map(n=><option key={n} value={n}>{n}</option>)}<option value={500}>Все доступные</option></select></label><span className="ml-auto text-xs text-slate-500">{visible.length} случайных карточек</span>
    </div>
    {!card?<div className="card p-8 text-center text-sm text-slate-500">Карточки пока недоступны для этой специальности.</div>:
    examFinished?<div className="card p-6"><h2 className="text-2xl font-bold">Экзамен завершён</h2><p className="mt-2 text-slate-600">Правильные ответы и эталонная разметка теперь открыты.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4">Вопросов <b className="block text-xl">{visible.length}</b></div><div className="rounded-xl bg-slate-50 p-4">Отвечено <b className="block text-xl">{Object.keys(examAnswers).length}</b></div><div className="rounded-xl bg-slate-50 p-4">Правильно <b className="block text-xl">{Object.values(examAnswers).filter(x=>x.correct).length}</b></div></div><div className="mt-6 space-y-4">{visible.map((c:any,i)=><div key={c.id} className="rounded-xl border p-4"><b>Вопрос {i+1}: {c.question?.prompt||"Что изображено?"}</b><div className="mt-2"><b>Эталон:</b> {c.preparation?.name||c.question?.options?.find((o:any)=>o.correct)?.label||"—"}</div><Reference items={Array.isArray(c.hotspots)?c.hotspots:[]}/></div>)}</div><button className="btn-primary mt-5" onClick={()=>setExperience("exam")}>Пройти ещё раз</button></div>:
    <div className="card overflow-hidden"><div className="flex justify-between border-b bg-slate-50 px-5 py-3 text-xs text-slate-500"><span>Карточка {index+1} / {visible.length}</span><span>{card.mode_set==="electronogram_label"?"Электронограмма · подписи":card.mode_set==="electronogram"?"Электронограмма":"Микропрепарат"} · МБХ</span></div><div className="grid lg:grid-cols-[1.15fr_.85fr]">
      <div className="relative flex min-h-[360px] items-center justify-center bg-slate-100">{currentImage?<img src={currentImage} alt={card.preparation?.name||"Препарат"} className="min-h-[360px] h-full w-full object-contain"/>:<div className="p-6 text-center text-sm text-slate-500"><b>Фото загружается или пока не установлено</b><div className="mt-2 break-all text-xs">{card.preparation?.imagePath||card.preparation?.imageUrl||"Путь к изображению не указан"}</div></div>}{(experience==="study"||(experience==="prepare"&&result===false))&&hotspots.length>0&&<div className="absolute inset-x-3 bottom-3 rounded-xl bg-white/90 p-3 shadow backdrop-blur"><div className="text-xs font-bold uppercase text-slate-500">Правильные метки</div><div className="mt-2 flex flex-wrap gap-1.5">{hotspots.map((h:any)=><span key={h.id} className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">{h.id}: {h.label}</span>)}</div></div>}</div>
      <div className="space-y-4 p-5"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{experience==="study"?(card.preparation?.name||"Препарат"):card.mode_set==="preparation"?"Микропрепарат · определение по фото":card.preparation?.organ||"Препарат"}</div><h2 className="mt-1 text-xl font-bold">{card.mode_set==="preparation"?"Какой это препарат?":card.question?.prompt||"Что изображено?"}</h2></div>
      {card.question?.mode==="label_fill"?<div className="space-y-3">{hotspots.map((h:any)=><div key={h.id} className="rounded-xl border p-3"><div className="mb-2 text-xs font-bold text-slate-400">Метка {h.id}</div><input value={labels[h.id]||""} disabled={labelChecked} onChange={e=>setLabels(v=>({...v,[h.id]:e.target.value}))} placeholder="Введите название структуры" className="w-full rounded-lg border px-3 py-2 text-sm"/>{labelChecked&&<div className="mt-2 text-xs">Эталон: <b>{h.label}</b></div>}</div>)}<button disabled={labelChecked||hotspots.some((h:any)=>!(labels[h.id]||"").trim())} onClick={()=>setLabelChecked(true)} className="btn-primary">Проверить подписи</button></div>:
      <div className="space-y-2">{options.map((o:any)=>{const good=showAnswer&&o.correct,bad=showAnswer&&selected===o.id&&!o.correct;return <button key={o.id} disabled={answered} onClick={()=>void answer(o.id)} className={"flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm "+(good?"border-emerald-400 bg-emerald-50":bad?"border-rose-400 bg-rose-50":selected===o.id?"border-indigo-400 bg-indigo-50":"hover:bg-slate-50")}>{good?<Check className="h-4 w-4"/>:bad?<X className="h-4 w-4"/>:<span className="h-4 w-4 rounded-full border"/>}{o.label}</button>})}</div>}
      {showAnswer&&experience==="prepare"&&result===false&&<Reference items={hotspots}/>}
      {showAnswer&&experience==="prepare"&&<div className={"rounded-xl p-4 text-sm "+(result?"bg-emerald-50":"bg-rose-50")}><b>{result?"Правильно":"Неверно"}</b>{card.question?.explanation&&<p className="mt-1">{card.question.explanation}</p>}</div>}
      {experience==="study"&&<div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm"><b>Эталон:</b> {card.preparation?.name||card.question?.options?.find((o:any)=>o.correct)?.label||"Название не указано"}</div>}
      <div className="flex flex-wrap gap-2">{!answered&&experience!=="exam"&&<button onClick={()=>void skip()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><SkipForward className="h-4 w-4"/>Пропустить</button>}{answered&&!(experience==="exam"&&index===visible.length-1&&Object.keys(examAnswers).length===visible.length)&&<button onClick={next} className="btn-primary">Следующая</button>}{experience==="exam"&&index===visible.length-1&&Object.keys(examAnswers).length===visible.length&&<button onClick={()=>void finish()} className="btn-primary">Завершить экзамен</button>}{card.source_key&&<Link href="/materials?subject_slug=histology" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Eye className="h-4 w-4"/>Источник</Link>}</div>
      </div></div></div>}
  </div>;
}
