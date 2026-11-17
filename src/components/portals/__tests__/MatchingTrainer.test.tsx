import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Фикстура повторяет форму `PortalMatchingBank`: набор без вопросов КР
 * (старые таблицы из biotestkr) и набор с `quiz` (членистоногие).
 * Сеть не участвует — загрузчик банка замокан.
 */
vi.mock("@/lib/portalContent", () => ({
  loadParasitologyBank: async () => ({
    subject: "Биология → Паразитология",
    tests: [
      {
        id: "parasitology-test1",
        title: "Старый набор",
        columns: [
          { key: "species", label: "Вид (возбудитель)" },
          { key: "diagnostics", label: "Диагностика" },
        ],
        rows: [{ species: "Trypanosoma cruzi", diagnostics: "Мазок крови" }],
      },
      {
        id: "parasitology-arthropods",
        title: "Членистоногие · 30 видов",
        columns: [
          { key: "species", label: "Вид (возбудитель)" },
          { key: "route", label: "Путь заражения" },
        ],
        rows: [{ species: "Ixodes persulcatus", route: "Укус клеща" }],
        quiz: [
          {
            species: "Ixodes persulcatus",
            text: "Какие болезни переносит таёжный клещ?",
            options: ["Чума и туляремия", "Клещевой энцефалит и болезнь Лайма"],
            correct: "Клещевой энцефалит и болезнь Лайма",
          },
          {
            species: "Ixodes persulcatus",
            text: "Какая стадия инвазионна для человека?",
            options: ["Яйцо", "Имаго"],
            correct: "Имаго",
          },
        ],
      },
    ],
  }),
}));

import MatchingTrainer from "../MatchingTrainer";

async function openArthropods() {
  fireEvent.click(await screen.findByRole("button", { name: "Членистоногие · 30 видов" }));
}

describe("MatchingTrainer: режим «Контрольная»", () => {
  it("у набора без вопросов КР кнопки контрольной нет", async () => {
    render(<MatchingTrainer />);
    await screen.findByRole("button", { name: "Старый набор" });

    expect(screen.queryByRole("button", { name: /Контрольная/ })).toBeNull();
  });

  it("кнопка контрольной показывает число вопросов набора", async () => {
    render(<MatchingTrainer />);
    await screen.findByRole("button", { name: "Старый набор" });
    await openArthropods();

    expect(screen.getByRole("button", { name: "Контрольная · 2" })).toBeTruthy();
  });

  it("вопросы рендерятся группой radio с legend и счётчиком", async () => {
    render(<MatchingTrainer />);
    await screen.findByRole("button", { name: "Старый набор" });
    await openArthropods();
    fireEvent.click(screen.getByRole("button", { name: "Контрольная · 2" }));

    expect(screen.getByText("Какие болезни переносит таёжный клещ?")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByText("Отвечено 0 из 2")).toBeTruthy();
  });

  it("верный ответ даёт «Верно» и увеличивает счётчик", async () => {
    render(<MatchingTrainer />);
    await screen.findByRole("button", { name: "Старый набор" });
    await openArthropods();
    fireEvent.click(screen.getByRole("button", { name: "Контрольная · 2" }));

    const correct = screen.getByLabelText(/Клещевой энцефалит и болезнь Лайма/) as HTMLInputElement;
    fireEvent.click(correct);

    expect(correct.checked).toBe(true);
    expect(screen.getByText("Верно")).toBeTruthy();
    expect(screen.getByText("Отвечено 1 из 2 · верно 1")).toBeTruthy();
  });

  it("неверный ответ показывает эталон и не засчитывается", async () => {
    render(<MatchingTrainer />);
    await screen.findByRole("button", { name: "Старый набор" });
    await openArthropods();
    fireEvent.click(screen.getByRole("button", { name: "Контрольная · 2" }));

    fireEvent.click(screen.getByLabelText(/Чума и туляремия/));

    expect(screen.getByText("Ошибка. Правильный ответ: Клещевой энцефалит и болезнь Лайма")).toBeTruthy();
    expect(screen.getByText("Отвечено 1 из 2 · верно 0")).toBeTruthy();
  });
});
