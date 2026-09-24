"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, ExternalLink, File, FileText, Search, X, Presentation } from "lucide-react";
import { listMaterials, type ApiMaterial, hasToken } from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";

function FileIcon({ type }: { type?: string | null }) {
  const t = String(type || "").toLowerCase();
  if (t.includes("pdf")) return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-card"><FileText className="h-7 w-7" /></div>;
  if (t.includes("ppt")) return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-card"><Presentation className="h-7 w-7" /></div>;
  if (t === "lecture" || t === "html") return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-card"><BookOpen className="h-7 w-7" /></div>;
  return <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-card"><File className="h-7 w-7" /></div>;
}

function typeLabel(type?: string | null) {
  const map: Record<string, string> = { lecture: "Лекция", pdf: "PDF", pptx: "Презентация", docx: "Word", lab: "Лабораторная", table: "Таблица", html: "Страница", video: "Видео", other: "Материал" };
  return map[String(type || "")] || String(type || "Материал");
}

function stripHtml(html?: string | null) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function MaterialsPage() {
  const searchParams = useSearchParams();
  const initialSubjectSlug = searchParams.get("subject_slug") || "";
  const initialQuery = searchParams.get("q") || "";
  const [items, setItems = useState<ApiMaterial[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState<ApiMaterial | null>(null);

  async function load(query = q.trim()) {
    setLoading(true);
    setNote(null);
    const r = await listMaterials({ subjectSlug: initialSubjectSlug || undefined, q: query || undefined });
    if (r.ok) setItems(r.data.items || []);
    else setNote(r.error.message);
    setLoading(false);
  }

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false);
      setNote("Войдите, чтобы открыть материалы.");
      return;
    }
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubjectSlug]);

  const visible = items.filter((m) => filter === "all" || String(m.subject_name || "") === filter);
  const subjectNames = Array.from(new Set(items.map((m) => String(m.subject_name || "")).filter(Boolean))).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Материалы</h1>
          <p className="page-subtitle">Документы и конспекты превращаются в страницы сайта. Оригинал остаётся доступным отдельно.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(); }} placeholder="Поиск по материалам…" className="w-64 rounded-pill border border-slate-200 bg-white/90 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/25" />
          </label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-pill border border-slate-200 bg-white/90 px-4 py-2 text-sm outline-none">
            <option value="all">Все предметы</option>
            {subjectNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      {note && <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{note}</div>}

      {loading ? <SkeletonCards count={6} /> : visible.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="font-semibold">Материалы пока не загружены в Supabase</div>
          <p className="mt-1 text-sm">После импорта пакета документы появятся здесь уже как страницы сайта.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => (
            <article key={m.id} className="group relative overflow-hidden rounded-card border border-white/40 bg-white/80 p-5 shadow-soft backdrop-blur-md dark:border-white/10 dark:bg-slate-800/70">
              <FileIcon type={m.type} />
              <h2 className="mt-4 line-clamp-2 font-semibold text-slate-900 dark:text-slate-100">{m.title}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                {m.subject_name && <span className="badge-primary">{m.subject_name}</span>}
                <span>{typeLabel(m.type)}</span>
              </div>
              {m.source?.name && <div className="mt-1 line-clamp-1 text-xs text-slate-400">Источник: {m.source.name}</div>}
              {stripHtml(m.content_html) && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{stripHtml(m.content_html)}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary text-xs" onClick={() => setActive(m)}>Читать</button>
                {m.source?.download_url ? <a href={m.source.download_url} target="_blank" rel="noreferrer" className="btn-pill inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Исходник</a> : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setActive(null)}>
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div><div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{active.subject_name} · {typeLabel(active.type)}</div><h2 className="mt-1 text-xl font-extrabold text-slate-900">{active.title}</h2>{active.source?.name && <div className="mt-1 text-xs text-slate-500">Исходный файл: {active.source.name}</div>}</div>
              <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setActive(null)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {active.content_html ? <article className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: active.content_html }} /> : active.external_url ? <iframe src={active.external_url} title={active.title} className="h-full min-h-[60vh] w-full rounded-xl border" /> : <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">У этого материала пока нет преобразованного текста.</div>}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-5 py-4">
              <span className="text-xs text-slate-500">{active.source_key ? "Источник: " + active.source_key : "Источник не указан"}</span>
              <div className="flex gap-2">
                {active.source?.download_url ? <a href={active.source.download_url} target="_blank" rel="noreferrer" className="btn-pill inline-flex items-center gap-2 text-sm"><ExternalLink className="h-4 w-4" /> Открыть оригинал</a> : null}
                <button type="button" className="btn-primary text-sm" onClick={() => setActive(null)}>Закрыть</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
