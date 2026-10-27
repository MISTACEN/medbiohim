"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Единое состояние ошибки: русский текст, необязательный код обращения и
 * кнопка «Повторить», которая повторяет именно тот запрос, что упал.
 */
export function ErrorState({
  title = "Не удалось загрузить данные",
  message,
  requestId,
  retry,
  retryLabel = "Повторить",
  compact = false,
}: {
  title?: string;
  message: string;
  requestId?: string;
  retry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={"card text-center " + (compact ? "p-4" : "p-8")}
      role="alert"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
      >
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="mt-3 font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </div>
      <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--muted)" }}>
        {message}
      </p>
      {requestId ? (
        <p className="mt-2 text-xs tabular-nums" style={{ color: "var(--muted)" }}>
          Код обращения: {requestId}
        </p>
      ) : null}
      {retry ? (
        <button type="button" onClick={retry} className="btn-secondary mt-4 inline-flex items-center gap-2 text-sm">
          <RotateCcw className="h-4 w-4" /> {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
