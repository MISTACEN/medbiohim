/**
 * Плашка статуса общего слоя (этап D).
 *
 * Плашки рисовались инлайном 103 раза и разошлись на два десятка вариантов:
 * `bg-[var(--status-warn-bg)] px-2 py-0.5 text-[var(--status-warn-fg)]`,
 * `bg-[var(--status-warn-bg)] px-2 py-0.5 font-semibold ...`,
 * `bg-indigo-50 ... text-indigo-700`, `bg-slate-100 ...` и так далее.
 * Тон берётся из готовых `.badge-*` в globals.css: у них уже есть семантика
 * (ok / critical / warn / primary / neutral / pending), подписи и, что важно,
 * совместимость с темами оформления.
 *
 * Плашка не задаёт размеров текста сверх тона и не знает про предмет —
 * доменное остаётся на экране.
 */
import type { ReactNode } from "react";

export type BadgeTone = "success" | "danger" | "warning" | "primary" | "neutral" | "pending";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "badge-success",
  danger: "badge-danger",
  warning: "badge-warning",
  primary: "badge-primary",
  neutral: "badge-neutral",
  pending: "badge-pending",
};

/** Допустимые тона: нужны реестру и проверкам на месте. */
export const BADGE_TONES = Object.keys(TONE_CLASSES) as BadgeTone[];

export function badgeClasses(tone: BadgeTone = "neutral", className = "") {
  return [TONE_CLASSES[tone], className].filter(Boolean).join(" ");
}

export function Badge({
  tone = "neutral",
  children,
  className = "",
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={badgeClasses(tone, className)} title={title}>
      {children}
    </span>
  );
}
