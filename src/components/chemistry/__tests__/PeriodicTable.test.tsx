import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { PeriodicTable } from "@/components/chemistry/PeriodicTable";

/**
 * Дымовые UI-тесты интерактивной таблицы: ячейки строятся из данных,
 * поиск и фильтр работают, карточка открывается/закрывается, клавиатурная
 * навигация по сетке включается ровно одной точкой Tab.
 */
test("таблица рендерит 118 кнопок-элементов, ищет и открывает карточку", () => {
  render(<PeriodicTable />);

  const cells = screen.getAllByRole("button", { name: /атомный номер/ });
  expect(cells).toHaveLength(118);
  expect(screen.getByRole("button", { name: /Железо, Fe, атомный номер 26/ })).toBeTruthy();

  const search = screen.getByLabelText(/Поиск элемента/);
  fireEvent.change(search, { target: { value: "железо" } });
  expect(screen.getByText(/Найдено 1 из 118/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /Железо, Fe, атомный номер 26/ }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeTruthy();
  expect(within(dialog).getByText("Железо")).toBeTruthy();
  expect(within(dialog).getByText("55,8452 а.е.м.")).toBeTruthy();

  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("клавиатура: одна точка Tab, стрелки перемещают фокус, фильтр по категории работает", () => {
  render(<PeriodicTable />);

  const cellButtons = screen.getAllByRole("button", { name: /атомный номер/ });
  expect(cellButtons.filter((button) => button.getAttribute("tabindex") === "0")).toHaveLength(1);

  const hydrogen = screen.getByRole("button", { name: /Водород, H, атомный номер 1/ });
  hydrogen.focus();
  fireEvent.keyDown(hydrogen, { key: "ArrowRight" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /Гелий, He, атомный номер 2/ }));

  fireEvent.click(screen.getByRole("button", { name: /Переходные металлы/ }));
  expect(screen.getByText(/Найдено 35 из 118/)).toBeTruthy();
});

test("лантаноиды и актиноиды вынесены отдельными рядами сетки", () => {
  render(<PeriodicTable />);

  const lanthanum = screen.getByRole("button", { name: /Лантан, La, атомный номер 57/ });
  expect(lanthanum.style.gridRow).toBe("10"); // период 6 → ряд 10 (ниже спейсера)
  expect(lanthanum.style.gridColumn).toBe("4");

  const uranium = screen.getByRole("button", { name: /Уран, U, атомный номер 92/ });
  expect(uranium.style.gridRow).toBe("11");
  expect(uranium.style.gridColumn).toBe("7"); // Ac…U: четвёртый актиноид, xpos 6

  expect(screen.getByText("57–71")).toBeTruthy();
  expect(screen.getByText("89–103")).toBeTruthy();
});
