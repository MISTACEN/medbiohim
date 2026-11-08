"use client";

/**
 * Вкладка «Материалы» предмета (ЗАДАЧА A5 шаг 2): библиотека кафедры + 
 * rich-материалы с чтением на месте. Вынесено из монолита subjects/[id]/page.tsx.
 */
import { FolderOpen, ExternalLink } from "lucide-react";
import HistologyMaterials from "@/components/trainers/HistologyMaterials";
import { materialTypeLabel, stripHtml } from "./tabs-config";

type Props = {
  histology: boolean;
  materialsRich: any[];
  subjectLibrary: Array<{ href: string; title: string; type: string }>;
  onRead: (m: any) => void;
  onSelectTab: (tab: "practice" | "tests") => void;
};

export function MaterialsTab({ histology, materialsRich, subjectLibrary, onRead, onSelectTab }: Props) {
  if (histology) return <HistologyMaterials />;
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Материалы</h2>
      <p className="mt-1 text-sm text-slate-500">
        {materialsRich.length
          ? materialsRich.length + " материалов — читаются прямо здесь, оригинал доступен отдельно."
          : subjectLibrary.length
            ? subjectLibrary.length + " исходных пособий кафедры — открываются здесь же."
            : "Материалы пока не найдены."}
      </p>
      {subjectLibrary.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {subjectLibrary.map((file) => (
            <a
              key={file.href}
              href={file.href}
              target="_blank"
              rel="noreferrer"
              className="flex gap-3 rounded-xl border bg-slate-50 p-4 transition hover:border-indigo-300 hover:bg-white"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <FolderOpen className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-snug">{file.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{file.type}</span>
              </span>
            </a>
          ))}
        </div>
      )}
      {materialsRich.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {materialsRich.map((m: any) => (
            <article key={m.id} className="rounded-xl border bg-slate-50 p-4">
              <div className="font-semibold leading-snug">{m.title}</div>
              <div className="mt-1 text-xs text-slate-500">{materialTypeLabel(m.type)}{m.source?.name ? " · " + m.source.name : ""}</div>
              {stripHtml(m.content_html) && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{stripHtml(m.content_html)}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-primary text-xs" onClick={() => onRead(m)}>Читать</button>
                {m.source?.download_url ? (
                  <a href={m.source.download_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                    <ExternalLink className="h-3.5 w-3.5" /> Исходник
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {!materialsRich.length && !subjectLibrary.length && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onSelectTab("practice")} className="btn-primary inline-flex">Открыть базу вопросов</button>
          <button
            type="button"
            onClick={() => onSelectTab("tests")}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            Перейти к тестам
          </button>
        </div>
      )}
    </section>
  );
}

