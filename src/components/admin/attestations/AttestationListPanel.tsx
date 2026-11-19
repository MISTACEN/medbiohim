"use client";

/** Список опубликованных аттестаций и черновиков. */
import Link from "next/link";
import { Eye, Loader2, Trash2 } from "lucide-react";
import { ATTESTATION_TYPE_LABELS } from "@/types/attestations";
import { inputClass } from "@/components/admin/attestations/model";
import type { AttestationEditorState } from "@/components/admin/attestations/useAttestationEditor";

export function AttestationListPanel({ editor }: { editor: AttestationEditorState }) {
  const { filtered, loading, listError, query, setQuery, openExisting, remove } = editor;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <h2 className="text-sm font-bold">Опубликованные и черновики</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию или предмету"
          className={`${inputClass} max-w-xs`}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}
      {listError && <div className="p-6 text-sm text-[var(--status-critical-fg)]">{listError}</div>}
      {!loading && !listError && filtered.length === 0 && (
        <div className="p-10 text-center text-sm text-slate-400">Аттестаций пока нет. Создайте первую.</div>
      )}

      <ul className="divide-y divide-[var(--border)]">
        {filtered.map((item) => (
          <li key={`${item.subject_slug}:${item.slug}`} className="flex flex-wrap items-center gap-3 p-4">
            <span className={`h-2 w-2 shrink-0 rounded-full ${item.is_published ? "bg-[var(--status-ok-fg)]" : "bg-[var(--status-warn-fg)]"}`} />
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => void openExisting(item)} className="block text-left">
                <span className="block text-sm font-semibold text-[var(--text)] hover:text-indigo-600">{item.title}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {ATTESTATION_TYPE_LABELS[item.type]} · {item.subject_name || item.subject_slug} · {item.stages_count} этап(ов) ·{" "}
                  {item.items_count} материал(ов) · {item.is_published ? "опубликовано" : "черновик"}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={`/subjects/${item.subject_slug}/attestations/${item.slug}`}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-500 hover:text-indigo-600"
                aria-label="Открыть"
              >
                <Eye className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => void remove(item)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)]"
                aria-label="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
