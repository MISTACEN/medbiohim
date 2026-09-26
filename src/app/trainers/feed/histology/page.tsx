"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Menu, RefreshCw, SkipForward, X } from "lucide-react";
import { getTrainerImageUrl, retryTrainerImage } from "@/lib/api";
import {
  answerTrainingQuestion, cancelTraining, completeTraining, createHistologyTraining,
  getTraining, listTrainerFeed, listTrainings, type Training, type TrainingContentType,
  type TrainingLabelMode, type TrainingLayout, type TrainingQuestion,
} from "@/lib/content-api";

type AnswerRow = {
  id: string; question_id: string; order: number; user_answer?: string | null;
  is_correct?: boolean | null; is_skipped?: boolean; options: Array<{id:string;label:string;correct?:boolean}>;
  question_snapshot: TrainingQuestion; review_snapshot?: any;
};

const topicNames: Record<string,string> = {
  mbh:"МБХ", electronogram:"Электронограммы", identify:"Определение препарата",
  stom_mbh:"Стом. гистология", orofacial:"Орофациальная область", histology:"Гистология",
};
const topicLabel=(x:string)=>topicNames[x] || x.replaceAll("_"," ");

function ImageBox({id}:{id:string}) {
  const [src,setSrc]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [retrying,setRetrying]=useState(false);
  const load=async(retry=false)=>{
    setLoading(true);
    const u=retry?await retryTrainerImage(id):await getTrainerImageUrl(id);
    setSrc(u); setLoading(false); setRetrying(false);
  };
  useEffect(()=>{let ok=true; setLoading(true); void getTrainerImageUrl(id).then(u=>{if(ok){setSrc(u);setLoading(false)}}); return()=>{ok=false}},[id]);
  if(loading)return <div className="flex min-h-[300px] items-center justify-center bg-slate-100 text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin"/>Загрузка изображения…</div>;
  if(!src)return <div className="flex min-h-[300px] flex-col items-center justify-center bg-slate-100 p-6 text-center"><span className="text-4xl">?</span><b className="mt-2">Изображение временно недоступно</b><button disabled={retrying} onClick={()=>{setRetrying(true);void load(true)}} className="mt-3 rounded-xl border bg-white px-4 py-2 text-sm font-semibold"><RefreshCw className="mr-2 inline h-4 w-4"/>Повторить</button></div>;
  return <img src={src} onError={()=>setSrc(null)} className="max-h-[650px] min-h-[300px] w-full bg-slate-100 object-contain" alt="Гистологический препарат" draggable={false}/>;
}

function Dots({answers,current,onSelect}:{answers:AnswerRow[];current:number;onSelect:(n:number)=>void}) {
  return <div className="flex flex-wrap gap-1.5">{answers.map((a,i)=>{
    const cls=a.is_correct===true?"bg-emerald-500 text-white":a.is_correct===false?"bg-rose-500 text-white":a.is_skipped?"bg-slate-300":"border bg-white";
    return <button key={a.id} onClick={()=>onSelect(i)} className={"h-8 min-w-8 rounded-full px-2 text-xs font-bold "+(i===current&&!a.is_correct&&!a.is_skipped?" ring-2 ring-indigo-300 ":"")+cls}>{i+1}</button>;
  })}</div>;
}

