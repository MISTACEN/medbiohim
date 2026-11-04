import { describe, expect, it } from "vitest";

import { BIOCHEM_RELATIONS, BIOCHEM_SIMS } from "@/lib/sim/catalog_biochem";

/**
 * Консервативные эталонные значения, зафиксированные в limitations моделей:
 * 1 НАДН → 2.5 АТФ, 1 ФАДН₂ → 1.5 АТФ, 1 ГТФ = 1 АТФ-экв.
 */
const NADH_ATP = 2.5;
const FADH2_ATP = 1.5;

function sim(slug: string) {
  const found = BIOCHEM_SIMS.find((item) => item.slug === slug);
  if (!found) throw new Error(`Нет симуляции ${slug}`);
  return found;
}

function defaultParams(slug: string): Record<string, number> {
  const params: Record<string, number> = {};
  for (const parameter of sim(slug).parameters) params[parameter.id] = parameter.default;
  return params;
}

describe("каталог биохимических симуляций", () => {
  it("содержит две новые модели (гликолиз, ЦТК и дыхательная цепь — в базовом каталоге)", () => {
    expect(BIOCHEM_SIMS.map((item) => item.slug)).toEqual(["beta-oxidation", "urea-cycle"]);
  });

  it("у всех моделей subjectSlug biochemistry и корректная структура", () => {
    for (const item of BIOCHEM_SIMS) {
      expect(item.subjectSlug).toBe("biochemistry");
      expect(item.level).toBeGreaterThanOrEqual(1);
      expect(item.level).toBeLessThanOrEqual(3);
      expect(item.source.kind).toBe("teaching_model");
      expect(item.source.limitations.length).toBeGreaterThanOrEqual(2);
      expect(item.assumptions.length).toBeGreaterThanOrEqual(2);
      expect(item.assumptions.length).toBeLessThanOrEqual(4);
      expect(item.steps.length).toBeGreaterThanOrEqual(5);
      expect(item.steps.length).toBeLessThanOrEqual(10);
      expect(item.check.correctIndex).toBeGreaterThanOrEqual(0);
      expect(item.check.correctIndex).toBeLessThan(item.check.options.length);
      expect(item.compute(defaultParams(item.slug)).notes.length).toBeGreaterThan(0);
    }
  });

  it("relations используют строковые ключи областей и уровни 1–3", () => {
    expect(Object.keys(BIOCHEM_RELATIONS).sort()).toEqual(
      BIOCHEM_SIMS.map((item) => item.slug).sort(),
    );
    for (const relations of Object.values(BIOCHEM_RELATIONS)) {
      for (const relation of Object.values(relations)) {
        expect(relation?.level).toBeGreaterThanOrEqual(1);
        expect(relation?.level).toBeLessThanOrEqual(3);
        expect(relation?.topics.length).toBeGreaterThan(0);
        expect(relation?.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("beta-oxidation", () => {
  it("пальмитат C16: 7 циклов, 8 ацетил-КоА, 106 АТФ-эквивалентов", () => {
    const result = sim("beta-oxidation").compute({ chainLength: 16 });
    expect(result.outputs.cycles).toBe(7);
    expect(result.outputs.acetylCoa).toBe(8);
    expect(result.outputs.nadh).toBe(7);
    expect(result.outputs.fadh2).toBe(7);
    expect(result.outputs.activationCost).toBe(2);
    // 8·10 (ЦТК) + 7·2.5 (НАДН) + 7·1.5 (ФАДН₂) − 2 (активация) = 106
    expect(result.outputs.totalAtp).toBeCloseTo(8 * 10 + 7 * NADH_ATP + 7 * FADH2_ATP - 2, 9);
    expect(result.outputs.totalAtp).toBeCloseTo(106, 9);
  });

  it("стеарат C18: 8 циклов, 9 ацетил-КоА, 120 АТФ-эквивалентов", () => {
    const result = sim("beta-oxidation").compute({ chainLength: 18 });
    expect(result.outputs.cycles).toBe(8);
    expect(result.outputs.acetylCoa).toBe(9);
    expect(result.outputs.totalAtp).toBeCloseTo(9 * 10 + 8 * NADH_ATP + 8 * FADH2_ATP - 2, 9); // 120
  });

  it("нечётная длина цепи округляется до ближайшей чётной (шаг 2)", () => {
    const result = sim("beta-oxidation").compute({ chainLength: 15 });
    // Math.round(15 / 2) = 8 → расчёт ведётся как для C16.
    expect(result.outputs.acetylCoa).toBe(8);
    expect(result.outputs.cycles).toBe(7);
  });
});

describe("urea-cycle", () => {
  it("1 мочевина (2 ммоль/ч NH₄⁺): 3 АТФ, 2 азота", () => {
    const result = sim("urea-cycle").compute({ ammonia: 2 });
    expect(result.outputs.urea).toBeCloseTo(1, 9);
    expect(result.outputs.nitrogenCaptured).toBe(2);
    expect(result.outputs.atpCost).toBeCloseTo(3, 9);
    expect(result.outputs.atpPerAmmonia).toBeCloseTo(1.5, 9);
  });

  it("10 ммоль/ч NH₄⁺: 5 мочевин и 15 АТФ, с предупреждением о нагрузке", () => {
    const result = sim("urea-cycle").compute({ ammonia: 10 });
    expect(result.outputs.urea).toBeCloseTo(5, 9);
    expect(result.outputs.atpCost).toBeCloseTo(15, 9);
    expect(result.warning).toBeDefined();
  });
});
