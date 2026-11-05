import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { Tabs } from "../Tabs";

describe("Button", () => {
  it("собирает класс варианта и размера", () => {
    render(<Button variant="secondary" size="sm">Отмена</Button>);
    const button = screen.getByRole("button", { name: "Отмена" });
    expect(button.className).toContain("btn-secondary");
    expect(button.className).toContain("text-xs");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("во время загрузки блокируется и показывает спиннер", () => {
    render(<Button loading>Сохранить</Button>);
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});

describe("Badge", () => {
  it("берёт готовый тон из общего слоя", () => {
    render(<Badge tone="pending">На проверке</Badge>);
    expect(screen.getByText("На проверке").className).toContain("badge-pending");
  });
});

describe("Modal", () => {
  it("закрывается по Escape и по клику на фон", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open onClose={onClose}>
        <p>Текст</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("не закрывается от клика внутри окна", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="title">
        <h2 id="title">Заголовок</h2>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").getAttribute("aria-labelledby")).toBe("title");
  });

  it("не слушает Escape, когда закрытие отключено", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} closeOnEscape={false}>
        <p>Текст</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Tabs", () => {
  const items = [
    { id: "a", label: "Альфа" },
    { id: "b", label: "Бета" },
    { id: "c", label: "Гамма" },
  ] as const;

  it("помечает активную вкладку и убирает её из остальных tabIndex", () => {
    render(<Tabs items={items} value="a" onChange={() => {}} label="Разделы" />);
    expect(screen.getByRole("tab", { name: "Альфа" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Альфа" }).getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tab", { name: "Бета" }).getAttribute("tabindex")).toBe("-1");
  });

  it("переключает вкладку стрелками и переносит фокус", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="a" onChange={onChange} label="Разделы" />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Бета" }));
  });

  it("End выбирает последнюю вкладку", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="a" onChange={onChange} label="Разделы" />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
