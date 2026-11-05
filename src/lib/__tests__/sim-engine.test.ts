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
  it("содержит семь моделей из четырёх дисциплин", () => {
    expect(SIMULATIONS.map((simulation) => simulation.slug)).toEqual([
      "enzyme-kinetics",
      "buffer-titration",
      "membrane-potential",
      "sodium-potassium-pump",
      "osmosis",
      "oxygen-hemoglobin",
      "hardy-weinberg",
    ]);
    expect(new Set(SIMULATIONS.map((simulation) => simulation.subjectSlug)).size).toBe(4);
  });

  it("симуляция с визуализацией обязана объявить поддерживаемый visual", () => {
    for (const simulation of SIMULATIONS) {
      if (simulation.visual) expect(simulation.visual).toBe("na-k-pump");
    }
    // Флагманская анимация задания §9.1 — насос.
    expect(getSimulation("sodium-potassium-pump")?.visual).toBe("na-k-pump");
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

describe("осмос и тонус клетки", () => {
  const definition = simulation("osmosis");

  it("в изотонической среде объём не меняется", () => {
    const result = evaluate(definition, { osmIn: 300, osmOut: 300, volume0: 1000 });
    expect(result.outputs.ratio).toBeCloseTo(1, 6);
    expect(result.outputs.volume).toBeCloseTo(1000, 6);
    expect(result.outputs.change).toBeCloseTo(0, 6);
  });

  it("в гипертонической среде клетка уменьшается", () => {
    const result = evaluate(definition, { osmIn: 300, osmOut: 400, volume0: 1000 });
    expect(result.outputs.ratio).toBeCloseTo(0.75, 6);
    expect(result.outputs.change).toBeCloseTo(-25, 6);
  });

  it("в гипотонической среде предупреждает о риске лизиса", () => {
    const result = evaluate(definition, { osmIn: 300, osmOut: 200, volume0: 1000 });
    expect(result.outputs.ratio).toBeCloseTo(1.5, 6);
    expect(result.warning).toContain("лизис");
  });

  it("кривая объёма убывает с ростом осмолярности среды", () => {
    const curve = computeCurve(definition, defaultParams(definition), 50);
    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index].y).toBeLessThanOrEqual(curve[index - 1].y + 1e-9);
    }
  });
});

describe("диссоциация оксигемоглобина", () => {
  const definition = simulation("oxygen-hemoglobin");

  it("при pO₂ = P50 сатурация 50%", () => {
    const result = evaluate(definition, { ...defaultParams(definition), po2: 26.5, p50: 26.5 });
    expect(result.outputs.saturation).toBeCloseTo(50, 6);
  });

  it("при высоком pO₂ сатурация близка к 100%", () => {
    const result = evaluate(definition, { ...defaultParams(definition), po2: 100 });
    expect(result.outputs.saturation).toBeGreaterThan(95);
  });

  it("сдвиг P50 вправо снижает сатурацию при том же pO₂", () => {
    const left = evaluate(definition, { ...defaultParams(definition), po2: 40, p50: 20 });
    const right = evaluate(definition, { ...defaultParams(definition), po2: 40, p50: 40 });
    expect(right.outputs.saturation).toBeLessThan(left.outputs.saturation);
  });

  it("кислородная ёмкость считается по 1.34 мл/г гемоглобина", () => {
    const result = evaluate(definition, {
      po2: 100,
      p50: 26.5,
      hill: 2.8,
      hb: 150,
    });
    expect(result.outputs.content).toBeCloseTo(1.34 * 15 * (result.outputs.saturation / 100), 6);
  });
});

describe("равновесие Харди–Вайнберга", () => {
  const definition = simulation("hardy-weinberg");

  it("при p = 0.5 даёт 25 / 50 / 25", () => {
    const result = evaluate(definition, { p: 0.5 });
    expect(result.outputs.homoDom).toBeCloseTo(25, 6);
    expect(result.outputs.hetero).toBeCloseTo(50, 6);
    expect(result.outputs.homoRec).toBeCloseTo(25, 6);
  });

  it("при фиксации аллеля гетерозигот нет", () => {
    const result = evaluate(definition, { p: 0 });
    expect(result.outputs.hetero).toBeCloseTo(0, 6);
    expect(result.outputs.homoRec).toBeCloseTo(100, 6);
  });

  it("гетерозиготность максимальна при p = 0.5", () => {
    const curve = computeCurve(definition, defaultParams(definition), 101);
    const max = Math.max(...curve.map((point) => point.y));
    expect(max).toBeCloseTo(50, 6);
    const peak = curve.find((point) => Math.abs(point.y - max) < 1e-9);
    expect(peak?.x).toBeCloseTo(0.5, 2);
  });
});
