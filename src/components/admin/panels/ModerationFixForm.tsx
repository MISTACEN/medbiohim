"use client";

/** Модерация: быстрый фикс с предпросмотром изменений. */
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import {
  MODERATION_FIELD_LABEL,
  MODERATION_TARGETS,
  formatModerationValue,
  type ModerationFixChange,
} from "@/components/admin/panels/model";

export function ModerationFixForm({
  target,
  onTarget,
  targetId,
  onTargetId,
  patch,
  onPatch,
  reason,
  onReason,
  preview,
  busy,
  onPreview,
  onApply,
}: {
  target: keyof typeof MODERATION_TARGETS;
  onTarget: (value: keyof typeof MODERATION_TARGETS) => void;
  targetId: string;
  onTargetId: (value: string) => void;
  patch: Record<string, unknown>;
  onPatch: (updater: (current: Record<string, unknown>) => Record<string, unknown>) => void;
  reason: string;
  onReason: (value: string) => void;
  preview: ModerationFixChange[] | null;
  busy: string;
  onPreview: () => void;
  onApply: () => void;
}) {
  const fields = MODERATION_TARGETS[target].fields;

  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />Быстрый фикс с предпросмотром</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          value={target}
          onChange={(event) => onTarget(event.target.value as keyof typeof MODERATION_TARGETS)}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        >
          {Object.entries(MODERATION_TARGETS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
        </select>
        <input value={targetId} onChange={(event) => onTargetId(event.target.value)} placeholder="UUID записи" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((field) => {
          const isBoolean = field === "is_published" || field === "archived_at";
          if (field === "status") return (
            <select key={field} value={String(patch[field] ?? "")} onChange={(event) => onPatch((current) => ({ ...current, [field]: event.target.value || null }))} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <option value="">Статус…</option>
              {["draft", "pending", "published", "hidden", "rejected"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          );
          if (field === "text" || field === "summary") return (
            <textarea key={field} value={String(patch[field] ?? "")} onChange={(event) => onPatch((current) => ({ ...current, [field]: event.target.value }))} rows={3} placeholder={MODERATION_FIELD_LABEL[field]} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2" />
          );
          if (isBoolean) return (
            <label key={field} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(patch[field])} onChange={(event) => onPatch((current) => ({ ...current, [field]: field === "archived_at" ? (event.target.checked ? new Date().toISOString() : null) : event.target.checked }))} className="h-4 w-4" />
              {MODERATION_FIELD_LABEL[field]}
            </label>
          );
          return (
            <input
              key={field}
              value={String(patch[field] ?? "")}
              onChange={(event) => {
                const raw = event.target.value;
                const value = field === "time_limit_sec" ? (raw === "" ? null : Number(raw)) : raw;
                onPatch((current) => ({ ...current, [field]: value }));
              }}
              placeholder={MODERATION_FIELD_LABEL[field]}
              inputMode={field === "time_limit_sec" ? "numeric" : undefined}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            />
          );
        })}
      </div>
      <input value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Причина / комментарий для аудита" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} disabled={busy === "preview"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Предпросмотр</button>
        <button type="button" onClick={onApply} disabled={busy === "apply" || !preview?.length} className="btn-primary inline-flex items-center gap-2 text-sm">{busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Применить</button>
      </div>
      {preview && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <b>Что изменится:</b>
          {preview.length === 0 ? <p className="mt-1 text-slate-500">Изменений нет.</p> : (
            <ul className="mt-2 space-y-1">
              {preview.map((change) => (
                <li key={change.field}><span className="font-semibold">{change.label}:</span> {formatModerationValue(change.before)} → {formatModerationValue(change.after)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
