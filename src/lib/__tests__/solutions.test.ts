import { describe, expect, it } from "vitest";

import {
  isWaterLimited,
  kaFromPka,
  phBuffer,
  phStrongAcid,
  phStrongBase,
  phWeakAcid,
  stockVolume,
} from "@/lib/chemistry/solutions";

describe("stockVolume: C₁V₁ = C₂V₂", () => {
  it("считает объём исходного раствора и растворителя", () => {
    const result = stockVolume(1, 0.1, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stockVolumeMl).toBeCloseTo(10, 6);
    expect(result.value.solventVolumeMl).toBeCloseTo(90, 6);
  });

  it("запрещает «концентрирование разбавлением»", () => {
    const result = stockVolume(0.1, 1, 100);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("нельзя повысить");
  });

  it("отклоняет нулевые и отрицательные значения", () => {
    expect(stockVolume(0, 0.1, 100).ok).toBe(false);
    expect(stockVolume(1, -1, 100).ok).toBe(false);
    expect(stockVolume(1, 0.1, 0).ok).toBe(false);
  });
});

describe("pH сильных электролитов", () => {
  it("0.01 M HCl даёт pH 2", () => {
    const result = phStrongAcid(0.01);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(2, 6);
  });

  it("0.001 M NaOH даёт pH 11", () => {
    const result = phStrongBase(0.001);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(11, 6);
  });

  it("не принимает концентрацию вне диапазона", () => {
    expect(phStrongAcid(0).ok).toBe(false);
    expect(phStrongAcid(2).ok).toBe(false);
    expect(phStrongBase(-1).ok).toBe(false);
  });
});

describe("pH слабой кислоты", () => {
  it("уксусная кислота 0.1 M даёт pH ≈ 2.87", () => {
    const result = phWeakAcid(1.8e-5, 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(2.87, 1);
  });

  it("разбавление повышает pH", () => {
    const concentrated = phWeakAcid(1.8e-5, 0.1);
    const diluted = phWeakAcid(1.8e-5, 0.001);
    expect(concentrated.ok && diluted.ok).toBe(true);
    if (concentrated.ok && diluted.ok) expect(diluted.value).toBeGreaterThan(concentrated.value);
  });

  it("проверяет Ka и концентрацию", () => {
    expect(phWeakAcid(0, 0.1).ok).toBe(false);
    expect(phWeakAcid(1.8e-5, 0).ok).toBe(false);
  });
});

describe("буфер и pKa", () => {
  it("при равных концентрациях pH = pKa", () => {
    const result = phBuffer(1.8e-5, 0.1, 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(4.74, 2);
  });

  it("избыток основания повышает pH", () => {
    const equal = phBuffer(1.8e-5, 0.1, 0.1);
    const shifted = phBuffer(1.8e-5, 0.1, 1);
    expect(equal.ok && shifted.ok).toBe(true);
    if (equal.ok && shifted.ok) expect(shifted.value).toBeGreaterThan(equal.value);
  });

  it("kaFromPka переводит pKa в Ka", () => {
    const result = kaFromPka(4.76);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(1.74e-5, 7);
    expect(kaFromPka(15).ok).toBe(false);
  });
});

describe("автоионизация воды", () => {
  it("10⁻⁸ M HCl даёт pH около 6.98, а не 8", () => {
    const result = phStrongAcid(1e-8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeGreaterThan(6.9);
    expect(result.value).toBeLessThan(7.0);
  });

  it("10⁻⁸ M NaOH даёт pH около 7.02, а не 6", () => {
    const result = phStrongBase(1e-8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeGreaterThan(7.0);
    expect(result.value).toBeLessThan(7.1);
  });

  it("10⁻⁸ M слабой кислоты не даёт кислее нейтральной воды", () => {
    const result = phWeakAcid(1.8e-5, 1e-8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeGreaterThan(6.9);
    expect(result.value).toBeLessThan(7.0);
  });

  it("при обычных концентрациях поправка не меняет прежний ответ", () => {
    const strong = phStrongAcid(0.01);
    expect(strong.ok).toBe(true);
    if (strong.ok) expect(strong.value).toBeCloseTo(2, 6);
    const weak = phWeakAcid(1.8e-5, 0.1);
    expect(weak.ok).toBe(true);
    if (weak.ok) expect(weak.value).toBeCloseTo(2.87, 1);
  });

  it("isWaterLimited отмечает область, где вклад воды заметен", () => {
    expect(isWaterLimited(1e-8)).toBe(true);
    expect(isWaterLimited(1e-3)).toBe(false);
    expect(isWaterLimited(0)).toBe(false);
  });
});
