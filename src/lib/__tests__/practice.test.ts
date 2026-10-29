import { describe, expect, it } from "vitest";

import {
  PRACTICE_TOPICS,
  checkPracticeAnswer,
  generateVariant,
  hashSeed,
  molarMass,
  parseAnswer,
  parseFormula,
  variantCsvRows,
} from "@/lib/chemistry/practice";

describe("формулы и молярные массы", () => {
  it("разбирает простые формулы и скобки", () => {
    expect(parseFormula("H2O")).toEqual({ H: 2, O: 1 });
    expect(parseFormula("Ca(OH)2")).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula("(NH4)2SO4")).toEqual({ N: 2, H: 8, S: 1, O: 4 });
    expect(parseFormula("Fe2(SO4)3")).toEqual({ Fe: 2, S: 3, O: 12 });
    expect(parseFormula("C6H12O6")).toEqual({ C: 6, H: 12, O: 6 });
  });

  it("отвергает мусор вместо тихого нуля", () => {
    expect(() => parseFormula("H2O)")).toThrow();
    expect(() => parseFormula("(H2O")).toThrow();
    expect(() => parseFormula("2H2O")).toThrow();
    expect(() => molarMass("Xx2")).toThrow(/отсутствует/);
  });

  it("считает молярную массу по снимку таблицы", () => {
    expect(molarMass("H2O")).toBeCloseTo(18.015, 2);
    expect(molarMass("CO2")).toBeCloseTo(44.009, 2);
    expect(molarMass("NaCl")).toBeCloseTo(58.44, 1);
    expect(molarMass("C6H12O6")).toBeCloseTo(180.156, 2);
    expect(molarMass("(NH4)2SO4")).toBeCloseTo(132.14, 1);
  });
});

describe("детерминированный генератор", () => {
  it("тот же seed даёт тот же вариант, другой — другой", () => {
    const first = generateVariant({ seed: "контрольная-1", count: 8 });
    const second = generateVariant({ seed: "контрольная-1", count: 8 });
    const other = generateVariant({ seed: "контрольная-2", count: 8 });
    expect(second).toEqual(first);
    expect(other.questions).not.toEqual(first.questions);
    expect(hashSeed("контрольная-1")).toBe(hashSeed(" контрольная-1 "));
  });

  it("уважает темы, количество и уровень", () => {
    const variant = generateVariant({
      seed: 42,
      count: 4,
      topics: ["ph", "titration"],
      difficulty: 3,
    });
    expect(variant.questions).toHaveLength(4);
    expect(variant.questions.every((question) => ["ph", "titration"].includes(question.topic))).toBe(true);
    expect(variant.questions.every((question) => question.difficulty === 3)).toBe(true);
    expect(generateVariant({ seed: 1, count: 999 }).questions.length).toBeLessThanOrEqual(30);
    expect(generateVariant({ seed: 1, count: 0 }).questions).toHaveLength(1);
  });

  it("все 8 тем дают осмысленную задачу с шагами и ответом", () => {
    const topics = PRACTICE_TOPICS.map((topic) => topic.id);
    const variant = generateVariant({ seed: "smoke", count: 40, topics, difficulty: "mixed" });
    for (const question of variant.questions) {
      expect(question.prompt.length).toBeGreaterThan(20);
      expect(Number.isFinite(question.answer.value)).toBe(true);
      expect(question.answer.value).toBeGreaterThan(0);
      expect(question.answer.tolerance).toBeGreaterThan(0);
      expect(question.answer.unit.length).toBeGreaterThan(0);
      expect(question.steps.length).toBeGreaterThanOrEqual(3);
      expect(question.steps.join(" ")).not.toContain("NaN");
      expect(question.steps.join(" ")).not.toContain("undefined");
      expect(question.notes.length).toBeGreaterThan(0);
    }
    expect(new Set(variant.questions.map((question) => question.topic)).size).toBe(8);
  });

  it("ответ на задачу о молярной массе совпадает с независимым расчётом по формуле из условия", () => {
    const variant = generateVariant({ seed: "molar", count: 12, topics: ["molar_mass"] });
    for (const question of variant.questions) {
      const formula = question.prompt.match(/молярную массу (\S+)/)?.[1];
      expect(formula).toBeTruthy();
      expect(question.answer.value).toBeCloseTo(molarMass(formula as string), 5);
    }
  });
});

describe("проверка ответа", () => {
  const question = generateVariant({ seed: 7, count: 1, topics: ["ph"] }).questions[0];

  it("принимает запятую, точку, пробелы и единицы", () => {
    expect(parseAnswer("12,5")).toBe(12.5);
    expect(parseAnswer(" 12.5 pH ")).toBe(12.5);
    expect(parseAnswer("1,2e2")).toBe(120);
    expect(parseAnswer("abc")).toBeNaN();
    expect(parseAnswer("")).toBeNull();
  });

  it("различает пустой, неверный и правильный ответ", () => {
    expect(checkPracticeAnswer(question, "").status).toBe("empty");
    expect(checkPracticeAnswer(question, "не число").status).toBe("invalid");
    expect(checkPracticeAnswer(question, String(question.answer.value)).status).toBe("correct");
    expect(checkPracticeAnswer(question, String(question.answer.value + 5)).status).toBe("incorrect");
  });

  it("CSV-строки содержат ответ и seed, но не служебный id", () => {
    const variant = generateVariant({ seed: "csv", count: 2 });
    const rows = variantCsvRows(variant, { [variant.questions[0].id]: "correct" });
    expect(rows).toHaveLength(2);
    expect(rows[0]["Seed"]).toBe(variant.seed);
    expect(rows[0]["Ваш результат"]).toBe("correct");
    expect(Object.keys(rows[0])).not.toContain("id");
  });
});
