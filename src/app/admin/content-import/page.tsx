"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { adminContentImport, adminDbList, adminImportCurriculumXlsx, hasToken } from "@/lib/api";

type Row = Record<string, unknown>;
type ImportData = { tests: Row[]; questions: Row[]; test_questions: Row[] };
type ImportFile = { name: string; subject: string; data: ImportData };
const headers={
  tests:["test_key","title","subject_key","module_key","topic_key","time_limit_sec","max_attempts","is_published"],
  questions:["question_key","text","subject_key","module_key","topic_key","type","answer","options","difficulty","is_published"],
  test_questions:["test_key","question_key","order_index"],
};

function downloadTemplate(){
  const wb=XLSX.utils.book_new();
  for(const [name,cols] of Object.entries(headers)){
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([cols]),name);
  }
  XLSX.writeFile(wb,"medbiohim-content-template.xlsx");
}
function normalize(v:unknown):unknown{
  if(v===undefined||v===null)return "";
  if(typeof v==="number"||typeof v==="boolean")return v;
  const s=String(v).trim();
  if(s==="")return "";
  if(s==="true")return true;
  if(s==="false")return false;
  return s;
}
async function readWorkbook(file:File){
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
  const result:{tests:Row[];questions:Row[];test_questions:Row[]}={tests:[],questions:[],test_questions:[]};
  for(const key of Object.keys(result)){
    const sheet=wb.Sheets[key];
    if(sheet) result[key as keyof typeof result]=XLSX.utils.sheet_to_json<Row>(sheet,{defval:""}).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,normalize(v)])));
  }
  return result;
}

