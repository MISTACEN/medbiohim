"use client";

/**
 * Ячейка элемента в сетке таблицы: кнопка с номером, символом и названием,
 * регистрируется в общей карте ссылок для клавиатурной навигации.
 */
import { type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { elementAriaLabel, type ChemicalElement } from "@/lib/elements";
import { categoryCellStyle } from "./model";

interface PeriodicTableCellProps {
  element: ChemicalElement;
  dimmed: boolean;
  /** Ровно одна ячейка сетки имеет tabIndex = 0 — точка входа по Tab. */
  focusAnchor: boolean;
  cellRefs: RefObject<Map<number, HTMLButtonElement>>;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, element: ChemicalElement) => void;
  onFocusCell: (number: number) => void;
  onSelect: (number: number) => void;
}

export function PeriodicTableCell({
  element,
  dimmed,
  focusAnchor,
  cellRefs,
  onKeyDown,
  onFocusCell,
  onSelect,
}: PeriodicTableCellProps) {
  return (
    <button
      ref={(node) => {
        if (node) cellRefs.current.set(element.number, node);
        else cellRefs.current.delete(element.number);
      }}
      type="button"
      tabIndex={focusAnchor ? 0 : -1}
      aria-label={elementAriaLabel(element)}
      aria-haspopup="dialog"
      onClick={() => onSelect(element.number)}
      onFocus={() => onFocusCell(element.number)}
      onKeyDown={(event) => onKeyDown(event, element)}
      className={
        "flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 py-1 text-center leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1 " +
        (dimmed ? "opacity-30" : "hover:-translate-y-0.5 hover:shadow-sm")
      }
      style={{
        gridRow: element.ypos + 1,
        gridColumn: element.xpos + 1,
        ...categoryCellStyle(element.category),
        color: "var(--text)",
      }}
    >
      <span className="self-end text-[9px] tabular-nums leading-none" style={{ color: "var(--muted)" }}>
        {element.number}
      </span>
      <span className="text-sm font-bold leading-tight sm:text-base">{element.symbol}</span>
      <span className="hidden w-full truncate text-[9px] leading-tight lg:block" style={{ color: "var(--muted)" }}>
        {element.name_ru}
      </span>
    </button>
  );
}
