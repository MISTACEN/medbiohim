import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AnswerOption } from "../AnswerOption";

describe("AnswerOption", () => {
  it("рендерит метку и текст варианта", () => {
    render(
      <AnswerOption badge={2} state="idle">
        Лейкоцит
      </AnswerOption>,
    );
    expect(screen.getByRole("button", { name: /Лейкоцит/ })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("вызывает onSelect по нажатию", () => {
    const onSelect = vi.fn();
    render(
      <AnswerOption badge={1} onSelect={onSelect}>
        Эритроцит
      </AnswerOption>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("помечает выбранное состояние", () => {
    render(
      <AnswerOption badge="А" state="selected">
        Эритроцит
      </AnswerOption>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.className).toContain("border-indigo-400");
  });

  it("различает верный и ошибочный варианты", () => {
    const { rerender } = render(
      <AnswerOption badge="А" state="correct">
        Верный
      </AnswerOption>,
    );
    expect(screen.getByRole("button").className).toContain("status-ok");
    rerender(
      <AnswerOption badge="Б" state="wrong">
        Неверный
      </AnswerOption>,
    );
    expect(screen.getByRole("button").className).toContain("status-critical");
  });

  it("не вызывает onSelect, когда вариант заблокирован", () => {
    const onSelect = vi.fn();
    render(
      <AnswerOption badge={1} disabled onSelect={onSelect}>
        Эритроцит
      </AnswerOption>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("форма row не интерактивна и не является кнопкой", () => {
    render(
      <AnswerOption variant="row" badge="Б" badgeVariant="square" state="correct">
        Лейкоцит
      </AnswerOption>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    const row = screen.getByText("Лейкоцит").closest("div");
    expect(row?.className).toContain("status-ok");
    expect(row?.className).toContain("px-3");
  });

  it("форма choice рендерит label и принимает input", () => {
    const onChange = vi.fn();
    render(
      <AnswerOption
        as="label"
        variant="choice"
        badge="1"
        badgeVariant="square"
        state="selected"
        leading={<input type="radio" aria-label="выбрать" checked readOnly onChange={onChange} />}
        trailing={<span>эталон</span>}
      >
        Вариант
      </AnswerOption>,
    );
    const radio = screen.getByRole("radio", { name: "выбрать" });
    expect(radio).toBeTruthy();
    expect(screen.getByText("эталон")).toBeTruthy();
    expect(screen.getByText("Вариант").closest("label")).toBeTruthy();
  });
});
