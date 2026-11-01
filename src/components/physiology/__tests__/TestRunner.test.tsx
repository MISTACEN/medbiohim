import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TestRunner from "../TestRunner";

const mixedGroup = {
  title: "Смешанный банк",
  questions: [
    { number: 1, text: "Вопрос с ключом", options: ["Первый", "Второй"], answer: "2" },
    { number: 2, text: "Вопрос без ключа", options: ["Третий", "Четвёртый"], answer: "" },
  ],
};

describe("TestRunner: банк с частичным ключом", () => {
  it("не оценивает вопрос без ключа как неверный", () => {
    render(<TestRunner group={mixedGroup} onExit={() => {}} />);

    fireEvent.click(screen.getByText("Первый"));
    fireEvent.click(screen.getByRole("button", { name: /Проверить/ }));
    expect(screen.getByText(/Неверно\. Правильный ответ: 2\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Далее/ }));
    expect(screen.getByText("Вопрос без ключа")).toBeTruthy();
    fireEvent.click(screen.getByText("Третий"));

    expect(screen.queryByText(/Неверно\./)).toBeNull();
    expect(screen.getByText(/режим разбора без оценки/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Завершить/ })).toBeTruthy();
  });

  it("на финише считает процент только по вопросам с ключом", () => {
    render(<TestRunner group={mixedGroup} onExit={() => {}} />);

    fireEvent.click(screen.getByText("Второй"));
    fireEvent.click(screen.getByRole("button", { name: /Проверить/ }));
    expect(screen.getByText("Верно.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Далее/ }));
    fireEvent.click(screen.getByRole("button", { name: /Завершить/ }));

    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.getByText(/Без оценки: 1 вопросов без ключа/)).toBeTruthy();
  });
});