"use client";

/** Конструктор аттестаций: список или форма, состояние — в хуке домена. */
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, FilePlus2, X } from "lucide-react";
import { clearDraft, formatDraftTime } from "@/lib/unsaved-changes";
import { AttestationEditorPanel } from "@/components/admin/attestations/AttestationEditorPanel";
import { AttestationListPanel } from "@/components/admin/attestations/AttestationListPanel";
import { useAttestationEditor } from "@/components/admin/attestations/useAttestationEditor";

export default function AdminAttestationsPage() {
  const editor = useAttestationEditor();
  const { draft, draftOffer, setDraftOffer, attestationDraftKey, notice, setNotice, setDraft, setIsNew, startNew, dialog } = editor;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> В центр управления
        </Link>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <FilePlus2 className="h-4 w-4" /> Новая аттестация
        </button>
      </div>

      <header>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
          <ClipboardList className="h-4 w-4" /> Конструктор
        </div>
        <h1 className="mt-1.5 font-serif text-3xl font-semibold tracking-tight">Аттестации</h1>
        <p className="mt-1 text-sm text-slate-500">
          Коллоквиум, экзамен, зачёт, тест или контрольная по любому предмету. Этапы, теория, тесты с проверкой и задачи с эталоном.
        </p>
      </header>

      {draftOffer && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <span className="min-w-0 flex-1">
            Найден несохранённый черновик аттестации от {formatDraftTime(draftOffer.savedAt)}.
          </span>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => {
              setDraft(draftOffer.data.item);
              setIsNew(Boolean(draftOffer.data.isNew));
              setDraftOffer(null);
              setNotice({ tone: "ok", text: "Черновик восстановлен — проверьте и сохраните." });
            }}
          >
            Восстановить
          </button>
          <button
            type="button"
            className="text-xs font-semibold text-[var(--status-critical-fg)]"
            onClick={() => { clearDraft(attestationDraftKey); setDraftOffer(null); }}
          >
            Удалить черновик
          </button>
        </div>
      )}

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "ok" ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {notice.tone === "ok" && <CheckCircle2 className="h-4 w-4" />} {notice.text}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!draft && <AttestationListPanel editor={editor} />}
      {draft && <AttestationEditorPanel editor={editor} />}
      {dialog}
    </div>
  );
}
