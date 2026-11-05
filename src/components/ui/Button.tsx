"use client";

/**
 * Кнопка общего слоя (этап D).
 *
 * До этого этапа классы `.btn-primary` / `.btn-secondary` писались строками в
 * 195 местах, а где строки не хватало — рядом появлялась своя копия кнопки
 * (`inline-flex items-center gap-2 rounded-xl border bg-[var(--card)] px-3
 * py-2 text-sm ...`). Компонент ничего не перерисовывает: он собирает те же
 * классы из globals.css, поэтому замена строки на `<Button>` не меняет вид.
 *
 * Вид задаётся дизайн-системой, а не пропсами:
 *  - `variant` выбирает готовый класс `.btn-*`;
 *  - `size` только добавляет `text-xs` для компактных мест (как это делали
 *    вручную через `className="btn-secondary text-xs"`);
 *  - `className` дописывается в конец и по-прежнему может переопределять
 *    отступы/ширину — это нужно существующим экранам.
 */
import Link from "next/link";
import { forwardRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "pill" | "danger";
export type ButtonSize = "md" | "sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  pill: "btn-pill",
  danger: "btn-danger",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "",
  sm: "text-xs",
};

/** Иконка внутри кнопки требует строчной раскладки; без иконки разметка не меняется. */
const ICON_LAYOUT = "inline-flex items-center gap-2";

export type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Есть ли внутри иконка/спиннер: от этого зависит display. */
  withIcon?: boolean;
};

/** Собирает классы кнопки. Нужен ссылкам, у которых своя обёртка (`ButtonLink`). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
  withIcon = false,
}: ButtonStyleOptions = {}) {
  return [VARIANT_CLASSES[variant], SIZE_CLASSES[size], withIcon ? ICON_LAYOUT : "", className]
    .filter(Boolean)
    .join(" ");
}

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Иконка слева. */
  icon?: LucideIcon;
  /** Иконка справа. */
  iconRight?: LucideIcon;
  /** Показать спиннер и заблокировать кнопку. */
  loading?: boolean;
  children?: ReactNode;
};

export type ButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    className?: string;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}, ref) {
  const withIcon = Boolean(Icon || IconRight || loading);
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className, withIcon })}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
      {IconRight ? <IconRight className="h-4 w-4" aria-hidden="true" /> : null}
    </button>
  );
});

export type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className" | "children"> &
  ButtonBaseProps & {
    className?: string;
  };

/** Ссылка, оформленная как кнопка: навигация остаётся навигацией (Link, не button). */
export function ButtonLink({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  className = "",
  children,
  ...rest
}: ButtonLinkProps) {
  const withIcon = Boolean(Icon || IconRight);
  return (
    <Link {...rest} className={buttonClasses({ variant, size, className, withIcon })}>
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
      {IconRight ? <IconRight className="h-4 w-4" aria-hidden="true" /> : null}
    </Link>
  );
}
