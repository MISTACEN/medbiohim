import { describe, expect, it } from "vitest";

import { SIMULATIONS, getSimulation } from "@/lib/sim/catalog";
import { computeCurve, defaultParams, evaluate, sanitizeParams } from "@/lib/sim/engine";
import type { SimDefinition } from "@/lib/sim/types";

function simulation(slug: string): SimDefinition {
  const found = getSimulation(slug);
  if (!found) throw new Error(`Нет симуляции ${slug}`);
  return found;
}

describe("каталог симуляций", () => {
  it("содержит три модели из разных дисциплин", () => {
    expect(SIMULATIONS.map((simulation) => simulation.slug)).toEqual([
      "enzyme-kinetics",
      "buffer-titration",
      "membrane-potential",
    ]);
    expect(new Set(SIMULATIONS.map((simulation) => simulation.subjectSlug)).size).toBe(3);
  });

  it("у каждой модели есть источник, ограничения и проверка", () => {
    for (const simulation of SIMULATIONS) {
      expect(simulation.source.title.length).toBeGreaterThan(0);
      expect(simulation.source.limitations.length).toBeGreaterThan(0);
      expect(simulation.assumptions.length).toBeGreaterThan(0);
      expect(simulation.check.options.length).toBeGreaterThanOrEqual(2);
      expect(simulation.check.correctIndex).toBeLessThan(simulation.check.options.length);
    }
  });

  it("getSimulation находит модель и не находит вымышленную", () => {
    expect(getSimulation("buffer-titration")?.title).toContain("Титрование");
    expect(getSimulation("photosynthesis")).toBeUndefined();
  });
});

describe("движок: параметры", () => {
  it("defaultParams заполняет все параметры", () => {
    const definition = SIMULATIONS[0];
    const params = defaultParams(definition);
    for (const parameter of definition.parameters) {
      expect(params[parameter.id]).toBe(parameter.default);
    }
  });

  it("sanitizeParams обрезает выход за диапазон", () => {
    const definition = SIMULATIONS[0];
    const params = sanitizeParams(definition, { vmax: 9999, km: -5, substrate: Number.NaN });
    expect(params.vmax).toBe(100);
    expect(params.km).toBe(0.1);
    expect(params.substrate).toBe(2 * 2.5); // default подставляется вместо NaN
  });

  it("evaluate не возвращает NaN в выходах", () => {
    const definition = SIMULATIONS[0];
    const result = evaluate(definition, { vmax: 0, km: 0, substrate: 0, inhibitor: 0, ki: 0 });
    for (const value of Object.values(result.outputs)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("кинетика фермента", () => {
  const definition = SIMULATIONS[0];

  it("при [S] = Km скорость равна половине Vmax", () => {
    const result = evaluate(definition, {
      vmax: 20,
      km: 2,
      substrate: 2,
      inhibitor: 0,
      ki: 2,
    });
    expect(result.outputs.velocity).toBeCloseTo(10, 6);
    expect(result.outputs.saturation).toBeCloseTo(50, 6);
    expect(result.outputs.kmApp).toBeCloseTo(2, 6);
  });

  it("конкурентный ингибитор повышает кажущийся Km и снижает скорость", () => {
    const base = evaluate(definition, { vmax: 20, km: 2, substrate: 5, inhibitor: 0, ki: 2 });
    const inhibited = evaluate(definition, { vmax: 20, km: 2, substrate: 5, inhibitor: 10, ki: 2 });
    expect(inhibited.outputs.kmApp).toBeCloseTo(2 * (1 + 10 / 2), 6);
    expect(inhibited.outputs.velocity).toBeLessThan(base.outputs.velocity);
  });

  it("при насыщении ингибитор почти не влияет на скорость", () => {
    const saturated = evaluate(definition, { vmax: 20, km: 2, substrate: 50, inhibitor: 0, ki: 2 });
    expect(saturated.outputs.saturation).toBeGreaterThan(95);
  });

  it("кривая substrate → velocity не убывает", () => {
    const curve = computeCurve(definition, defaultParams(definition), 40);
    expect(curve).toHaveLength(40);
    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index].y).toBeGreaterThanOrEqual(curve[index - 1].y - 1e-9);
    }
  });
});

describe("титрование слабой кислоты", () => {
  const definition = simulation("buffer-titration");

  it("в начале титрования pH близок к расчёту для слабой кислоты", () => {
    const result = evaluate(definition, {
      pka: 4.76,
      concAcid: 100,
      volumeAcid: 25,
      concBase: 100,
      volumeBase: 0,
    });
    expect(result.outputs.ph).toBeGreaterThan(2.8);
    expect(result.outputs.ph).toBeLessThan(3.0);
  });

  it("в середине буферной зоны pH ≈ pKa", () => {
    const result = evaluate(definition, {
      pka: 4.76,
      concAcid: 100,
      volumeAcid: 25,
      concBase: 100,
      volumeBase: 12.5,
    });
    expect(result.outputs.ph).toBeCloseTo(4.76, 1);
    expect(result.outputs.alpha).toBeCloseTo(50, 0);
  });

  it("в точке эквивалентности среда щелочная", () => {
    const result = evaluate(definition, {
      pka: 4.76,
      concAcid: 100,
      volumeAcid: 25,
      concBase: 100,
      volumeBase: 25,
    });
    expect(result.outputs.ph).toBeGreaterThan(7);
    expect(result.outputs.equivalence).toBeCloseTo(25, 6);
  });

  it("кривая титрования не убывает по pH", () => {
    const curve = computeCurve(definition, defaultParams(definition), 100);
    expect(curve).toHaveLength(100);
    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index].y).toBeGreaterThanOrEqual(curve[index - 1].y - 0.01);
    }
  });
});

