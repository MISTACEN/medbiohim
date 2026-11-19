"use client";

/** Модальное окно просмотра материала: шапка, тело и футер с оригиналом. */
import { ExternalLink, X } from "lucide-react";
import { type ApiMaterial } from "@/lib/api";
import { typeLabel } from "@/components/materials/model";
import { MaterialBody } from "@/components/materials/MaterialBody";

export function MaterialViewerModal({ material, onClose }: { material: ApiMaterial; onClose: () => void }) {
  const active = material;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose}>
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{active.subject_name} · {typeLabel(active.type)}</div><h2 className="mt-1 text-xl font-extrabold text-slate-900">{active.title}</h2>{active.source?.name && <div className="mt-1 text-xs text-slate-500">Исходный файл: {active.source.name}</div>}</div>
          <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <MaterialBody material={active} />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-5 py-4">
          <span className="text-xs text-slate-500">{active.source_key ? "Источник: " + active.source_key : "Источник не указан"}</span>
          <div className="flex gap-2">
            {active.source?.download_url ? <a href={active.source.download_url} target="_blank" rel="noreferrer" className="btn-pill inline-flex items-center gap-2 text-sm"><ExternalLink className="h-4 w-4" /> Открыть оригинал</a> : null}
            <button type="button" className="btn-primary text-sm" onClick={onClose}>Закрыть</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
