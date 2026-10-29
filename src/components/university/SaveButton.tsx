"use client";

import { CheckCircle2, Loader2, Save } from "lucide-react";
import type { IntegrationImportInput } from "@/lib/api";
import { useImports } from "./ImportsProvider";

/**
 * «Сохранить» for one university material. Renders nothing at all when the
 * visitor has no MEDBIOHIM session — the hub keeps working without it, and any
 * failure is surfaced inline instead of breaking the section.
 */
export default function SaveButton({ payload, label = "Сохранить" }: { payload: IntegrationImportInput[]; label?: string }) {
  const { enabled, ready, isSaved, isSaving, save } = useImports();
  if (!ready || !enabled || payload.length === 0) return null;

  const url = payload[0].url;
  if (isSaved(url)) {
    return (
      <span
        title="Материал уже в «Сохранённом из порталов вуза»"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--status-ok-fg)]"
      >
        <CheckCircle2 className="h-3 w-3" /> В списке
      </span>
    );
  }

  if (isSaving(url)) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Сохраняем
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void save(payload)}
      title="Сохранить в MEDBIOHIM"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700"
    >
      <Save className="h-3 w-3" /> {label}
    </button>
  );
}