export default function HistologyTrainerPage() {
  const [topics,setTopics]=useState<string[]>([]);
  const [resume,setResume]=useState<Training|null>(null);
  const [training,setTraining]=useState<Training|null>(null);
  const [answers,setAnswers]=useState<AnswerRow[]>([]);
  const [active,setActive]=useState(0);
  const [setup,setSetup]=useState(true);
  const [result,setResult]=useState<any>(null);
  const [review,setReview]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [working,setWorking]=useState(false);
  const [mobileList,setMobileList]=useState(false);
  const [selectedTopics,setSelectedTopics]=useState<string[]>([]);
  const [contentType,setContentType]=useState<TrainingContentType>("all");
  const [count,setCount]=useState("20");
  const [custom,setCustom]=useState("");
  const [allQuestions,setAllQuestions]=useState(false);
  const [labelMode,setLabelMode]=useState<TrainingLabelMode>("without");
  const [layout,setLayout]=useState<TrainingLayout>("top");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([listTrainerFeed("histology","mbh",500),listTrainings("in_progress")]).then(([feed,s])=>{
      if(feed.ok)setTopics(Array.from(new Set(feed.data.items.flatMap((x:any)=>Array.isArray(x.tags)?x.tags:[]))).sort());
      if(s.ok)setResume(s.data.items.find((x:Training)=>x.status==="in_progress")||null);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  const loadSession=async(id:string)=>{
    setWorking(true); setError(null);
    const r=await getTraining(id);
    if(!r.ok){setError(r.error.message);setWorking(false);return;}
    setTraining(r.data.training); setAnswers(r.data.answers); setActive(Math.min(r.data.training.current_index||0,Math.max(0,r.data.answers.length-1)));
    setSetup(false); setResume(null); setWorking(false);
  };

  const start=async()=>{
    setWorking(true);setError(null);
    const n=allQuestions?500:Math.max(1,Number(custom||count));
    const r=await createHistologyTraining({topics:selectedTopics,content_type:contentType,question_count:n,all_questions:allQuestions,label_mode:labelMode,layout_mode:layout});
    if(!r.ok){setError(r.error.message);setWorking(false);return;}
    await loadSession(r.data.training.id);
  };

  const answer=async(value:string|null,skip=false)=>{
    if(!training||!answers[active]||working)return;
    const a=answers[active]; if(a.user_answer!=null||a.is_skipped)return;
    setWorking(true);
    const r=await answerTrainingQuestion(training.id,a.order,value,skip);
    if(!r.ok){setError(r.error.message);setWorking(false);return;}
    setAnswers(v=>v.map((x,i)=>i===active?{...x,user_answer:value,is_correct:r.data.correct,is_skipped:skip}:x));
    setWorking(false);
  };

  const finish=async()=>{
    if(!training)return; setWorking(true);
    const r=await completeTraining(training.id);
    if(!r.ok){setError(r.error.message);setWorking(false);return;}
    setTraining(r.data.training);setResult(r.data.stats);setWorking(false);
  };

  const restart=async()=>{
    if(resume)await cancelTraining(resume.id);
    setResume(null);
  };

  const current=answers[active];
  const answered=answers.filter(x=>x.user_answer!=null||x.is_skipped).length;
  const wrong=answers.filter(x=>x.is_correct===false);
  const topicsForSetup=useMemo(()=>topics, [topics]);

  const question=(a:AnswerRow,i:number,compact=false)=>{
    const q=a.question_snapshot;
    const answeredNow=a.user_answer!=null||a.is_skipped;
    const manual=training?.label_mode==="manual";
    return <article key={a.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex justify-between border-b bg-slate-50 px-4 py-3 text-xs text-slate-500"><span>Вопрос {i+1} / {answers.length}</span><span>{a.is_correct===true?"Верно":a.is_correct===false?"Ошибка":a.is_skipped?"Пропущен":"Не отвечен"}</span></div>
      <ImageBox id={a.question_id}/>
      <div className={compact?"p-4":"p-5"}>
        {training?.label_mode==="with"&&q.preparation?.name?<div className="mb-3 rounded-xl bg-indigo-50 p-3 text-sm"><b>Препарат:</b> {String(q.preparation.name)}</div>:null}
        <h2 className="text-xl font-bold">{q.question?.prompt||"Что изображено?"}</h2>
        {training?.label_mode==="with"&&Array.isArray(q.preparation?.captions)&&q.preparation.captions.length?<div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">{q.preparation.captions.join(" · ")}</div>:null}
        {manual?<div className="mt-4"><input disabled={answeredNow} defaultValue={a.user_answer||""} id={"answer-"+a.id} placeholder="Введите ответ" className="w-full rounded-xl border px-4 py-3"/>{!answeredNow&&<button onClick={()=>{const e=document.getElementById("answer-"+a.id) as HTMLInputElement|null;void answer(e?.value.trim()||null)}} className="btn-primary mt-2">Ответить</button>}</div>:
        <div className="mt-4 space-y-2">{a.options.map(o=>{
          const good=answeredNow&&o.correct; const bad=answeredNow&&a.user_answer===o.id&&!o.correct;
          return <button key={o.id} disabled={answeredNow||working} onClick={()=>void answer(o.id)} className={"flex w-full items-center gap-3 rounded-xl border p-3 text-left "+(good?"border-emerald-400 bg-emerald-50":bad?"border-rose-400 bg-rose-50":"hover:bg-slate-50")}>{good?<Check className="h-4 w-4"/>:bad?<X className="h-4 w-4"/>:<span className="h-4 w-4 rounded-full border"/>}{o.label}</button>;
        })}</div>}
        {!answeredNow&&<div className="mt-4 flex gap-2"><button disabled={working} onClick={()=>void answer(null,true)} className="rounded-xl border px-3 py-2 text-sm"><SkipForward className="mr-1 inline h-4 w-4"/>Пропустить</button><button disabled={working} onClick={()=>void answer(null,true)} className="rounded-xl border px-3 py-2 text-sm">Я не знаю</button></div>}
        {answeredNow&&training?.label_mode==="with"&&q.question?.explanation?<div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">{q.question.explanation}</div>:null}
      </div>
    </article>;
  };

  if(loading)return <div className="card p-8 text-sm text-slate-500">Загрузка тренажёра…</div>;

  if(setup&&!training)return <div className="mx-auto max-w-6xl space-y-5">
    <header><Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="h-4 w-4"/>К предметам</Link><h1 className="page-title mt-3">Тренажёр препаратов и электронограмм</h1><p className="page-subtitle">Создайте вариант и продолжайте его позже.</p></header>
    {resume&&<section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5"><b className="text-lg">У вас есть незавершённая тренировка</b><p className="mt-1 text-sm text-slate-600">{resume.answered_count||0} из {resume.total_questions}</p><div className="mt-3 flex gap-2"><button disabled={working} onClick={()=>void loadSession(resume.id)} className="btn-primary">Продолжить</button><button disabled={working} onClick={()=>void restart()} className="rounded-xl border bg-white px-4 py-2">Начать заново</button></div></section>}
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    <section className="card space-y-6 p-5">
      <div><h2 className="font-bold">Темы</h2><div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>setSelectedTopics(selectedTopics.length===topicsForSetup.length?[]:topicsForSetup)} className="rounded-xl border px-3 py-2 text-sm font-semibold">Выбрать все</button>{topicsForSetup.map(t=><label key={t} className={"rounded-xl border px-3 py-2 text-sm "+(selectedTopics.includes(t)?"border-indigo-400 bg-indigo-50":"")}><input type="checkbox" className="mr-2" checked={selectedTopics.includes(t)} onChange={e=>setSelectedTopics(e.target.checked?[...selectedTopics,t]:selectedTopics.filter(x=>x!==t))}/>{topicLabel(t)}</label>)}</div></div>
      <div><h2 className="font-bold">Тип контента</h2><div className="mt-3 flex flex-wrap gap-2">{([["all","Всё вместе"],["preparation","Микропрепараты"],["electronogram","Электронограммы"]] as [TrainingContentType,string][]).map(x=><label key={x[0]} className={"rounded-xl border px-4 py-3 "+(contentType===x[0]?"border-indigo-400 bg-indigo-50":"")}><input type="radio" className="mr-2" checked={contentType===x[0]} onChange={()=>setContentType(x[0])}/>{x[1]}</label>)}</div></div>
      <div><h2 className="font-bold">Количество</h2><div className="mt-3 flex flex-wrap items-center gap-2">{["10","20","50"].map(n=><label key={n} className="rounded-xl border px-4 py-3"><input type="radio" className="mr-2" checked={!custom&&!allQuestions&&count===n} onChange={()=>{setCount(n);setCustom("");setAllQuestions(false)}}/>{n}</label>)}<input type="number" min="1" max="500" value={custom} onChange={e=>{setCustom(e.target.value);setAllQuestions(false)}} placeholder="Своё количество" className="w-36 rounded-xl border px-3 py-3"/><label className="rounded-xl border px-4 py-3"><input type="checkbox" className="mr-2" checked={allQuestions} onChange={e=>setAllQuestions(e.target.checked)}/>Все вопросы</label></div></div>
      <div><h2 className="font-bold">Режим подписей</h2><div className="mt-3 grid gap-2 md:grid-cols-3">{([["with","С подписями"],["without","Без подписей"],["manual","Ручной ввод"]] as [TrainingLabelMode,string][]).map(x=><label key={x[0]} className={"rounded-2xl border p-4 "+(labelMode===x[0]?"border-indigo-400 bg-indigo-50":"")}><input type="radio" className="mr-2" checked={labelMode===x[0]} onChange={()=>setLabelMode(x[0])}/><b>{x[1]}</b></label>)}</div></div>
      <div><h2 className="font-bold">Формат отображения</h2><div className="mt-3 flex flex-wrap gap-2">{([["sidebar","Сайдбар"],["list","Списком"],["top","Верхняя пагинация"]] as [TrainingLayout,string][]).map(x=><label key={x[0]} className={"rounded-xl border px-4 py-3 "+(layout===x[0]?"border-indigo-400 bg-indigo-50":"")}><input type="radio" className="mr-2" checked={layout===x[0]} onChange={()=>setLayout(x[0])}/>{x[1]}</label>)}</div></div>
      <button disabled={working} onClick={()=>void start()} className="btn-primary w-full py-3">{working?"Формируем вариант…":"Сформировать вариант"}</button>
    </section>
  </div>;

  if(result)return <div className="mx-auto max-w-5xl space-y-5"><section className="card p-6 text-center"><div className="text-sm text-slate-500">Тренировка завершена</div><h1 className="mt-2 text-4xl font-black">{result.correct}/{result.total}</h1><p className="mt-2">Правильно · {result.percent}% · Оценка {result.grade}</p><div className="mt-5 flex justify-center gap-2"><button className="btn-primary" onClick={()=>setReview(!review)}>Разбор ошибок ({wrong.length})</button><button className="rounded-xl border px-4 py-2" onClick={()=>{setResult(null);setTraining(null);setAnswers([]);setSetup(true)}}>Новая тренировка</button></div></section>{review&&wrong.map(a=>{const snap=a.review_snapshot||a.question_snapshot;const correct=a.options.find(o=>o.correct);return <article key={a.id} className="card overflow-hidden"><ImageBox id={a.question_id}/><div className="p-5"><h2 className="font-bold">{snap?.preparation?.name||snap?.question?.prompt}</h2><div className="mt-3 rounded-xl bg-emerald-50 p-3"><b>Правильный ответ:</b> {correct?.label||"—"}</div>{Array.isArray(snap?.preparation?.captions)&&snap.preparation.captions.length?<div className="mt-3 rounded-xl bg-indigo-50 p-3"><b>Подписи:</b> {snap.preparation.captions.join(" · ")}</div>:null}</div></article>})}</div>;

  const finish=<div className="sticky bottom-3 z-10 mt-4 flex items-center justify-between rounded-2xl border bg-white/95 p-3 shadow-lg"><span className="text-sm text-slate-500">Решено {answered} из {answers.length}</span><button disabled={working} onClick={()=>void finish()} className="btn-primary">Завершить тест</button></div>;

  return <div className="mx-auto max-w-7xl space-y-4">
    <header className="flex items-center justify-between"><div><Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="h-4 w-4"/>К предметам</Link><h1 className="page-title mt-2">Тренировка</h1><p className="page-subtitle">25 XP за правильный ответ</p></div><button className="rounded-xl border px-3 py-2 md:hidden" onClick={()=>setMobileList(!mobileList)}><Menu className="mr-1 inline h-4 w-4"/>Список задач</button></header>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {training.layout_mode==="sidebar"?<div className="grid gap-4 lg:grid-cols-[240px_1fr]"><aside className={(mobileList?"block ":"hidden ")+"rounded-2xl border bg-white p-4 lg:block"}><Dots answers={answers} current={active} onSelect={setActive}/></aside><div>{current&&question(current,active)}<div className="mt-3 flex justify-between"><button disabled={active===0} onClick={()=>setActive(active-1)} className="rounded-xl border px-4 py-2"><ChevronLeft className="inline h-4 w-4"/>Назад</button><button disabled={active===answers.length-1} onClick={()=>setActive(active+1)} className="rounded-xl border px-4 py-2">Далее<ChevronRight className="inline h-4 w-4"/></button></div>{finish}</div></div>
    :training.layout_mode==="list"?<div className="space-y-4">{answers.map((a,i)=>question(a,i,true))}{finish}</div>
    :<div className="mx-auto max-w-4xl"><div className="mb-4 rounded-2xl border bg-white p-3"><Dots answers={answers} current={active} onSelect={setActive}/></div>{current&&question(current,active)}<div className="mt-3 flex justify-between"><button disabled={active===0} onClick={()=>setActive(active-1)} className="rounded-xl border px-4 py-2"><ChevronLeft className="inline h-4 w-4"/>Назад</button><button disabled={active===answers.length-1} onClick={()=>setActive(active+1)} className="rounded-xl border px-4 py-2">Далее<ChevronRight className="inline h-4 w-4"/></button></div>{finish}</div>}
  </div>;
}
