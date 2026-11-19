"use client";

import { Loader2, Upload, Wand2 } from "lucide-react";

import { ACCEPT } from "./model";
import type { NotesImportView } from "./useNotesImport";

/** Выбор файла и кнопка сборки конспекта. */
export function NotesFilePicker({ view }: { view: NotesImportView }) {
  return (
    <section className="card space-y-3 p-5">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center transition hover:border-[var(--primary)]/50">
        <Upload className="h-6 w-6 text-[var(--primary)]" />
        <span className="text-sm font-semibold">{view.file ? view.file.name : "Выберите файл: фото, PDF, txt/md"}</span>
        <span className="text-xs text-[var(--muted)]">до 8 МБ · JPG/PNG/WebP, PDF с текстовым слоем</span>
        <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => void view.pickFile(e.target.files?.[0] || null)} />
      </label>
      <button
        type="button"
        onClick={() => void view.generate()}
        disabled={!view.file || view.generating}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {view.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {view.generating ? "ИИ читает файл…" : "Собрать конспект"}
      </button>
    </section>
  );
}
