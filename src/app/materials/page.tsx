"use client";

import { useState } from "react";
import { FileText, File, Presentation, ChevronRight } from "lucide-react";
import { materials } from "@/lib/mock-data";
import { SkeletonCards } from "@/components/ui/Skeleton";

function FileIcon({ type }: { type: string }) {
  if (type === "PDF")
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-card">
        <FileText className="h-7 w-7" />
      </div>
    );
  if (type === "PPTX")
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-card">
        <Presentation className="h-7 w-7" />
      </div>
    );
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-soft bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-card">
      <File className="h-7 w-7" />
    </div>
  );
}

export default function MaterialsPage() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [booting] = useState(false);

  const filtered = materials.filter((m) => {
    if (filter !== "all" && m.subject !== filter) return false;
    if (q && !m.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Материалы</h1>
          <p className="page-subtitle">Учебные файлы и методички</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" className="rounded-pill border border-slate-200 bg-white/80 px-4 py-2 text-sm outline-none backdrop-blur focus:ring-2 focus:ring-primary/25" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-pill border border-slate-200 bg-white/80 px-4 py-2 text-sm outline-none backdrop-blur">
            <option value="all">Все предметы</option>
            <option value="Биология">Биология</option>
            <option value="Гистология">Гистология</option>
            <option value="Химия">Химия</option>
          </select>
        </div>
      </div>

      {booting ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <article key={m.id} className="group relative overflow-hidden rounded-card border border-white/40 bg-white/70 p-5 shadow-soft backdrop-blur-md transition duration-300 hover:-translate-y-1.5 hover:shadow-lift dark:border-white/10 dark:bg-slate-800/60">
              <FileIcon type={m.type} />
              <h2 className="mt-4 font-semibold line-clamp-2 text-slate-900 dark:text-slate-100">{m.title}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="badge-primary">{m.subject}</span>
                <span>{m.type}</span>
                {m.size && <span>· {m.size}</span>}
              </div>
              <div className="mt-1 text-xs text-slate-400">{m.date}</div>
              <div className="mt-4 translate-y-2 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                <button type="button" className="btn-pill inline-flex items-center gap-1 text-xs">
                  Открыть <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!booting && filtered.length === 0 && (
        <div className="card p-12 text-center text-slate-500">Ничего не найдено</div>
      )}
    </div>
  );
}
