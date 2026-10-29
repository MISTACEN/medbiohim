"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft,FileText } from "lucide-react";
import { getContentSource } from "@/lib/content-api";
import { describeApiError } from "@/lib/errors";

type Source={id:string;title:string;source_path:string;mime_type?:string|null;original_format?:string|null;source_archive?:string|null;note?:string|null};
type Download={url:string;name?:string|null;mime_type?:string|null;size_bytes?:number|null};
function MaterialSourcePageInner(){
 const searchParams=useSearchParams();
 const key=searchParams.get("key")||"";
 const [source,setSource]=useState<Source|null>(null),[download,setDownload]=useState<Download|null>(null),[error,setError]=useState<string|null>(null);
 useEffect(()=>{if(!key)return;void getContentSource(key).then(r=>{if(r.ok){setSource(r.data.source);setDownload((r.data as any).download||null)}else setError(describeApiError(r.error))})},[key]);
 return <div className="mx-auto max-w-3xl space-y-5"><Link href="/materials" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline"><ArrowLeft className="h-4 w-4"/>К материалам</Link><div className="card p-6"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-indigo-600"/><div><h1 className="text-xl font-bold">Исходный материал</h1><p className="text-sm text-slate-500">Метаданные первоисточника сохраняются независимо от его веб-представления.</p></div></div>{error&&<div className="mt-4 rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}{source?<dl className="mt-6 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Название</dt><dd className="font-semibold">{source.title}</dd></div><div><dt className="text-xs text-slate-500">Исходный путь</dt><dd className="break-all">{source.source_path}</dd></div><div><dt className="text-xs text-slate-500">Формат</dt><dd>{source.original_format||source.mime_type||"—"}</dd></div>{source.source_archive&&<div><dt className="text-xs text-slate-500">Архив</dt><dd>{source.source_archive}</dd></div>}{source.note&&<div><dt className="text-xs text-slate-500">Примечание</dt><dd>{source.note}</dd></div>}</dl>:!error&&<p className="mt-5 text-sm text-slate-500">Загрузка…</p>}{source&&download?.url&&<a href={download.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Открыть оригинал</a>}</div></div>;
}

export default function MaterialSourcePage(){
 return <Suspense fallback={<div className="mx-auto max-w-3xl space-y-5 p-8 text-sm text-slate-500">Загрузка…</div>}><MaterialSourcePageInner/></Suspense>;
}
