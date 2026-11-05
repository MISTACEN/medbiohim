"use client";

/**
 * Вкладки (этап D).
 *
 * Один `role="tablist"` был скопирован трижды с разным видом и без клавиатуры:
 * закладки (крупные пилюли `rounded-xl px-4 py-2`), химическая лаборатория
 * (`rounded-lg border px-3 py-2`) и разделы предмета (своя `<nav>` с прокруткой).
 * Здесь два первых вида — варианты одного компонента; разметка и `aria-*`
 * те же, что были, поэтому переключение не меняет картинку.
 *
 * Третья копия (`subjects/[id]`) пока осталась: там `<nav>` с мобильной
 * прокруткой и ссылками, а не кнопками, — это навигация, а не вкладки.
 *
 * Добавлено поверх прежней разметки: `id`, `tabIndex` (в табуляции одна
 * активная вкладка) и стрелки/Home/End. Без этого группа была недоступна
 * с клавиатуры, хотя `role="tab"` уже стоял.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type TabVariant = "pill" | "outline";

export type TabItem<TId extends string = string> = {
  id: TId;
  label: ReactNode;
  icon?: LucideIcon;
  /** Счётчик справа от подписи: `Заметки (3)`. Ноль не рисуется. */
  count?: number;
};

type Props<TId extends string> = {
  items: ReadonlyArray<TabItem<TId>>;
  value: TId;
  onChange: (id: TId) => void;
  /** Доступное имя группы: раньше задавалось через aria-label вручную. */
  label: string;
  variant?: TabVariant;
  className?: string;
  idPrefix?: string;
};

const WRAPPER_CLASSES: Record<TabVariant, string> = {
  pill: "flex gap-2",
  outline: "flex flex-wrap gap-2 print:hidden",
};

const ITEM_CLASSES: Record<TabVariant, { base: string; active: string; idle: string }> = {
  pill: {
    base: "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold",
    active: "bg-indigo-600 text-white",
    idle: "border text-slate-600",
  },
  outline: {
    base: "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
    active: "border-indigo-600 bg-indigo-600 font-semibold text-white",
    idle: "border-[var(--border)] hover:border-indigo-300",
  },
};

export function Tabs<TId extends string>({
  items,
  value,
  onChange,
  label,
  variant = "pill",
  className = "",
  idPrefix = "tab",
}: Props<TId>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const styles = ITEM_CLASSES[variant];

  /** Стрелки переключают вкладку и переносят фокус — так группа работает без мыши. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const ids = items.map((item) => item.id);
    const current = ids.indexOf(value);
    if (current === -1) return;

    let next: number | null = null;
    if (event.key === "ArrowRight") next = (current + 1) % ids.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    if (next === null) return;

    event.preventDefault();
    onChange(ids[next]);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons?.[next]?.focus();
  }

  return (
    <div ref={listRef} className={[WRAPPER_CLASSES[variant], className].filter(Boolean).join(" ")} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map(({ id, label: tabLabel, icon: Icon, count }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={idPrefix + "-" + id}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            className={[styles.base, active ? styles.active : styles.idle].join(" ")}
            style={variant === "pill" && !active ? { borderColor: "var(--border)" } : undefined}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {tabLabel}
            {count ? " (" + String(count) + ")" : ""}
          </button>
        );
      })}
    </div>
  );
}
