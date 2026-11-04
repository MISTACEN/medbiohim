import { describe, expect, it } from "vitest";

import { BIOLOGY_RELATIONS, BIOLOGY_SIMS } from "@/lib/sim/catalog_biology";

function sim(slug: string) {
  const found = BIOLOGY_SIMS.find((item) => item.slug === slug);
  if (!found) throw new Error(`Нет симуляции ${slug}`);
  return found;
}

function defaultParams(slug: string): Record<string, number> {
  const params: Record<string, number> = {};
  for (const parameter of sim(slug).parameters) params[parameter.id] = parameter.default;
  return params;
}

describe("каталог биологических симуляций", () => {
  it("содержит четыре новые модели", () => {
    expect(BIOLOGY_SIMS.map((item) => item.slug)).toEqual([
      "cell-cycle-mitosis",
      "meiosis-phases",
      "dna-biosynthesis",
      "embryogenesis",
    ]);
  });

  it("у каждой модели источник teaching_model, ограничения, assumptions и проверки в границах", () => {
    for (const item of BIOLOGY_SIMS) {
      expect(item.source.kind).toBe("teaching_model");
      expect(item.source.limitations.length).toBeGreaterThan(0);
      expect(item.assumptions.length).toBeGreaterThan(0);
      expect(item.check.correctIndex).toBeGreaterThanOrEqual(0);
      expect(item.check.correctIndex).toBeLessThan(item.check.options.length);
    }
  });

  it("relations используют строковые ключи областей и уровни 1–3", () => {
    expect(Object.keys(BIOLOGY_RELATIONS)).toEqual(BIOLOGY_SIMS.map((item) => item.slug));
    for (const relations of Object.values(BIOLOGY_RELATIONS)) {
      for (const relation of Object.values(relations)) {
        expect(relation?.level).toBeGreaterThanOrEqual(1);
        expect(relation?.level).toBeLessThanOrEqual(3);
        expect(relation?.topics.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("cell-cycle-mitosis", () => {
  it("при 24 ч и дефолтных долях M — остаток, ДНК в G2 = 4C", () => {
    const result = sim("cell-cycle-mitosis").compute(defaultParams("cell-cycle-mitosis"));
    // Доли: G1 0.4 + S 0.35 + G2 0.2 = 0.95 → M = 0.05
    expect(result.outputs.g1Hours).toBeCloseTo(9.6, 5);
    expect(result.outputs.sHours).toBeCloseTo(8.4, 5);
    expect(result.outputs.g2Hours).toBeCloseTo(4.8, 5);
    expect(result.outputs.mHours).toBeCloseTo(1.2, 5);
    expect(result.outputs.dnaG1).toBe(2);
    expect(result.outputs.dnaG2).toBe(4);
    expect(result.outputs.dnaS).toBeGreaterThan(2);
    expect(result.outputs.dnaS).toBeLessThan(4);
    expect(result.warning).toBeUndefined();
  });
});

describe("meiosis-phases", () => {
  it("при 2n = 46 даёт n = 23 и 2^23 комбинаций", () => {
    const result = sim("meiosis-phases").compute(defaultParams("meiosis-phases"));
    expect(result.outputs.haploid).toBe(23);
    expect(result.outputs.pairs).toBe(23);
    expect(result.outputs.combinations).toBe(8388608);
    expect(result.outputs.cells).toBe(4);
    expect(result.outputs.dnaFinal).toBe(1);
  });

  it("при 2n = 4 комбинаций 4", () => {
    const result = sim("meiosis-phases").compute({ diploid: 4, crossoverRate: 50 });
    expect(result.outputs.combinations).toBe(4);
  });
});

describe("dna-biosynthesis", () => {
  it("при гене 1000 нуклеотидов даёт 332 аминокислоты", () => {
    const result = sim("dna-biosynthesis").compute({
      geneKb: 1,
      polymeraseSpeed: 50,
      ribosomeSpeed: 5,
    });
    expect(result.outputs.mrnaLength).toBe(1000);
    expect(result.outputs.aminoAcids).toBe(332); // floor(1000 / 3) − 1
    expect(result.outputs.transcriptionTime).toBeCloseTo(20, 5);
    expect(result.outputs.translationTime).toBeCloseTo(332 / 5, 5);
  });
});

describe("embryogenesis", () => {
  it("день 16 — гаструляция", () => {
    const result = sim("embryogenesis").compute({ day: 16 });
    const gastrulationNote = result.notes.find((note) => note.startsWith("День 16"));
    expect(gastrulationNote).toContain("Гаструляция");
    expect(result.outputs.stageIndex).toBe(5);
  });

  it("день 3 — дробление", () => {
    const result = sim("embryogenesis").compute({ day: 3 });
    const dayNote = result.notes.find((note) => note.startsWith("День 3"));
    expect(dayNote).toContain("Дробление");
    expect(result.outputs.stageIndex).toBe(1);
  });

  it("размер растёт с днём и ограничен диапазоном 0–56", () => {
    const definition = sim("embryogenesis");
    expect(definition.compute({ day: 0 }).outputs.sizeMm).toBeLessThan(
      definition.compute({ day: 28 }).outputs.sizeMm,
    );
    expect(definition.compute({ day: 28 }).outputs.sizeMm).toBeLessThan(
      definition.compute({ day: 56 }).outputs.sizeMm,
    );
  });
});