export default function AdminContentImportPage(){
  const input=useRef<HTMLInputElement>(null);
  const [data,setData]=useState<ImportData>({tests:[],questions:[],test_questions:[]});
  const [fileName,setFileName]=useState("");
  const [files,setFiles]=useState<ImportFile[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [errors,setErrors]=useState<Array<{sheet:string;row:number;error:string}>>([]);
  const [subjects,setSubjects]=useState<Row[]>([]);
  const [curriculumBusy,setCurriculumBusy]=useState(false);
  const [curriculumMessage,setCurriculumMessage]=useState("");

  useEffect(()=>{void adminDbList("subjects",500).then(r=>{if(r.ok)setSubjects(r.data.items)});},[]);


  async function importCurriculum(file: File) {
    setCurriculumBusy(true); setCurriculumMessage("Импорт учебного плана…");
    const r=await adminImportCurriculumXlsx(file);
    setCurriculumBusy(false);
    if(!r.ok){setCurriculumMessage(r.error.message);return;}
    setCurriculumMessage("Учебный план импортирован в Supabase.");
  }

  async function choose(e:ChangeEvent<HTMLInputElement>){
    const selected=Array.from(e.target.files??[]); if(!selected.length)return;
    try{const loaded:ImportFile[]=[];for(const f of selected)loaded.push({name:f.name,subject:"",data:await readWorkbook(f)});setFiles(loaded);const merged:ImportData=loaded.reduce<ImportData>((a,x)=>({tests:[...a.tests,...x.data.tests],questions:[...a.questions,...x.data.questions],test_questions:[...a.test_questions,...x.data.test_questions]}),{tests:[],questions:[],test_questions:[]});setData(merged);setFileName(selected.map(x=>x.name).join(", "));setMessage("Файлы прочитаны. Назначьте предмет каждому файлу.");setErrors([]);}
    catch(err){setMessage(err instanceof Error?err.message:"Не удалось прочитать Excel");}
    e.target.value="";
  }
  function rebuildData(current:ImportFile[]=files){const merged=current.reduce<ImportData>((a,x)=>{const subject=x.subject||"";return {tests:[...a.tests,...x.data.tests.map(r=>subject?{...r,subject_key:subject}:r)],questions:[...a.questions,...x.data.questions.map(r=>subject?{...r,subject_key:subject}:r)],test_questions:[...a.test_questions,...x.data.test_questions]};},{tests:[],questions:[],test_questions:[]});setData(merged);return merged;}
  async function run(dry_run:boolean){
    setBusy(true);setErrors([]);setMessage(dry_run?"Проверяю связи и значения…":"Импортирую в Supabase…");
    const payload=rebuildData(); const res=await adminContentImport({...payload,dry_run});
    if(res.ok){
      setErrors(res.data.errors);
      setMessage(dry_run
        ? (res.data.errors.length?"Есть ошибки — исправьте файл и проверьте снова.":"Проверка пройдена: можно импортировать.")
        : "Импорт завершён: тестов "+res.data.created.tests+", вопросов "+res.data.created.questions+", связей "+res.data.created.test_questions+".");
    }else setMessage(res.error.message);
    setBusy(false);
  }
  if(!hasToken())return <div className="card mx-auto max-w-md p-8 text-center"><h1 className="page-title">Импорт контента</h1><p className="page-subtitle">Сначала войдите.</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;

  const counts=[["tests","Тесты"],["questions","Вопросы"],["test_questions","Связи"]].map(([k,label])=>[label,data[k as keyof typeof data].length] as const);
  return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <header><Link href="/admin" className="text-sm text-indigo-600">← Админ</Link><h1 className="mt-1 page-title flex items-center gap-2"><FileSpreadsheet className="h-6 w-6"/>Импорт тестов и вопросов</h1><p className="page-subtitle">Excel → Supabase: тесты, вопросы и их порядок. Сначала проверка, затем запись.</p></header>
    <div className="card border-indigo-100 bg-indigo-50/50"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">Официальный учебный план</div><p className="mt-1 text-xs text-slate-600">Отдельный XLSX-импорт учебного плана. Данные попадут в текущую Supabase-модель.</p></div><label className={"btn-secondary cursor-pointer " + (curriculumBusy ? "pointer-events-none opacity-50" : "")}>Загрузить XLSX<input type="file" hidden accept=".xlsx,.xls" disabled={curriculumBusy} onChange={(e)=>{const file=e.target.files?.[0];if(file)void importCurriculum(file);e.currentTarget.value="";}}/></label></div>{curriculumMessage&&<div className="mt-2 text-xs text-indigo-700">{curriculumMessage}</div>}</div>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card md:col-span-2"><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={downloadTemplate}><Download className="mr-2 inline h-4 w-4"/>Скачать шаблон Excel</button><button className="btn-primary" onClick={()=>input.current?.click()}><Upload className="mr-2 inline h-4 w-4"/>Загрузить Excel</button><input ref={input} hidden type="file" accept=".xlsx,.xls" multiple onChange={choose}/></div><p className="mt-3 text-xs text-slate-500">{fileName||"Можно выбрать сразу несколько Excel-файлов — например физика.xlsx, биология.xlsx, гистология.xlsx."}</p>{files.length>0&&<div className="mt-3 space-y-2">{files.map((x,i)=><div key={x.name} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs"><b className="min-w-48">{x.name}</b><select value={x.subject} onChange={e=>setFiles(p=>{const next=p.map((z,n)=>n===i?{...z,subject:e.target.value}:z);rebuildData(next);return next;})} className="rounded border px-2 py-1"><option value="">Предмет из Excel</option>{subjects.map(s=><option key={String(s.id)} value={String(s.slug||s.code||s.name)}>{String(s.name)}</option>)}</select><span>{x.data.tests.length} тестов · {x.data.questions.length} вопросов</span></div>)}</div>}</div>
      <div className="card"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Загружено</div><div className="mt-2 space-y-1 text-sm">{counts.map(([l,n])=><div className="flex justify-between" key={l}><span>{l}</span><b>{n}</b></div>)}</div></div>
    </div>
    {message&&<div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">{message}</div>}
    <div className="card"><h2 className="font-bold">Как заполнять</h2><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600"><li><b>subject_key</b> — slug, code или точное название предмета из Supabase. Для нескольких файлов предмет можно назначить прямо после загрузки.</li><li><b>test_key / question_key</b> — ваши стабильные ключи, UUID не нужны. Лист TEST_QUESTIONS связывает записи по этим ключам.</li><li><b>module_slug / topic_slug</b> — модуль и тема внутри предмета; тест и вопросы попадут именно туда.</li><li><b>type</b> — mcq, open, problem, theory или practical.</li><li><b>options</b> — JSON-массив или варианты через символ <code>|</code>.</li><li>В <b>test_questions</b> можно указывать ID созданного теста/вопроса или значения из колонок id исходных строк.</li></ul></div>
    {errors.length>0&&<div className="card border-rose-200"><h2 className="font-bold text-rose-700">Ошибки ({errors.length})</h2><div className="mt-3 max-h-72 overflow-auto space-y-2">{errors.map((e,i)=><div key={i} className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{e.sheet}, строка {e.row}: {e.error}</div>)}</div></div>}
    <div className="flex flex-wrap gap-2"><button disabled={busy||(!data.tests.length&&!data.questions.length)} className="btn-secondary disabled:opacity-50" onClick={()=>void run(true)}><CheckCircle2 className="mr-2 inline h-4 w-4"/>Проверить файл</button><button disabled={busy||(!data.tests.length&&!data.questions.length)||errors.length>0} className="btn-primary disabled:opacity-50" onClick={()=>void run(false)}>Импортировать в Supabase</button></div>
    <p className="text-xs text-slate-400">Импорт доступен только администратору. Для повторной загрузки используйте новые UUID или отдельный набор.</p>
  </main>;
}
