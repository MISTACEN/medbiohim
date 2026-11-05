"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

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
 *
 * Этап D: затемнение, карточка, Escape и клик по фону — это `Modal`, кнопки —
 * `Button`. Смысл остался прежним (`alertdialog` + фокус на подтверждении).
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
    // Фокус на подтверждении: Enter не должен случайно нажать «Отмена».
    // Escape обрабатывает Modal — здесь остаётся только начальный фокус.
    const timer = setTimeout(() => confirmButtonRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [pending]);

  const dialog = pending ? (
    <Modal
      open
      onClose={() => close(false)}
      role="alertdialog"
      labelledBy="confirm-dialog-title"
      className="space-y-4"
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
        <Button variant="secondary" onClick={() => close(false)}>
          {pending.options.cancelLabel || "Отмена"}
        </Button>
        <Button
          ref={confirmButtonRef}
          variant={pending.options.danger ? "danger" : "primary"}
          onClick={() => close(true)}
        >
          {pending.options.confirmLabel || "Подтвердить"}
        </Button>
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
