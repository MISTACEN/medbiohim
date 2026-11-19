"use client";

/** Модерация: слияние дубликатов тем с предпросмотром. */
import { Merge } from "lucide-react";

export function ModerationMergeTopics({
  merge,
  onMerge,
  busy,
  onCheck,
  onApply,
}: {
  merge: { source: string; target: string; preview: any };
  onMerge: (updater: { source: string; target: string; preview: any }) => void;
  busy: string;
  onCheck: () => void;
  onApply: () => void;
}) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold"><Merge className="h-4 w-4" />Слияние дубликатов тем</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={merge.source} onChange={(event) => onMerge({ ...merge, source: event.target.value })} placeholder="ID темы-дубля" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        <input value={merge.target} onChange={(event) => onMerge({ ...merge, target: event.target.value })} placeholder="ID основной темы" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCheck} disabled={busy === "merge-preview"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Проверить</button>
        <button type="button" onClick={onApply} disabled={busy === "merge"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Объединить</button>
      </div>
      {merge.preview && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm">Переместится тестов: <b>{merge.preview.tests}</b>, вопросов: <b>{merge.preview.questions}</b>. Исходная тема уйдёт в архив.</p>
      )}
    </section>
  );
}
