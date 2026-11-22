/**
 * Строка второго мнения по тестовому вопросу: три вердикта арбитра, расхождение
 * с разбором и расшифровка буквы варианта.
 *
 * Живой экран с вердиктом «оба неверны» требует вопроса с заведомо ошибочным
 * эталоном, поэтому текст проверяем здесь: арбитр отдаёт букву («A»), а студент
 * должен увидеть сам вариант, который был на экране.
 */
import { describe, expect, it } from "vitest";

import { arbiterLine, correctLabel, statedVerdict } from "@/components/tests/arbiter-line";

const check = (verdict: "key" | "user" | "both", correct = "") => ({
  verdict,
  correct,
  why: "обоснование",
  provider: "groq",
  model: "openai/gpt-oss-120b",
});

describe("arbiterLine", () => {
  it("без арбитра строки нет", () => {
    expect(arbiterLine(null, "**Ключ верен.**")).toBeNull();
  });

  it("ключ верен — расхождения с разбором нет", () => {
    const line = arbiterLine(check("key"), "**Ключ верен.** Воспаление повышает СОЭ.");
    expect(line).toEqual({ text: "Перепроверка: ключ верен", disagree: false });
  });

  it("прав студент — строка прямо говорит об ошибке в ключе", () => {
    const line = arbiterLine(check("user", "A"), "**В ключе ошибка: ваш ответ вернее.**");
    expect(line?.text).toBe("Перепроверка: правы вы, в ключе ошибка");
    expect(line?.disagree).toBe(false);
  });

  it("оба неверны — буква арбитра превращается в вариант вопроса", () => {
    const line = arbiterLine(
      check("both", "A"),
      "**Оба ответа неверны: правильный — повышение СОЭ.**",
      ["Понижение СОЭ", "Повышение числа эритроцитов"],
    );
    // «A» — это первый вариант в опциях, а не буква «А)» из ключа.
    expect(line?.text).toBe("Перепроверка: оба ответа неверны — правильный А) Понижение СОЭ");
    expect(line?.disagree).toBe(false);
  });

  it("арбитр и разбор расходятся — это видно по флагу", () => {
    const line = arbiterLine(check("both", "Б"), "**Ключ верен.** Так написано в методичке.", [
      "Первое",
      "Второе",
    ]);
    expect(line?.disagree).toBe(true);
    expect(line?.text).toContain("правильный Б) Второе");
  });
});

describe("correctLabel", () => {
  it("кириллическая буква тоже расшифровывается", () => {
    expect(correctLabel("В)", ["один", "два", "три"])).toBe("В) три");
  });

  it("готовый текст варианта остаётся как есть", () => {
    expect(correctLabel("Повышение СОЭ", ["Понижение СОЭ"])).toBe("Повышение СОЭ");
  });

  it("без вариантов возвращается то, что пришло", () => {
    expect(correctLabel("A")).toBe("A");
  });
});

describe("statedVerdict", () => {
  it("распознаёт все три вердикта разбора", () => {
    expect(statedVerdict("**Ключ верен.**")).toBe("key");
    expect(statedVerdict("**В ключе ошибка: ваш ответ вернее.**")).toBe("user");
    expect(statedVerdict("Оба ответа неверны: правильный — уменьшается")).toBe("both");
  });

  it("разбор без вердикта не выдумывает его", () => {
    expect(statedVerdict("Начнём с механизма агрегации тромбоцитов.")).toBeNull();
  });
});
