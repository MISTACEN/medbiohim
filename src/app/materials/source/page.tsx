"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { ArrowLeft,FileText } from "lucide-react";
import { getContentSource } from "@/lib/content-api";

type Source={id:string;title:string;source_path:string;mime_type?:string|null;original_format?:string|null;source_archive?:string|null;note?:string|null};
export default function MaterialSourcePage(){
 const [source,setSource]=useState<Source|null>(null),[error,setError]=useState<string|null>(null);
 const key=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("key")||"": "";
 useEffect(()=>{if(!key)return;void getContentSource(key).then(r=>{if(r.ok)setSource(r.data.source);else setError(r.error.message)})},[key]);
 return <div className="mx-auto max-w-3xl space-y-5"><Link href="/materials" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline"><ArrowLeft className="h-4 w-4"/>К материалам</Link><div className="card p-6"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-indigo-600"/><div><h1 className="text-xl font-bold">Исходный материал</h1><p className="text-sm text-slate-500">Метаданные первоисточника сохраняются независимо от его веб-представления.</p></div></div>{error&&<div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}{source?<dl className="mt-6 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Название</dt><dd className="font-semibold">{source.title}</dd></div><div><dt className="text-xs text-slate-500">Исходный путь</dt><dd className="break-all">{source.source_path}</dd></div><div><dt className="text-xs text-slate-500">Формат</dt><dd>{source.original_format||source.mime_type||"—"}</dd></div>{source.source_archive&&<div><dt className="text-xs text-slate-500">Архив</dt><dd>{source.source_archive}</dd></div>}{source.note&&<div><dt className="text-xs text-slate-500">Примечание</dt><dd>{source.note}</dd></div>}</dl>:!error&&<p className="mt-5 text-sm text-slate-500">Загрузка…</p>}</div></div>;
}
