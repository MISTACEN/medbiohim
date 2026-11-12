import { describe, expect, it } from "vitest";
import { lectureChemContext } from "@/lib/chemistry/lectureContext";

const CHEM_LECTURE = `## Энергетический обмен

Глюкоза окисляется полностью: C6H12O6 + 6O2 → 6CO2 + 6H2O.
Вода H2O и углекислый газ CO2 — конечные продукты.
`;

const STRUCTURE_LECTURE = `## Углеводы

Моносахариды — глюкоза C6H12O6, фруктоза; дисахариды — сахароза C12H22O11.
`;

const HISTOLOGY_LECTURE = `## Нервная ткань

Нейроциты, нейроглия, миелиновое волокно. Никаких уравнений здесь нет.
`;

describe("химическая панель из текста лекции", () => {
  it("находит уравнение и открывает раздел «Реакции»", () => {
    const context = lectureChemContext(CHEM_LECTURE);
    expect(context.section).toBe("reactions");
    expect(context.equation).toBe("C6H12O6 + O2 -> CO2 + H2O");
    expect(context.equations).toHaveLength(1);
  });

  it("понимает формулы с нижними индексами, как в настоящих лекциях", () => {
    const context = lectureChemContext("**Нитрование.** C₆H₆ + HNO₃ (конц.) → C₆H₅NO₂ + H₂O при 50–60 °C.");
    expect(context.section).toBe("reactions");
    expect(context.equation).toBe("C6H6 + HNO3 -> C6H5NO2 + H2O");
  });

  it("без уравнений открывает «Структуры» с формулами лекции", () => {
    const context = lectureChemContext(STRUCTURE_LECTURE);
    expect(context.section).toBe("structures");
    expect(context.equation).toBeNull();
    expect(context.substances).toContain("C6H12O6");
    expect(context.substances).toContain("C12H22O11");
  });

  it("не выдумывает химию там, где её нет", () => {
    const context = lectureChemContext(HISTOLOGY_LECTURE);
    expect(context.section).toBeNull();
    expect(context.substances).toEqual([]);
  });

  it("не подставляет прозу вместо уравнения", () => {
    const context = lectureChemContext("Сравните АТФ и АДФ, затем посмотрите на рисунок.");
    expect(context.equations).toEqual([]);
    expect(context.section).toBeNull();
  });
});
