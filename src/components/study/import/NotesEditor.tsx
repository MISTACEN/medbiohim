"use client";

import Link from "next/link";
import { Loader2, Save, Wand2 } from "lucide-react";

import type { NotesImportView } from "./useNotesImport";

/** Правка конспекта: название, предмет, текст и сохранение/сборка карточек. */
export function NotesEditor({ view }: { view: NotesImportView }) {
  return (
    <section className="card space-y-3 p-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Название лекции</span>
          <input value={view.title} onChange={(e) => view.setTitle(e.target.value)} placeholder={view.file?.name.replace(/\.[^.]+$/, "") || ""} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Предмет</span>
          <select value={view.subjectSlug} onChange={(e) => view.setSubjectSlug(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
            <option value="">{view.subjects[0]?.name || "— выберите —"}</option>
            {view.subjects.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">Конспект (можно править — исправьте [неразборчиво] и оговорки распознавания)</span>
        <textarea value={view.notes} onChange={(e) => view.setNotes(e.target.value)} rows={16} className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono leading-relaxed" />
      </label>
      <button
        type="button"
        onClick={() => void view.save()}
        disabled={view.saving || !view.notes.trim() || !view.inferredTitle.trim() || !(view.subjectSlug || view.subjects[0]?.slug)}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {view.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {view.saving ? "Сохраняю…" : "Сохранить как личную лекцию"}
      </button>
      <button
        type="button"
        onClick={() => void view.makeCards()}
        disabled={view.cardsBusy || !view.notes.trim()}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold disabled:opacity-50"
      >
        {view.cardsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {view.cardsBusy ? "ИИ собирает карточки…" : "Сделать карточки из конспекта"}
      </button>
      {view.cardsNote ? (
        <p className="text-sm text-[var(--status-ok-fg)]">
          {view.cardsNote}{" "}
          <Link href="/cards" className="font-semibold underline">
            Открыть карточки
          </Link>
        </p>
      ) : null}
    </section>
  );
}
