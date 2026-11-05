"use client";

/**
 * Модальное окно общего слоя (этап D).
 *
 * Разметка «затемнение + карточка по центру» была скопирована в 9 местах
 * (`fixed inset-0 z-[…] grid place-items-center bg-black/40 p-4` + `card`),
 * причём Escape и клик по фону работали по-разному: где-то только кнопкой.
 * Здесь они собраны в одном месте.
 *
 * Компонент — оболочка, а не диалог: заголовок, тело и кнопки передаёт
 * вызывающий, поэтому `useConfirm` может рисовать свой `alertdialog`
 * с иконкой предупреждения, а редактор — обычную форму.
 */
import { useEffect, type ReactNode } from "react";

export type ModalRole = "dialog" | "alertdialog";
export type ModalLevel = 50 | 60 | 70;
export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const LEVEL_CLASSES: Record<ModalLevel, string> = {
  50: "z-50",
  60: "z-[60]",
  70: "z-[70]",
};

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
};

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  role?: ModalRole;
  /** id заголовка внутри окна: связывает `aria-labelledby` с реальным `<h2>`. */
  labelledBy?: string;
  describedBy?: string;
  /** Ещё одно имя, если заголовок не отдельным узлом. */
  label?: string;
  size?: ModalSize;
  level?: ModalLevel;
  /** Клик по затемнению закрывает так же, как Escape. */
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
};

export function Modal({
  open,
  onClose,
  children,
  role = "dialog",
  labelledBy,
  describedBy,
  label,
  size = "md",
  level = 60,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = "",
}: Props) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
      className={"fixed inset-0 grid place-items-center bg-black/40 p-4 " + LEVEL_CLASSES[level]}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={labelledBy ? undefined : label}
        className={["card w-full", SIZE_CLASSES[size], className].filter(Boolean).join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
