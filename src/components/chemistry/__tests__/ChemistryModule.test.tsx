import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChemistryModule } from "@/modules/subjects/submodules/chemistry";

/**
 * Химический модуль в панели лекции: разделы должны быть видны сразу, а
 * тяжёлые инструменты — монтироваться только при открытии, иначе панель
 * тянет таблицу элементов и графики лаборатории при каждом открытии.
 */
describe("ChemistryModule", () => {
  it("показывает все разделы, но монтирует только открытый", () => {
    render(<ChemistryModule />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Структуры",
      "Реакции",
      "Растворы",
      "Лаборатория",
      "Практика",
      "Элементы",
    ]);
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    expect(screen.getByPlaceholderText(/glucose, benzene/)).toBeTruthy();
  });

  it("переключает на уравнивание реакций и не теряет структуры", () => {
    render(<ChemistryModule />);

    fireEvent.click(screen.getByRole("tab", { name: "Реакции" }));
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
    expect(screen.getByPlaceholderText(/KMnO4 \+ HCl/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Структуры" }));
    expect(screen.getByPlaceholderText(/glucose, benzene/)).toBeVisible();
  });
});
