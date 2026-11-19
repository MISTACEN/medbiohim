"use client";

/** Карточка материала в сетке: иконка типа, метаданные и действия. */
import { BookOpen, ExternalLink, File, FileText, Presentation } from "lucide-react";
import { type ApiMaterial } from "@/lib/api";
import { stripHtml, typeLabel } from "@/components/materials/model";

function FileIcon({ type }: { type?: string | null }) {
  const t = String(type || "").toLowerCase();
  if (t.includes("pdf")) return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-card"><FileText className="h-7 w-7" /></div>;
  if (t.includes("ppt")) return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-card"><Presentation className="h-7 w-7" /></div>;
  if (t === "lecture" || t === "html") return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-card"><BookOpen className="h-7 w-7" /></div>;
  return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-card"><File className="h-7 w-7" /></div>;
}

export function MaterialCard({ material, onRead }: { material: ApiMaterial; onRead: (material: ApiMaterial) => void }) {
  const m = material;
  return (
    <article className="group relative overflow-hidden rounded-card border border-white/40 bg-white/80 p-5 shadow-soft backdrop-blur-md dark:border-white/10 dark:bg-slate-800/70">
      <FileIcon type={m.type} />
      <h2 className="mt-4 line-clamp-2 font-semibold text-slate-900 dark:text-slate-100">{m.title}</h2>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
        {m.subject_name && <span className="badge-primary">{m.subject_name}</span>}
        <span>{typeLabel(m.type)}</span>
      </div>
      {m.source?.name && <div className="mt-1 line-clamp-1 text-xs text-slate-400">Источник: {m.source.name}</div>}
      {stripHtml(m.content_html) && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{stripHtml(m.content_html)}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-xs" onClick={() => onRead(m)}>Читать</button>
        {m.source?.id ? <a href={"/materials/source?key=" + encodeURIComponent(String(m.source.id))} className="btn-pill inline-flex items-center gap-1 text-xs"><FileText className="h-3.5 w-3.5" /> Метаданные</a> : null}
        {m.source?.download_url ? <a href={m.source.download_url} target="_blank" rel="noreferrer" className="btn-pill inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Исходник</a> : null}
      </div>
    </article>
  );
}
