"use client";

/**
 * Конспект из файла (roadmap 2.5 MVP): фото лекции/слайда, PDF или текстовый
 * файл → ИИ собирает структурный конспект → правки → сохранение как личная
 * лекция. Дальше её можно открыть как обычную лекцию и собрать по ней
 * конспект с пропусками и пак карточек.
 *
 * Состояние — в useNotesImport, разметка — в NotesFilePicker и NotesEditor.
 */
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";

import { useNotesImport } from "@/components/study/import/useNotesImport";
import { NotesEditor } from "@/components/study/import/NotesEditor";
import { NotesFilePicker } from "@/components/study/import/NotesFilePicker";

export default function ImportNotesPage() {
  const view = useNotesImport();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href="/study" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> К учёбе
      </Link>
      <header>
        <h1 className="inline-flex items-center gap-2 text-xl font-extrabold">
          <FileText className="h-5 w-5 text-[var(--primary)]" /> Конспект из файла
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Фото страницы конспекта или слайда, PDF с текстовым слоем, txt/md или аудиозапись лекции (mp3/m4a/wav до 4 МБ) — ИИ соберёт структурный конспект, который можно сохранить как личную лекцию.
        </p>
      </header>

      {view.savedId ? (
        <section className="card space-y-3 p-5">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-[var(--status-ok-fg)]">
            <CheckCircle2 className="h-5 w-5" /> Конспект сохранён как личная лекция
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/lectures/${encodeURIComponent(view.savedId)}`} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white">
              Открыть лекцию
            </Link>
            <Link href="/teacher" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold">
              Все мои лекции
            </Link>
          </div>
        </section>
      ) : (
        <>
          <NotesFilePicker view={view} />

          {view.notes ? <NotesEditor view={view} /> : null}

          {view.error ? <p className="text-sm text-[var(--status-critical-fg)]">{view.error}</p> : null}
        </>
      )}
    </main>
  );
}
