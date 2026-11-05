"use client";

/**
 * Один вариант ответа (этап C) — единый рендер вместо копий в экранах.
 *
 * Три формы, один набор состояний:
 *  - `button` — интерактивный вариант (тест, тренажёр, мини-тест лекции);
 *  - `choice` — строка с radio/checkbox внутри `<label>` (прохождение теста);
 *  - `row` — только чтение (банк вопросов, билеты, разбор).
 *
 * Компонент презентационный: не знает про предмет, проверку и типы вопросов.
 * Сущность (иконки, rich-text, input, плашки) передаётся через `leading`,
 * `badge`, `children`, `trailing`, поэтому химия и разметка остаются в модулях.
 */
import type { ReactNode } from "react";

export type AnswerOptionState = "idle" | "selected" | "correct" | "wrong";
export type AnswerOptionVariant = "button" | "choice" | "row";

const STATE_CLASSES: Record<AnswerOptionState, string> = {
  idle: "border-slate-200 bg-white text-slate-700",
  selected: "border-indigo-400 bg-indigo-50 text-indigo-900",
  correct: "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
  wrong: "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
};

const BASE_CLASSES: Record<AnswerOptionVariant, string> = {
  button: "flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition",
  choice: "flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left",
  row: "flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-sm",
};

export type AnswerOptionProps = {
  /** Содержимое варианта: текст или rich-text. */
  children: ReactNode;
  /** Метка слева (номер/буква). */
  badge?: ReactNode;
  badgeVariant?: "circle" | "square";
  /** Иконка или input перед меткой. */
  leading?: ReactNode;
  /** Плашка справа (например, «эталон»). */
  trailing?: ReactNode;
  state?: AnswerOptionState;
  disabled?: boolean;
  onSelect?: () => void;
  variant?: AnswerOptionVariant;
  /** Выравнивание содержимого строки. */
  align?: "start" | "center";
  className?: string;
  /** Явный тег: кнопка, label (для input) или div (только чтение). */
  as?: "button" | "label" | "div";
};

function badgeNode(badge: ReactNode, variant: "circle" | "square", state: AnswerOptionState) {
  if (badge === undefined || badge === null) return null;
  if (variant === "square") {
    const tone =
      state === "correct"
        ? "bg-[var(--status-ok-fg)] text-white"
        : state === "selected"
          ? "bg-indigo-600 text-white"
          : "bg-slate-100 text-slate-600";
    return (
      <span className={"inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-xs font-extrabold " + tone}>
        {badge}
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
      {badge}
    </span>
  );
}

export function AnswerOption({
  children,
  badge,
  badgeVariant = "circle",
  leading,
  trailing,
  state = "idle",
  disabled = false,
  onSelect,
  variant = "button",
  align = "start",
  className = "",
  as,
}: AnswerOptionProps) {
  const tag = as ?? (variant === "row" ? "div" : variant === "choice" ? "label" : "button");
  const classes = [
    BASE_CLASSES[variant],
    align === "center" ? "items-center" : "",
    STATE_CLASSES[state],
    disabled ? "cursor-default opacity-90" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {leading}
      {badgeNode(badge, badgeVariant, state)}
      {children}
      {trailing}
    </>
  );

  if (tag === "label") {
    return (
      <label className={classes} aria-disabled={disabled || undefined}>
        {content}
      </label>
    );
  }

  if (tag === "div") {
    return <div className={classes}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={state === "selected"}
      className={classes}
    >
      {content}
    </button>
  );
}
