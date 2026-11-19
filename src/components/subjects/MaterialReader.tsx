"use client";

/** Модальное чтение материала без ухода со страницы предмета. */
import { ExternalLink, X } from "lucide-react";
import { materialTypeLabel } from "@/components/subjects/tabs-config";
import type { SubjectController } from "@/components/subjects/useSubjectPage";

export function MaterialReader({ page }: { page: SubjectController }) {
  const { activeMaterial, setActiveMaterial, subject } = page;
  if (!activeMaterial) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setActiveMaterial(null)}>
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{subject?.name} · {materialTypeLabel(activeMaterial.type)}</div>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">{activeMaterial.title}</h2>
            {activeMaterial.source?.name && <div className="mt-1 text-xs text-slate-500">Исходный файл: {activeMaterial.source.name}</div>}
          </div>
          <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setActiveMaterial(null)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {activeMaterial.content_html ? (
            <article className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: activeMaterial.content_html }} />
          ) : activeMaterial.external_url ? (
            <iframe src={activeMaterial.external_url} title={activeMaterial.title} className="h-full min-h-[60vh] w-full rounded-xl border" />
          ) : (
            <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">У этого материала пока нет преобразованного текста.</div>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-5 py-4">
          <span className="text-xs text-slate-500">{activeMaterial.source_key ? "Источник: " + activeMaterial.source_key : "Источник не указан"}</span>
          <div className="flex gap-2">
            {activeMaterial.source?.download_url ? (
              <a href={activeMaterial.source.download_url} target="_blank" rel="noreferrer" className="btn-pill inline-flex items-center gap-2 text-sm">
                <ExternalLink className="h-4 w-4" /> Открыть оригинал
              </a>
            ) : null}
            <button type="button" className="btn-primary text-sm" onClick={() => setActiveMaterial(null)}>Закрыть</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
