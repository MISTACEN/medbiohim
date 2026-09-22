"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Plus, RefreshCw, Save, Trash2, Upload, Table2 } from "lucide-react";
import { adminDbDelete, adminDbInsert, adminDbList, adminDbTables, adminDbUpdate, AdminDbRow, hasToken } from "@/lib/api";

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
function parseCSV(text: string): string[][] {
  const out:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];
    if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"'&&cell==="")quoted=true;
    else if(ch===','){row.push(cell);cell="";}
    else if(ch==="\n"){row.push(cell);out.push(row);row=[];cell="";}
    else if(ch!=="\r")cell+=ch;
  }
  row.push(cell); if(row.length>1||row[0]!=="")out.push(row); return out;
}
function display(v:unknown){if(v===null||v===undefined)return ""; if(typeof v==="object")return JSON.stringify(v); return String(v);}
function parseValue(v:string, original:unknown):unknown{
  if(v==="") return original===null ? null : "";
  if(typeof original==="number"){const n=Number(v);return Number.isFinite(n)?n:v;}
  if(typeof original==="boolean")return v==="true"||v==="1";
  if(original&&typeof original==="object"){try{return JSON.parse(v)}catch{return v}}
  return v;
}

export default function AdminDatabasePage(){
  const [tables,setTables]=useState<Array<{name:string;items:number|null}>>([]);
  const [table,setTable]=useState("subjects");
  const [rows,setRows]=useState<AdminDbRow[]>([]);
  const [original,setOriginal]=useState<AdminDbRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  async function loadTables(){
    const r=await adminDbTables(); if(r.ok){setTables(r.data.items); if(!r.data.items.some(x=>x.name===table)&&r.data.items[0])setTable(r.data.items[0].name);}
    else setMessage(r.error.message);
  }
  async function load(){
    setLoading(true);setMessage("");
    const r=await adminDbList(table,500);
    if(r.ok){setRows(r.data.items);setOriginal(r.data.items.map(x=>({...x})));}
    else setMessage(r.error.message);
    setLoading(false);
  }
  useEffect(()=>{if(hasToken())void loadTables();},[]);
  useEffect(()=>{if(hasToken())void load();},[table]);

  const columns=useMemo(()=>Array.from(new Set(rows.flatMap(r=>Object.keys(r)))),[rows]);
  const dirty=(id:string)=>{const a=rows.find(r=>String(r.id)===id),b=original.find(r=>String(r.id)===id);return JSON.stringify(a)!==JSON.stringify(b);};

  function setCell(rowIndex:number,key:string,value:string){setRows(prev=>prev.map((r,i)=>i===rowIndex?{...r,[key]:parseValue(value,r[key])}:r));}

  async function saveRow(row:AdminDbRow){
    if(!row.id){const r=await adminDbInsert(table,row);if(r.ok){setMessage("Строка добавлена");await load();}else setMessage(r.error.message);return;}
    const clean={...row};delete clean.id;
    const r=await adminDbUpdate(table,String(row.id),clean);
    if(r.ok){setMessage("Сохранено");await load();}else setMessage(r.error.message);
  }
  async function deleteRow(row:AdminDbRow){
    if(!row.id)return;
    if(!confirm(`Удалить строку ${row.id} из ${table}?`))return;
    const r=await adminDbDelete(table,String(row.id)); if(r.ok)await load();else setMessage(r.error.message);
  }
  function addRow(){
    const r:AdminDbRow={}; columns.forEach(k=>{r[k]=k==="id"?undefined:"";}); setRows(prev=>[...prev,r]);
  }
  function exportCSV(){
    const csv=[columns,...rows.map(r=>columns.map(k=>csvEscape(r[k])))].map(r=>r.join(",")).join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download=`${table}.csv`;a.click();
  }
  function exportJSON(){
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:"application/json"}));a.download=`${table}.json`;a.click();
  }
  async function importFile(e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0]; if(!f)return; const text=await f.text(); let imported:AdminDbRow[]=[];
    if(f.name.toLowerCase().endsWith(".json")){try{const x=JSON.parse(text);imported=Array.isArray(x)?x:(x.items||[]);}catch{setMessage("Некорректный JSON");return;}}
    else {const grid=parseCSV(text);if(grid.length<2){setMessage("CSV пустой");return;}const headers=grid[0];imported=grid.slice(1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));}
    let ok=0; for(const row of imported){const id=row.id;const payload={...row};delete payload.id;const r=id?await adminDbUpdate(table,String(id),payload):await adminDbInsert(table,payload);if(r.ok)ok++;}
    setMessage(`Импортировано: ${ok}/${imported.length}`);await load();e.target.value="";
  }

  if(!hasToken())return <div className="card mx-auto max-w-md p-8 text-center"><h1 className="page-title">База данных</h1><p className="page-subtitle">Сначала войдите.</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;

  return <main className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><Link href="/admin" className="text-sm text-indigo-600">← Админ</Link><h1 className="mt-1 page-title flex items-center gap-2"><Table2 className="h-6 w-6"/>База данных · Excel режим</h1><p className="page-subtitle">Редактирование напрямую в Supabase. Только разрешённые таблицы.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={()=>void load()}><RefreshCw className={`mr-2 inline h-4 w-4 ${loading?"animate-spin":""}`}/>Обновить</button>
        <button className="btn-secondary" onClick={addRow}><Plus className="mr-2 inline h-4 w-4"/>Строка</button>
        <button className="btn-secondary" onClick={exportCSV}><Download className="mr-2 inline h-4 w-4"/>CSV</button>
        <button className="btn-secondary" onClick={exportJSON}><Download className="mr-2 inline h-4 w-4"/>JSON</button>
        <button className="btn-primary" onClick={()=>fileRef.current?.click()}><Upload className="mr-2 inline h-4 w-4"/>Импорт</button>
        <input ref={fileRef} hidden type="file" accept=".csv,.json,text/csv,application/json" onChange={e=>void importFile(e)}/>
      </div>
    </header>
    {message&&<div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">{message}</div>}
    <div className="card p-3">
      <div className="flex flex-wrap gap-2">
        {tables.map(t=><button key={t.name} onClick={()=>setTable(t.name)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${table===t.name?"bg-indigo-600 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t.name} <span className="opacity-70">({t.items??"?"})</span></button>)}
      </div>
    </div>
    <div className="card overflow-hidden">
      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100"><tr>{columns.map(k=><th key={k} className="whitespace-nowrap border-b border-r px-3 py-2 text-left font-bold text-slate-600">{k}</th>)}<th className="sticky right-0 border-b bg-slate-100 px-3">Действия</th></tr></thead>
          <tbody>{rows.map((r,i)=><tr key={String(r.id??i)} className={dirty(String(r.id??i))?"bg-amber-50":"bg-white"}>
            {columns.map(k=><td key={k} className="border-b border-r p-0"><input disabled={k==="id"} value={display(r[k])} onChange={e=>setCell(i,k,e.target.value)} className="min-w-[130px] bg-transparent px-3 py-2 outline-none focus:bg-indigo-50 disabled:text-slate-400"/></td>)}
            <td className="sticky right-0 whitespace-nowrap border-b bg-white px-2"><button className="mr-1 rounded-lg bg-emerald-50 p-2 text-emerald-700" onClick={()=>void saveRow(r)} title="Сохранить"><Save className="h-4 w-4"/></button><button className="rounded-lg bg-rose-50 p-2 text-rose-700" onClick={()=>void deleteRow(r)} title="Удалить"><Trash2 className="h-4 w-4"/></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.length&&<div className="p-10 text-center text-sm text-slate-500">Таблица пустая.</div>}
    </div>
    <div className="text-xs text-slate-400">Импорт CSV/JSON выполняется построчно с серверной проверкой прав admin. Для больших наборов используйте CSV.</div>
  </main>;
}
