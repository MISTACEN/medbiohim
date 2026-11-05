"use client";

/**
 * Служебные состояния просмотрщиков: загрузка, ошибка, предупреждение.
 * Один вид для всех форматов, чтобы DOCX и XLSX не расходились в оформлении.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Info, Loader2, RotateCcw } from "lucide-react";

export function ViewerLoading({ label = "Открываем файл…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-slate-500" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ViewerError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="space-y-3 p-6 text-sm" role="alert">
      <div className="flex items-start gap-2 text-[var(--status-critical-fg)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-relaxed">{message || "Не удалось открыть файл."}</p>
      </div>
      {onRetry ? (
        <button type="button" className="btn-secondary inline-flex items-center gap-2 text-xs" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" /> Повторить
        </button>
      ) : null}
    </div>
  );
}

export function ViewerNotice({
  children,
  tone = "warning",
}: {
  children: ReactNode;
  tone?: "warning" | "info";
}) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  const classes =
    tone === "info"
      ? "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]"
      : "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]";
  return (
    <div className={"flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed " + classes}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}