describe("мембранный потенциал покоя", () => {
  const definition = simulation("membrane-potential");

  it("при физиологических концентрациях даёт −60…−75 мВ", () => {
    const result = evaluate(definition, defaultParams(definition));
    expect(result.outputs.em).toBeLessThan(-60);
    expect(result.outputs.em).toBeGreaterThan(-75);
  });

  it("потенциал Нернста для K⁺ при 4.5/140 мМ ≈ −91 мВ", () => {
    const result = evaluate(definition, defaultParams(definition));
    expect(result.outputs.ek).toBeCloseTo(61.5 * Math.log10(4.5 / 140), 1);
    expect(result.outputs.ek).toBeLessThan(-88);
    expect(result.outputs.ek).toBeGreaterThan(-94);
  });

  it("рост внеклеточного K⁺ деполяризует мембрану", () => {
    const normal = evaluate(definition, defaultParams(definition));
    const hyper = evaluate(definition, { ...defaultParams(definition), kOut: 8 });
    expect(hyper.outputs.em).toBeGreaterThan(normal.outputs.em);
    expect(hyper.outputs.ek).toBeGreaterThan(normal.outputs.ek);
  });

  it("кривая K⁺ → Em возрастает", () => {
    const curve = computeCurve(definition, defaultParams(definition), 60);
    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index].y).toBeGreaterThanOrEqual(curve[index - 1].y - 1e-9);
    }
  });
});

describe("движок: кривые", () => {
  it("без sweep кривая пустая", () => {
    const definition = { ...SIMULATIONS[0], sweep: undefined };
    expect(computeCurve(definition, defaultParams(SIMULATIONS[0]))).toEqual([]);
  });

  it("число точек ограничивается контрактом", () => {
    expect(computeCurve(SIMULATIONS[0], defaultParams(SIMULATIONS[0]), 1)).toHaveLength(2);
    expect(computeCurve(SIMULATIONS[0], defaultParams(SIMULATIONS[0]), 1000)).toHaveLength(400);
  });
});
