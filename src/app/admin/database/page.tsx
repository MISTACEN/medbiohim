"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, History, Plus, RefreshCw, Save, Trash2, Upload, Table2 } from "lucide-react";
import * as XLSX from "xlsx";
import { adminDbAudit, adminDbDelete, adminDbDeleteByKey, adminDbInsert, adminDbList, adminDbMeta, adminDbUpdate, adminDbUpdateByKey, adminRollbackAudit, AdminDbRow, hasToken } from "@/lib/api";

type Meta={name:string;items:number|null;primary_key:string[];columns:string[]};

function display(v:unknown):string{return v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):String(v)}
function parseValue(v:string,original:unknown){if(v==="")return original===null?null:"";if(typeof original==="number"){const n=Number(v);return Number.isFinite(n)?n:v}if(typeof original==="boolean")return v==="true"||v==="1";if(original&&typeof original==="object"){try{return JSON.parse(v)}catch{return v}}return v}
function keyOf(r:AdminDbRow,keys:string[]){return keys.map((k:string)=>String((r as any)[k]??"")).join("|")}

export default function AdminDatabasePage(){
 const [metas,setMetas]=useState<Meta[]>([]);
 const [table,setTable]=useState("subjects");
 const [rows,setRows]=useState<AdminDbRow[]>([]);
 const [original,setOriginal]=useState<AdminDbRow[]>([]);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [audit,setAudit]=useState<AdminDbRow[]>([]);
 const fileRef=useRef<HTMLInputElement>(null);
 const meta=metas.find((x:Meta)=>x.name===table);const keys=meta?.primary_key??["id"];
 async function loadMeta(){
   const r:any=await adminDbMeta();
   if(r.ok){
     const items=(r.data?.items||[]) as Meta[];
     setMetas(items);
     if(!items.some((x:Meta)=>x.name===table)&&items[0])setTable(items[0].name);
   }else setMessage(String(r.error?.message||"Ошибка meta"));
 }
 async function load(){
   setLoading(true);
   const r:any=await adminDbList(table,500);
   if(r.ok){
     const items=(r.data?.items||[]) as AdminDbRow[];
     setRows(items);
     setOriginal(items.map((x:AdminDbRow)=>({...(x as object)} as AdminDbRow)));
   }else setMessage(String(r.error?.message||"Ошибка list"));
   setLoading(false);
 }
 async function loadAudit(){
   const r:any=await adminDbAudit(100);
   if(r.ok)setAudit((r.data?.items||[]) as AdminDbRow[]);
 }
 useEffect(()=>{if(hasToken()){const requested=new URLSearchParams(window.location.search).get("table");if(requested)setTable(requested);void loadMeta();void loadAudit()}},[]);
 useEffect(()=>{if(hasToken())void load()},[table]);
 const columns=useMemo(()=>meta?.columns?.length?meta.columns:Array.from(new Set(rows.flatMap((r:AdminDbRow)=>Object.keys(r as object)))),[meta,rows]);
 const dirty=(r:AdminDbRow)=>{const o=original.find((x:AdminDbRow)=>keyOf(x,keys)===keyOf(r,keys));return JSON.stringify(r)!==JSON.stringify(o)};
 function setCell(i:number,k:string,v:string){setRows((p:AdminDbRow[])=>p.map((r:AdminDbRow,n:number)=>n===i?{...(r as object),[k]:parseValue(v,(r as any)[k])} as AdminDbRow:r))}
 async function saveRow(row:AdminDbRow){
   let r:any;
   if(keys.length===1&&keys[0]==="id"&&!(row as any).id) r=await adminDbInsert(table,row);
   else if(keys.length===1&&keys[0]==="id") {const payload={...(row as object)} as any;delete payload.id;r=await adminDbUpdate(table,String((row as any).id),payload)}
   else {const key=Object.fromEntries(keys.map((k:string)=>[k,(row as any)[k]]));const payload={...(row as object)} as any;keys.forEach((k:string)=>delete payload[k]);r=await adminDbUpdateByKey(table,key,payload)}
   if(r.ok){setMessage("Сохранено");await load();await loadAudit()}else setMessage(String(r.error?.message||"Ошибка"))
 }
 async function deleteRow(row:AdminDbRow){
   if(!confirm("Удалить эту строку?"))return;let r:any;
   if(keys.length===1&&keys[0]==="id")r=await adminDbDelete(table,String((row as any).id));else r=await adminDbDeleteByKey(table,Object.fromEntries(keys.map((k:string)=>[k,(row as any)[k]])));
   if(r.ok){setMessage("Удалено");await load();await loadAudit()}else setMessage(String(r.error?.message||"Ошибка"))
 }
 function addRow(){const r:AdminDbRow={};columns.forEach((k:string)=>{(r as any)[k]=keys.includes(k)?undefined:""});setRows((p:AdminDbRow[])=>[...p,r])}
 function exportXLSX(){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows as any[]),table.slice(0,31));XLSX.writeFile(wb,table+".xlsx")}
 async function importFile(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;try{const wb=XLSX.read(await f.arrayBuffer(),{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],items=XLSX.utils.sheet_to_json<AdminDbRow>(ws,{defval:""});let ok=0;for(const row of items){const keyOk=keys.every((k:string)=>(row as any)[k]!==undefined&&(row as any)[k]!=="");let r:any;if(keyOk){const key=Object.fromEntries(keys.map((k:string)=>[k,(row as any)[k]]));const payload={...(row as object)} as any;keys.forEach((k:string)=>delete payload[k]);r=await adminDbUpdateByKey(table,key,payload)}else r=await adminDbInsert(table,row);if(r.ok)ok++}setMessage("Обработано: "+ok+"/"+items.length);await load();await loadAudit()}catch(err){setMessage(err instanceof Error?err.message:"Ошибка импорта")}e.target.value=""}
 if(!hasToken())return <div className="card mx-auto max-w-md p-8 text-center"><h1 className="page-title">База данных</h1><p className="page-subtitle">Сначала войдите.</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;
 return <main className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
  <header className="flex flex-wrap items-end justify-between gap-3"><div><Link href="/admin" className="text-sm text-indigo-600">← Админ</Link><h1 className="mt-1 page-title flex items-center gap-2"><Table2 className="h-6 w-6"/>База данных · Excel режим</h1><p className="page-subtitle">Supabase как единая база. Поддерживаются обычные и составные ключи.</p></div><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>void load()}><RefreshCw className="mr-2 inline h-4 w-4"/>Обновить</button><button className="btn-secondary" onClick={addRow}><Plus className="mr-2 inline h-4 w-4"/>Строка</button><button className="btn-secondary" onClick={exportXLSX}><Download className="mr-2 inline h-4 w-4"/>Excel</button><button className="btn-primary" onClick={()=>fileRef.current?.click()}><Upload className="mr-2 inline h-4 w-4"/>Импорт</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls" onChange={e=>void importFile(e)}/></div></header>
  {message&&<div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">{message}</div>}
  <div className="card p-3"><div className="flex flex-wrap gap-2">{metas.map((t:Meta)=><button key={t.name} onClick={()=>setTable(t.name)} className={"rounded-lg px-3 py-2 text-xs font-semibold "+(table===t.name?"bg-indigo-600 text-white":"bg-slate-100 text-slate-600")}>{t.name} <span className="opacity-70">({t.items??"?"})</span></button>)}</div></div>
  <div className="card overflow-hidden"><div className="border-b bg-slate-50 px-4 py-3 text-xs text-slate-500">Ключ: <b>{keys.join(" + ")}</b>. Ключевые поля нельзя менять — для переноса используйте специальный редактор контента.</div><div className="overflow-auto"><table className="min-w-full text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{columns.map((k:string)=><th key={k} className="whitespace-nowrap border-b border-r px-3 py-2 text-left">{k}</th>)}<th className="sticky right-0 border-b bg-slate-100 px-3">Действия</th></tr></thead><tbody>{rows.map((r:AdminDbRow,i:number)=><tr key={keyOf(r,keys)||i} className={dirty(r)?"bg-amber-50":"bg-white"}>{columns.map((k:string)=><td key={k} className="border-b border-r p-0"><input disabled={keys.includes(k)} value={display((r as any)[k])} onChange={e=>setCell(i,k,e.target.value)} className="min-w-[130px] bg-transparent px-3 py-2 outline-none focus:bg-indigo-50 disabled:text-slate-400"/></td>)}<td className="sticky right-0 border-b bg-white px-2"><button className="mr-1 rounded-lg bg-emerald-50 p-2 text-emerald-700" onClick={()=>void saveRow(r)}><Save className="h-4 w-4"/></button><button className="rounded-lg bg-rose-50 p-2 text-rose-700" onClick={()=>void deleteRow(r)}><Trash2 className="h-4 w-4"/></button></td></tr>)}</tbody></table></div></div>
  <section className="card"><h2 className="flex items-center gap-2 font-bold"><History className="h-4 w-4"/>Журнал изменений</h2><div className="mt-3 max-h-64 overflow-auto text-xs">{audit.map((x:AdminDbRow)=><div key={String((x as any).id)} className="flex flex-wrap items-center justify-between gap-3 border-b py-2"><div><b>{display((x as any).action)}</b> · {display((x as any).table_name)} · {display((x as any).row_key)} · {display((x as any).created_at)}</div>{["update","delete"].includes(String((x as any).action))&&<button type="button" className="rounded-lg border px-2 py-1 text-[11px] font-semibold text-indigo-700" onClick={async()=>{if(!confirm("Восстановить эту версию?"))return;const r=await adminRollbackAudit(String((x as any).id));if(!r.ok)return setMessage(String(r.error?.message||"Rollback error"));setMessage("Версия восстановлена");await load();await loadAudit();}}>Восстановить</button>}</div>)}</div></section>
 </main>
}
