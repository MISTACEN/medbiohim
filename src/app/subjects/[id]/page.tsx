"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Brain, ChevronLeft, FileQuestion, FolderOpen, GraduationCap, ListChecks, Microscope, TrendingUp } from "lucide-react";
import { getProgress, getSubject, getSubjectGradebook, getSubjectPlan, listSubjectsCatalog, listTests, listTicketBanks, type ApiTest, type SubjectPlan, type SubjectPlanWeek } from "@/lib/api";
import { listSubjectMaterials, type SubjectMaterial } from "@/lib/content-api";
import { resolveSubjectSlug, ticketBankAvailable } from "@/lib/subjectSlug";

type Subject={id:string;name:string;course_number?:number|null;semester?:number|null;control_type?:string|null;total_hours?:number|null;credits?:number|null};
type Module={id?:string;title?:string;topics?:{id?:string;title?:string}[]};
const slugNames:Record<string,string>={"гистология, цитология":"histology","гистология":"histology","физиология":"physiology","органическая и физическая химия":"organic_chemistry"};
const semester=(n:number)=>n%2?"Осенний":"Весенний";

export default function SubjectPage({params}:{params:Promise<{id:string}>}){
  const [subject,setSubject]=useState<Subject|null>(null),[modules,setModules]=useState<Module[]>([]),[plan,setPlan]=useState<SubjectPlan|null>(null);
  const [gradebook,setGradebook]=useState<any[]>([]),[tests,setTests]=useState<ApiTest[]>([]),[materials,setMaterials]=useState<SubjectMaterial[]>([]),[banks,setBanks]=useState<any[]>([]),[progress,setProgress]=useState<any>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[subjectId,setSubjectId]=useState("");

  useEffect(()=>{let cancelled=false;(async()=>{try{
    const p=await params;if(cancelled)return;setSubjectId(p.id);
    const cat=await listSubjectsCatalog();const hit=cat.ok?(cat.data.items.find((x:any)=>x.id===p.id||x.slug===p.id)||cat.data.items.find((x:any)=>x.name.toLowerCase()===decodeURIComponent(p.id).toLowerCase())):null;
    const r=await getSubject(p.id);if(cancelled)return;
    if(!r.ok&&!hit){setError(r.error.message);setLoading(false);return;}
    const s:any=r.ok?r.data.subject:hit;setSubject(s);setModules(r.ok&&Array.isArray(r.data.modules)?r.data.modules:[]);
    const slug=slugNames[(s?.name||"").toLowerCase()]||s?.slug||"";
    if(slug){const pr=await getSubjectPlan(slug);if(pr.ok&&!cancelled)setPlan(pr.data.plan);}
    if(s?.id){const [gb,tt,mm,bb,pg]=await Promise.all([getSubjectGradebook(s.id),listTests(s.id),listSubjectMaterials({subjectId:s.id}),listTicketBanks(),getProgress()]);if(!cancelled){if(gb.ok)setGradebook(gb.data.items||[]);if(tt.ok)setTests(tt.data.items||[]);if(mm.ok)setMaterials(mm.data.items||[]);if(bb.ok)setBanks(bb.data.items||[]);if(pg.ok)setProgress(pg.data);}}
  }catch{if(!cancelled)setError("Не удалось загрузить предмет")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[params]);

  const course=subject?.course_number??2,sem=subject?.semester??3,slug=resolveSubjectSlug(subjectId,subject?.name),histology=slug==="histology"||/гистол.*цитол|цитол.*гистол/i.test(subject?.name||"");
  const query=new URLSearchParams({subject:subjectId,subject_slug:slug,course:String(course),semester:String(sem)}).toString();
  const subjectBanks=banks.filter(b=>/гистол/i.test(b.subject||"")||b.subject_slug===slug);
  const subjectTests=tests.filter(t=>!t.subject_id||t.subject_id===subject?.id);
  const nav=[["plan","Учебный план",GraduationCap],["tickets","Билеты",FileQuestion],["tests","Тесты",FileQuestion],["practice","Практика",ListChecks],["lectures","Лекции",BookOpen],["materials","Материалы",FolderOpen],["trainer","Микропрепараты",Microscope],["cards","Карточки SRS",Brain],["progress","Прогресс",TrendingUp]] as const;

  if(loading)return <div className="card p-6 text-sm text-slate-500">Загрузка предмета…</div>;
  if(error&&!subject)return <div className="card p-6 text-sm text-rose-600">{error}</div>;

  return <div className="space-y-6">
    <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ChevronLeft className="h-4 w-4"/>К предметам</Link>
    <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Предмет · Курс · Семестр</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{subject?.name}</h1><p className="mt-2 text-sm text-slate-600">{course} курс · {semester(sem)} · {sem}{subject?.control_type?" · "+(subject.control_type==="exam"?"Экзамен":subject.control_type==="credit"?"Зачёт":subject.control_type):""}</p></header>
    <section className="card border-indigo-100 bg-indigo-50/40 p-4"><div className="flex flex-wrap gap-2 text-sm"><b>Учебная нагрузка:</b>{subject?.total_hours!=null&&<span>{subject.total_hours} ч</span>}{subject?.credits!=null&&<span>· {subject.credits} з.е.</span>}</div>{gradebook.length>0&&<div className="mt-2 text-sm text-slate-600"><b>Для зачётки:</b> {gradebook.map((g:any,i:number)=><span key={i}>{i?" · ":""}{g.display_name}{g.hours!=null?" ("+g.hours+(g.credits!=null?"/"+g.credits:" ч")+")":""}</span>)}</div>}</section>
    <nav className="flex flex-wrap gap-2">{nav.map(([id,label,Icon])=><a key={id} href={"#"+id} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Icon className="h-4 w-4"/>{label}</a>)}</nav>

    <div className="space-y-5">
      <section id="plan" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Учебный план</h2><p className="mt-1 text-sm text-slate-500">{plan?(plan.control||"Контроль не указан")+" · "+(plan.weeks||[]).length+" занятий":"План ещё не загружен."}</p>{plan?.weeks?.length?<div className="mt-4 grid gap-3">{(plan.weeks as SubjectPlanWeek[]).map((w:any,i:number)=><article key={i} className="rounded-xl border bg-slate-50 p-4"><div className="text-xs text-slate-400">{w.date||""}{w.week!=null?" · неделя "+w.week:""}</div>{w.lecture&&<div className="mt-2 text-sm"><b className="text-indigo-700">Лекция:</b> {w.lecture}</div>}{w.practice&&<div className="text-sm"><b className="text-emerald-700">Практика:</b> {w.practice}</div>}</article>)}</div>:modules.length?<div className="mt-4 space-y-2">{modules.map((m,i)=><details key={m.id||i} className="rounded-xl border" open={i===0}><summary className="cursor-pointer px-4 py-3 font-semibold">{m.title||"Модуль "+(i+1)}</summary><div className="border-t px-4 py-2 text-sm">{(m.topics||[]).map((t,j)=><div key={t.id||j} className="border-b py-2 last:border-0">{t.title}</div>)}</div></details>)}</div>:null}</section>

      <section id="tickets" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Билеты</h2><p className="mt-1 text-sm text-slate-500">Билеты остаются отдельным банком и не смешиваются с SRS.</p>{ticketBankAvailable(slug)&&subjectBanks.length?<div className="mt-4 grid gap-3 sm:grid-cols-2">{subjectBanks.map((b:any)=><div key={b.id} className="rounded-xl border p-4"><b>{b.title}</b><div className="mt-1 text-xs text-slate-500">{b.count} вопросов</div></div>)}</div>:<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Банк билетов для этого предмета пока не подключён.</p>}<Link href={"/tickets?"+query} className="btn-primary mt-4 inline-flex">Открыть билеты</Link></section>

      <section id="practice" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Практика</h2><p className="mt-1 text-sm text-slate-500">{histology?"Микропрепараты, электронограммы и задания МБХ.":"Темы и практические задания предмета."}</p>{modules.length>0&&<div className="mt-4 grid gap-2 sm:grid-cols-2">{modules.slice(0,6).map((m,i)=><div key={m.id||i} className="rounded-xl border p-3 text-sm font-medium">{m.title}</div>)}</div>}<Link href={histology?"/trainers/feed/histology":"/practice?"+query} className="btn-primary mt-4 inline-flex">{histology?"Открыть тренажёр":"Открыть практику"}</Link></section>

      <section id="lectures" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Лекции</h2><p className="mt-1 text-sm text-slate-500">Лекции открываются отдельной страницей — это единственное исключение.</p><Link href={"/lectures?"+query} className="btn-primary mt-4 inline-flex">К лекциям</Link></section>

      <section id="materials" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Материалы</h2><p className="mt-1 text-sm text-slate-500">{materials.length?materials.length+" материалов доступно для предмета.":"Материалы пока не найдены."}</p>{materials.length>0&&<div className="mt-4 grid gap-2 sm:grid-cols-2">{materials.slice(0,8).map(m=><div key={m.id} className="rounded-xl border p-3"><div className="font-medium">{m.title}</div><div className="mt-1 text-xs text-slate-500">{m.type}</div></div>)}</div>}<Link href={"/materials?"+query} className="btn-primary mt-4 inline-flex">Открыть все материалы</Link></section>

      <section id="trainer" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Микропрепараты</h2><p className="mt-1 text-sm text-slate-500">{histology?"Тренажёр остаётся отдельным окном, но раздел и кнопка находятся прямо здесь.":"Для этого предмета тренажёр не подключён."}</p>{histology&&<Link href="/trainers/feed/histology" className="btn-primary mt-4 inline-flex">Открыть тренажёр</Link>}</section>

      <section id="cards" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Карточки SRS</h2><p className="mt-1 text-sm text-slate-500">Общие и личные карточки — отдельно от билетов.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Link href={"/cards?"+query+"&scope=shared"} className="rounded-xl border p-4 hover:bg-slate-50"><b>Общие</b><div className="mt-1 text-xs text-slate-500">Преподаватель</div></Link><Link href={"/cards?"+query+"&scope=personal"} className="rounded-xl border p-4 hover:bg-slate-50"><b>Мои</b><div className="mt-1 text-xs text-slate-500">Личные термины</div></Link></div></section>

      <section id="progress" className="card scroll-mt-5 p-5"><h2 className="text-lg font-bold">Прогресс</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Общий</div><b className="text-2xl">{progress?.overall_pct!=null?Math.round(progress.overall_pct)+"%":"—"}</b></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Тесты</div><b className="text-2xl">{tests.length}</b></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Материалы</div><b className="text-2xl">{materials.length}</b></div></div><div className="mt-4 flex flex-wrap gap-2">{subjectTests.map(t=><Link key={t.id} href={"/tests/"+t.id} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">{t.title||t.name||"Тест"} · {t.questions_count||0} вопросов</Link>)}</div><Link href={"/progress?"+query} className="btn-primary mt-4 inline-flex">Открыть подробный прогресс</Link></section>
    </div>
  </div>;
}
