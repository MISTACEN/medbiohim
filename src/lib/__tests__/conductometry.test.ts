import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT_CONDUCTIVITY,
  buildSeries,
  computeRow,
  computeRows,
  exampleRows,
  fitOstwald,
  linearFit,
  summarize,
} from "@/lib/chemistry/conductometry";

describe("кондуктометрия: расчёт константы диссоциации", () => {
  it("считает æ, λ, α и K по сопротивлению и постоянной ячейки", () => {
    // R = 19,1 кОм, φ = 100 1/м → L = 5,236·10⁻⁵ См, æ = 5,236·10⁻³ См/м
    const row = computeRow({ id: 1, concentration: 1, resistanceKOhm: 19.1 }, { cellConstant: 100, limitConductivity: DEFAULT_LIMIT_CONDUCTIVITY });
    expect(row.conductance).toBeCloseTo(1 / (19.1 * 1000), 9);
    expect(row.conductivity).toBeCloseTo(100 / (19.1 * 1000), 8);
    expect(row.molarConductivity).toBeCloseTo(100 / (19.1 * 1000), 8);
    expect(row.degree).toBeCloseTo(100 / (19.1 * 1000) / DEFAULT_LIMIT_CONDUCTIVITY, 6);
    // K = α²·C/(1−α) для α = 0,1340 при C = 1 моль/м³
    expect(row.constant).toBeCloseTo(0.0207, 3);
    expect(row.error).toBeUndefined();
  });

  it("отбрасывает строку, если α ≥ 1 (слишком разбавленный раствор)", () => {
    const row = computeRow({ id: 2, concentration: 1, resistanceKOhm: 0.01 }, { cellConstant: 100, limitConductivity: DEFAULT_LIMIT_CONDUCTIVITY });
    expect(row.constant).toBeNull();
    expect(row.error).toMatch(/α ≥ 1/);
  });

  it("не считает строки с неположительными данными", () => {
    expect(computeRow({ id: 3, concentration: 0, resistanceKOhm: 10 }).error).toMatch(/Концентрация/);
    expect(computeRow({ id: 4, concentration: 1, resistanceKOhm: 0 }).error).toMatch(/Сопротивление/);
  });

  it("пример данных восстанавливает K уксусной кислоты и пять графиков", () => {
    const rows = exampleRows();
    const computed = computeRows(rows);
    const summary = summarize(computed);

    expect(summary.validRows).toBe(rows.length);
    expect(summary.meanConstant).toBeCloseTo(0.018, 2);
    expect(summary.spread).toBeLessThan(0.15);

    const series = buildSeries(computed);
    expect(series.map((item) => item.id)).toEqual([
      "alpha",
      "conductivity",
      "inverse-vs-conductivity",
      "scaled-conductivity",
      "ostwald",
    ]);
    for (const item of series) expect(item.points.length).toBe(rows.length);
  });

  it("линейная форма Оствальда даёт λ∞ и K", () => {
    const computed = computeRows(exampleRows());
    const fit = fitOstwald(computed);
    expect(fit).not.toBeNull();
    expect(fit!.lambdaInfinity).toBeCloseTo(DEFAULT_LIMIT_CONDUCTIVITY, 2);
    expect(fit!.constant).toBeCloseTo(0.018, 2);
    expect(fit!.r2).toBeGreaterThan(0.99);
  });

  it("линейная регрессия считает наклон и R²", () => {
    const fit = linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
    expect(fit!.slope).toBeCloseTo(2, 6);
    expect(fit!.intercept).toBeCloseTo(1, 6);
    expect(fit!.r2).toBeCloseTo(1, 6);
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
  });
});
