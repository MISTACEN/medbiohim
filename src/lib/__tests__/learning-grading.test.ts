import { describe, expect, it } from "vitest";

import {
  containsStem,
  gradeActivity,
  normalizeAnswerText,
  normalizeFormulaText,
} from "@/lib/learning/grading";

describe("normalizeAnswerText", () => {
  it("приводит регистр, ё и пунктуацию к одной форме", () => {
    expect(normalizeAnswerText("  Ёмкость, МЕМБРАНЫ! ")).toBe("емкость мембраны");
  });

  it("не теряет цифры и латиницу", () => {
    expect(normalizeAnswerText("pH = 7,4")).toBe("ph 7 4");
  });
});

describe("normalizeFormulaText", () => {
  it("понимает подстрочные индексы", () => {
    expect(normalizeFormulaText("H₂SO₄")).toBe("h2so4");
    expect(normalizeFormulaText("h2so4")).toBe("h2so4");
  });

  it("нормализует заряды", () => {
    expect(normalizeFormulaText("Ca²⁺")).toBe("ca2+");
  });
});

describe("containsStem", () => {
  it("находит основу внутри словоформы", () => {
    expect(containsStem("конкурентного ингибирования", "конкурент")).toBe(true);
  });

  it("учитывает границу слова слева", () => {
    // «неконкурентный» не должен засчитываться как «конкурентный».
    expect(containsStem("неконкурентный", "конкурент")).toBe(false);
    expect(containsStem("барьер", "бар")).toBe(true);
    expect(containsStem("кот", "пёс")).toBe(false);
  });
});

describe("gradeActivity: точные ответы", () => {
  it("один вариант: верно и неверно", () => {
    expect(gradeActivity({ type: "single_choice", selected: 1, correct: 1 }).percent).toBe(100);
    const wrong = gradeActivity({ type: "single_choice", selected: 0, correct: 1 });
    expect(wrong.percent).toBe(0);
    expect(wrong.passed).toBe(false);
    expect(wrong.feedback).toContain("другой вариант");
  });

  it("пустой выбор не считается верным", () => {
    expect(gradeActivity({ type: "single_choice", selected: null, correct: 0 }).percent).toBe(0);
  });

  it("несколько вариантов: частичный зачёт и штраф за лишние", () => {
    const half = gradeActivity({ type: "multiple_choice", selected: [0], correct: [0, 2] });
    expect(half.percent).toBe(50);
    expect(half.passed).toBe(false);

    const full = gradeActivity({ type: "multiple_choice", selected: [2, 0], correct: [0, 2] });
    expect(full.percent).toBe(100);

    const extra = gradeActivity({ type: "multiple_choice", selected: [0, 2, 1], correct: [0, 2] });
    expect(extra.percent).toBe(50);
    expect(extra.missed.some((item) => item.includes("лишний"))).toBe(true);
  });

  it("численный ответ учитывает абсолютный и относительный допуск", () => {
    expect(
      gradeActivity({ type: "numeric", value: 7.35, correct: 7.4, tolerance: 0.1 }).percent,
    ).toBe(100);
    expect(
      gradeActivity({ type: "numeric", value: 7.45, correct: 7.4, tolerancePercent: 1 }).percent,
    ).toBe(100);
    expect(
      gradeActivity({ type: "numeric", value: 7.9, correct: 7.4, tolerance: 0.1 }).percent,
    ).toBe(0);
  });

  it("пустой численный ответ не проходит", () => {
    expect(gradeActivity({ type: "numeric", value: null, correct: 5 }).passed).toBe(false);
  });

  it("короткий ответ сравнивается без учёта регистра и ё", () => {
    expect(
      gradeActivity({ type: "short_text", value: "Гиперполяризация", accepted: ["гиперполяризация"] })
        .correct,
    ).toBe(true);
    expect(
      gradeActivity({ type: "short_text", value: "гипер поляризация", accepted: ["гиперполяризация"] })
        .correct,
    ).toBe(false);
  });

  it("формула сравнивается с нормализацией индексов", () => {
    expect(
      gradeActivity({ type: "formula", value: "H₂SO₄", accepted: ["h2so4"] }).correct,
    ).toBe(true);
  });

  it("последовательность даёт частичный зачёт по общим элементам", () => {
    const result = gradeActivity({
      type: "ordering",
      value: ["эпс", "гольджи", "везикула", "экзоцитоз"],
      correct: ["эпс", "везикула", "гольджи", "экзоцитоз"],
    });
    expect(result.percent).toBe(75);
    expect(result.matched).toContain("эпс");
    expect(result.missed.length).toBeGreaterThan(0);
  });

  it("сопоставление считает верные пары", () => {
    const result = gradeActivity({
      type: "matching",
      value: { k: "калий", na: "кальций" },
      correct: { k: "калий", na: "натрий" },
    });
    expect(result.percent).toBe(50);
    expect(result.missed).toEqual(["na"]);
  });

  it("верно/неверно", () => {
    expect(gradeActivity({ type: "true_false", selected: false, correct: false }).correct).toBe(true);
    expect(gradeActivity({ type: "true_false", selected: null, correct: true }).feedback).toContain(
      "не выбран",
    );
  });
});

describe("gradeActivity: открытый ответ", () => {
  const criteria = [
    { id: "na", label: "Na⁺ входит в клетку", any: ["натри", "na+"] },
    { id: "dep", label: "Мембрана деполяризуется", any: ["деполяриз", "потенциал действия"] },
    { id: "rep", label: "Реполяризация за счёт K⁺", any: ["кали", "реполяриз", "выход k"] },
  ];

  it("засчитывает раскрытые смысловые элементы с частичным баллом", () => {
    const result = gradeActivity({
      type: "open_text",
      value: "Натрий входит внутрь, поэтому мембрана деполяризуется, затем калий выходит.",
      criteria,
      threshold: 0.6,
    });
    expect(result.correct).toBe(true);
    expect(result.percent).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.matched).toHaveLength(3);
  });

  it("не проходит порог при одном элементе из трёх", () => {
    const result = gradeActivity({
      type: "open_text",
      value: "Деполяризация.",
      criteria,
      threshold: 0.6,
    });
    expect(result.percent).toBe(33);
    expect(result.passed).toBe(false);
    expect(result.missed).toHaveLength(2);
  });

  it("пустой ответ не проходит даже при низком пороге", () => {
    const result = gradeActivity({ type: "open_text", value: "   ", criteria, threshold: 0 });
    expect(result.percent).toBe(0);
    expect(result.feedback).toContain("пустой");
  });

  it("без критериев проверка не выдумывает балл", () => {
    const result = gradeActivity({ type: "open_text", value: "что-то", criteria: [] });
    expect(result.percent).toBe(0);
    expect(result.feedback).toContain("критерии");
  });
});
