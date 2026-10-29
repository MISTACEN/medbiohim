"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Опасное действие: красная кнопка и иконка предупреждения. */
  danger?: boolean;
};

type Pending = { options: ConfirmOptions; resolve: (value: boolean) => void };

/**
 * Один диалог подтверждения на всю админку.
 *
 * `window.confirm` блокирует поток, не стилизуется, на мобильных выглядит как
 * системная ошибка и не даёт показать, что именно удаляется. Здесь — promise-API:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: "Удалить объявление?", danger: true }))) return;
 *   ... и в разметке {dialog}
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPending({ options, resolve });
  }), []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      if (current) current.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    // Фокус на подтверждении: Enter не должен случайно нажать «Отмена», но и
    // Escape обязан закрывать без побочных эффектов.
    const timer = setTimeout(() => confirmButtonRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pending, close]);

  const dialog = pending ? (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="card w-full max-w-md space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {pending.options.danger && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-critical-fg)]" />}
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="font-bold leading-snug">{pending.options.title}</h2>
            {pending.options.description && (
              <div className="mt-1 text-sm text-[var(--muted)]">{pending.options.description}</div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => close(false)}>
            {pending.options.cancelLabel || "Отмена"}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={pending.options.danger
              ? "rounded-xl bg-[var(--status-critical-fg)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--status-critical-fg)]"
              : "btn-primary"}
            onClick={() => close(true)}
          >
            {pending.options.confirmLabel || "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
