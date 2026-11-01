import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OpenAnswerPractice } from "../OpenAnswerPractice";
import type { SelfWorkTopic } from "@/lib/histology/selfWorkTypes";

/**
 * Inline-фикстура: тесты не зависят от реального контента T1
 * (src/lib/histology/embryologySelfWork.ts) и от реестра тем.
 *
 * Слова в anyOf подобраны так, чтобы переживать нормализацию
 * openAnswerCheck (сравнение по основе слова и омоглифам).
 */
const topic: SelfWorkTopic = {
  lectureId: "hist-test-open",
  title: "Тестовая тема: открытые ответы",
  openQuestions: [
    {
      id: "oq-1",
      topic: "Осевые органы",
      prompt: "Назовите осевые органы зародыша.",
      keyPoints: [
        { id: "kp-1", label: "Хорда", anyOf: ["хорда"] },
        { id: "kp-2", label: "Нервная трубка", anyOf: ["нервная трубка"] },
      ],
      model: "Осевые органы: хорда и нервная трубка.",
      source: "Тестовый сборник",
    },
    {
      id: "oq-2",
      topic: "Гаструляция",
      prompt: "Что такое гаструляция?",
      keyPoints: [{ id: "kp-1", label: "Гаструляция", anyOf: ["гаструляция"] }],
      model: "Гаструляция — образование зародышевых листков.",
    },
  ],
  exam: {
    title: "—",
    intro: "—",
    variants: [],
    electronograms: [],
    scale: [],
    memo: { title: "—", steps: [], samples: [] },
  },
};

function card(questionId: string) {
  return within(screen.getByTestId(`open-question-${questionId}`));
}

function write(questionId: string, value: string) {
  fireEvent.change(card(questionId).getByLabelText("Письменный ответ"), { target: { value } });
}

function check(questionId: string) {
  fireEvent.click(card(questionId).getByRole("button", { name: "Проверить" }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("OpenAnswerPractice: задание 5 (только открытые вопросы)", () => {
  it("рендерит формулировку, textarea с label и панель прогресса", () => {
    render(<OpenAnswerPractice topic={topic} />);

    expect(screen.getByText("Назовите осевые органы зародыша.")).toBeTruthy();
    expect(screen.getByText("Что такое гаструляция?")).toBeTruthy();
    expect(screen.getAllByLabelText("Письменный ответ")).toHaveLength(2);
    expect(screen.getByText("Решено 0 из 2")).toBeTruthy();
    // Задание 5 — только открытые вопросы: вариантов ответа нет.
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    // Группировка по подтемам.
    expect(screen.getByText("Осевые органы")).toBeTruthy();
    expect(screen.getByText("Гаструляция")).toBeTruthy();
  });

  it("кнопка «Проверить» заблокирована без ответа", () => {
    render(<OpenAnswerPractice topic={topic} />);
    const button = card("oq-1").getByRole("button", { name: "Проверить" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    write("oq-1", "хорда");
    expect((card("oq-1").getByRole("button", { name: "Проверить" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("верный ответ: 100%, все пункты эталона, образцовый ответ и вопрос зачтён", () => {
    render(<OpenAnswerPractice topic={topic} />);
    write("oq-1", "хорда и нервная трубка");
    check("oq-1");

    expect(card("oq-1").getByText("100%")).toBeTruthy();
    expect(screen.getByText(/Верно — все пункты эталона/)).toBeTruthy();
    expect(screen.getByText("Осевые органы: хорда и нервная трубка.")).toBeTruthy();
    expect(screen.getByText("Решено 1 из 2")).toBeTruthy();
    // Вопрос без ошибок попал в «решённые» и не требует повтора.
    expect(screen.getByText("решено")).toBeTruthy();
  });

  it("неверный ответ: процент, разбор ошибок с эталоном и текст потерянных пунктов", () => {
    render(<OpenAnswerPractice topic={topic} />);
    write("oq-1", "эктодерма");
    check("oq-1");

    expect(card("oq-1").getByText("0%")).toBeTruthy();
    expect(screen.getByText(/Пока неверно — разбери пропущенные пункты/)).toBeTruthy();
    expect(screen.getByText("Разбор ошибок")).toBeTruthy();
    expect(screen.getByText("Хорда — не найдено в ответе (эталон: хорда).")).toBeTruthy();
    expect(screen.getByText("Нервная трубка — не найдено в ответе (эталон: нервная трубка).")).toBeTruthy();
    expect(screen.getByText("Решено 0 из 2")).toBeTruthy();
  });

  it("частичный ответ не считается решённым (result.complete)", () => {
    render(<OpenAnswerPractice topic={topic} />);
    write("oq-1", "хорда");
    check("oq-1");

    expect(card("oq-1").getByText("50%")).toBeTruthy();
    expect(card("oq-1").getByText(/часть пунктов потеряна|Пока неверно/)).toBeTruthy();
    expect(screen.getByText("Решено 0 из 2")).toBeTruthy();
    expect(screen.getByText(/Повторить ошибочные \(1\)/)).toBeTruthy();
  });

  it("«Повторить ошибочные» фильтрует список, «Все вопросы» возвращает его", () => {
    render(<OpenAnswerPractice topic={topic} />);
    write("oq-1", "эктодерма");
    check("oq-1");

    fireEvent.click(screen.getByRole("button", { name: /Повторить ошибочные \(1\)/ }));
    expect(screen.getByTestId("open-question-oq-1")).toBeTruthy();
    expect(screen.queryByTestId("open-question-oq-2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Все вопросы" }));
    expect(screen.getByTestId("open-question-oq-1")).toBeTruthy();
    expect(screen.getByTestId("open-question-oq-2")).toBeTruthy();
  });

  it("«Повторить» сбрасывает ответ и результат вопроса", () => {
    render(<OpenAnswerPractice topic={topic} />);
    write("oq-1", "эктодерма");
    check("oq-1");
    expect(screen.getByText("Разбор ошибок")).toBeTruthy();

    fireEvent.click(card("oq-1").getByRole("button", { name: "Повторить" }));

    const field = card("oq-1").getByLabelText("Письменный ответ") as HTMLTextAreaElement;
    expect(field.value).toBe("");
    expect(field.disabled).toBe(false);
    expect(screen.queryByText("Разбор ошибок")).toBeNull();
    expect((screen.getByRole("button", { name: /Повторить ошибочные/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("после проверки textarea и «Проверить» заблокированы, есть «Следующий вопрос»", () => {
    render(<OpenAnswerPractice topic={topic} />);
    write("oq-1", "хорда и нервная трубка");
    check("oq-1");

    expect((card("oq-1").getByLabelText("Письменный ответ") as HTMLTextAreaElement).disabled).toBe(true);
    expect((card("oq-1").getByRole("button", { name: "Проверить" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(card("oq-1").getByRole("button", { name: "Следующий вопрос" }));
    expect(document.activeElement).toBe(card("oq-2").getByLabelText("Письменный ответ"));
  });

  it("без контента (нет темы для лекции) рендерится заглушка, а не падение", () => {
    render(<OpenAnswerPractice lectureId="нет-такой-лекции" />);
    expect(screen.getByText(/Открытые вопросы для этой лекции ещё не заполнены/)).toBeTruthy();
  });
});
