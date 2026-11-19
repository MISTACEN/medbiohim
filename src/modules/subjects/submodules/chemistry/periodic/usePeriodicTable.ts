"use client";

/**
 * Состояние периодической таблицы: поиск, фильтр по категории, выбор элемента,
 * клавиатурная навигация по сетке и перехват фокуса в карточке элемента.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  categoriesWithCounts,
  chemicalElements,
  filterElements,
  type ChemicalElement,
} from "@/lib/elements";
import { KEYBOARD_DELTAS } from "./model";

export function usePeriodicTable() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [focusNumber, setFocusNumber] = useState<number>(chemicalElements[0]?.number ?? 1);

  const cellRefs = useRef(new Map<number, HTMLButtonElement>());
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => filterElements({ query, category }), [query, category]);
  const visibleNumbers = useMemo(() => new Set(visible.map((element) => element.number)), [visible]);
  const categories = useMemo(() => categoriesWithCounts(), []);
  const isFiltering = query.trim().length > 0 || category !== null;

  const gridIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const element of chemicalElements) map.set(`${element.xpos}:${element.ypos}`, element.number);
    return map;
  }, []);

  const selected: ChemicalElement | null =
    selectedNumber === null ? null : chemicalElements.find((element) => element.number === selectedNumber) ?? null;

  const focusCell = (number: number) => {
    setFocusNumber(number);
    cellRefs.current.get(number)?.focus();
  };

  const moveFocus = (from: ChemicalElement, dx: number, dy: number) => {
    let x = from.xpos;
    let y = from.ypos;
    // Идём по сетке до ближайшей занятой ячейки (между блоками есть пустоты).
    for (let step = 0; step < 24; step += 1) {
      x += dx;
      y += dy;
      if (x < 1 || x > 18 || y < 1 || y > 10) return;
      const next = gridIndex.get(`${x}:${y}`);
      if (next !== undefined) {
        focusCell(next);
        return;
      }
    }
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, element: ChemicalElement) => {
    if (event.key === "Home") {
      event.preventDefault();
      focusCell(chemicalElements[0].number);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusCell(chemicalElements[chemicalElements.length - 1].number);
      return;
    }
    const delta = KEYBOARD_DELTAS[event.key];
    if (!delta) return;
    event.preventDefault();
    moveFocus(element, delta[0], delta[1]);
  };

  useEffect(() => {
    if (selectedNumber === null) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedNumber(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [selectedNumber]);

  const resetFilters = () => {
    setQuery("");
    setCategory(null);
  };

  return {
    query,
    setQuery,
    category,
    setCategory,
    selectedNumber,
    setSelectedNumber,
    focusNumber,
    setFocusNumber,
    cellRefs,
    dialogRef,
    visible,
    visibleNumbers,
    categories,
    isFiltering,
    selected,
    handleGridKeyDown,
    resetFilters,
  };
}

export type PeriodicTableController = ReturnType<typeof usePeriodicTable>;
