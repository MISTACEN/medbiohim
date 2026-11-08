import { describe, expect, it } from "vitest";
import { displayOptionEntries } from "../optionOrder";

const labels = ["Альфа", "Бета", "Гамма", "Дельта", "Эпсилон"];

describe("displayOptionEntries", () => {
  it("сохраняет все варианты с каноническими ключами исходного порядка", () => {
    const entries = displayOptionEntries({ id: "q1" }, labels);
    expect([...entries.map((e) => e.key)].sort()).toEqual(["A", "B", "C", "D", "E"]);
    expect(new Set(entries.map((e) => e.option))).toEqual(new Set(labels));
    expect(entries.map((e) => e.index).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("детерминирован: один и тот же вопрос даёт один порядок", () => {
    const a = displayOptionEntries({ id: "q-abc" }, labels);
    const b = displayOptionEntries({ id: "q-abc" }, labels);
    expect(a.map((e) => e.index)).toEqual(b.map((e) => e.index));
  });

  it("разные вопросы — разные порядки", () => {
    const orders = new Set(
      Array.from({ length: 12 }, (_, i) => displayOptionEntries({ id: `q-${i}` }, labels).map((e) => e.index).join("")),
    );
    // Перемешивание 5 элементов даёт 120 порядков; 12 вопросов должны дать хотя бы 4 разных.
    expect(orders.size).toBeGreaterThanOrEqual(4);
  });

  it("не перемешивает при requires_order", () => {
    const entries = displayOptionEntries({ id: "q1", requires_order: true }, labels);
    expect(entries.map((e) => e.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("одиночный вариант не перемешивается", () => {
    const entries = displayOptionEntries({ id: "q1" }, ["единственный"]);
    expect(entries.map((e) => e.index)).toEqual([0]);
  });

  it("уважает переданный keyOf", () => {
    const entries = displayOptionEntries({ id: "q1" }, [{ key: "К", label: "x" }], (o) => String(o.key));
    expect(entries[0].key).toBe("К");
  });

  it("пустой список и вопрос без id безопасны", () => {
    expect(displayOptionEntries(null, labels).map((e) => e.index)).toEqual([0, 1, 2, 3, 4]);
    expect(displayOptionEntries({ id: "q1" }, [])).toEqual([]);
  });
});
