import { describe, expect, it } from "vitest";

import {
  FARADAY,
  GAS_CONSTANT,
  beerLambert,
  cellPotential,
  concentrationFromAbsorbance,
  titrate,
} from "@/lib/chemistry/lab";

const strongAcid = {
  analyte: "strong_acid" as const,
  analyteConcentration: 0.1,
  analyteVolumeMl: 20,
  titrantConcentration: 0.1,
};

const acetic = {
  analyte: "weak_acid" as const,
  analyteConcentration: 0.1,
  analyteVolumeMl: 20,
  titrantConcentration: 0.1,
  ka: 1.8e-5,
};

describe("титрование", () => {
  it("сильная кислота: pH 1 до титрования и 7 в точке эквивалентности", () => {
    const result = titrate(strongAcid);
    expect(result.equivalenceVolumeMl).toBeCloseTo(20, 6);
    expect(result.points[0].ph).toBeCloseTo(1, 2);
    expect(result.equivalencePh).toBeCloseTo(7, 1);
    expect(result.indicators.filter((item) => item.recommended)).toHaveLength(1);
    expect(result.indicators.find((item) => item.recommended)?.name).toBe("Бромтимоловый синий");
  });

  it("слабая кислота: буфер, щелочная точка эквивалентности и фенолфталеин", () => {
    const result = titrate(acetic);
    expect(result.points[0].ph).toBeCloseTo(2.87, 1);
    // Ацетат натрия гидролизуется: pH эквивалентности > 7.
    expect(result.equivalencePh).toBeGreaterThan(8);
    expect(result.equivalencePh).toBeLessThan(9.2);
    expect(result.indicators.find((item) => item.recommended)?.name).toBe("Фенолфталеин");
  });

  it("кривая монотонна, содержит точку эквивалентности и не врёт за ней", () => {
    const result = titrate({ ...strongAcid, points: 51 });
    for (let index = 1; index < result.points.length; index += 1) {
      expect(result.points[index].ph).toBeGreaterThanOrEqual(result.points[index - 1].ph - 1e-9);
      expect(result.points[index].volumeMl).toBeGreaterThan(result.points[index - 1].volumeMl);
    }
    expect(result.points.some((point) => Math.abs(point.volumeMl - result.equivalenceVolumeMl) < 1e-9)).toBe(true);
    expect(result.points.at(-1)?.ph).toBeGreaterThan(11);
    expect(result.notes.join(" ")).toMatch(/25 °C/);
  });

  it("сильное основание титруется кислотой", () => {
    const result = titrate({
      analyte: "strong_base",
      analyteConcentration: 0.05,
      analyteVolumeMl: 10,
      titrantConcentration: 0.1,
    });
    expect(result.equivalenceVolumeMl).toBeCloseTo(5, 6);
    expect(result.points[0].ph).toBeCloseTo(12.7, 1);
    expect(result.equivalencePh).toBeCloseTo(7, 1);
  });

  it("слабое основание требует Ka сопряжённой кислоты", () => {
    const result = titrate({
      analyte: "weak_base",
      analyteConcentration: 0.1,
      analyteVolumeMl: 10,
      titrantConcentration: 0.1,
      ka: 5.6e-10,
    });
    expect(result.points[0].ph).toBeGreaterThan(10.5);
    expect(result.equivalencePh).toBeLessThan(6.5);
  });

  it("отвергает нулевые концентрации и слабый электролит без Ka", () => {
    expect(() => titrate({ ...strongAcid, analyteConcentration: 0 })).toThrow();
    expect(() => titrate({ ...strongAcid, titrantConcentration: -1 })).toThrow();
    expect(() => titrate({ ...strongAcid, analyte: "weak_acid", ka: undefined })).toThrow(/Ka/);
  });
});

describe("электрохимия", () => {
  it("гальванический элемент Даниэля: 1,10 В и отрицательная ΔG°", () => {
    const result = cellPotential({ cathodeId: "cu", anodeId: "zn" });
    expect(result.e0Cell).toBeCloseTo(1.1037, 4);
    expect(result.eCell).toBeCloseTo(1.1037, 4);
    expect(result.electrons).toBe(2);
    expect(result.deltaG0Kj).toBeCloseTo((-2 * FARADAY * 1.1037) / 1000, 1);
    expect(result.deltaG0Kj).toBeLessThan(0);
    expect(result.spontaneous).toBe(true);
  });

  it("уравнение Нернста: Q < 1 увеличивает ЭДС на 0,05916/n·lg(1/Q)", () => {
    const result = cellPotential({ cathodeId: "cu", anodeId: "zn", reactionQuotient: 0.01 });
    const correction = (GAS_CONSTANT * 298.15 / (2 * FARADAY)) * Math.log(100);
    expect(result.eCell).toBeCloseTo(1.1037 + correction, 6);
    expect(result.spontaneous).toBe(true);
  });

  it("обратная полярность делает реакцию несамопроизвольной", () => {
    const result = cellPotential({ cathodeId: "zn", anodeId: "cu" });
    expect(result.eCell).toBeLessThan(0);
    expect(result.spontaneous).toBe(false);
    expect(result.deltaG0Kj).toBeGreaterThan(0);
  });

  it("отвергает одинаковые электроды и плохие Q/T", () => {
    expect(() => cellPotential({ cathodeId: "cu", anodeId: "cu" })).toThrow();
    expect(() => cellPotential({ cathodeId: "cu", anodeId: "zn", reactionQuotient: 0 })).toThrow();
    expect(() => cellPotential({ cathodeId: "cu", anodeId: "zn", temperatureK: -5 })).toThrow();
  });
});

describe("спектроскопия", () => {
  it("A = εlc и пропускание T = 10^(−A)", () => {
    const result = beerLambert({ epsilon: 12000, pathCm: 1, concentration: 1e-4 });
    expect(result.absorbance).toBeCloseTo(1.2, 6);
    expect(result.transmittancePercent).toBeCloseTo(10 ** -1.2 * 100, 6);
    expect(result.absorbedFraction).toBeCloseTo(1 - 10 ** -1.2, 6);
    expect(result.linear).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("обратный расчёт концентрации возвращает исходное значение", () => {
    const { concentration } = concentrationFromAbsorbance(0.8, 15000, 1);
    expect(concentration).toBeCloseTo(0.8 / 15000, 12);
    const again = beerLambert({ epsilon: 15000, pathCm: 1, concentration });
    expect(again.absorbance).toBeCloseTo(0.8, 10);
  });

  it("предупреждает о выходе из линейного участка", () => {
    const tooDense = beerLambert({ epsilon: 20000, pathCm: 1, concentration: 2e-4 });
    expect(tooDense.absorbance).toBeGreaterThan(1.5);
    expect(tooDense.linear).toBe(false);
    expect(tooDense.warnings.join(" ")).toMatch(/1,5/);

    const tooWeak = beerLambert({ epsilon: 100, pathCm: 1, concentration: 1e-4 });
    expect(tooWeak.warnings.join(" ")).toMatch(/0,05/);
  });

  it("отвергает нефизические входы", () => {
    expect(() => beerLambert({ epsilon: 0, pathCm: 1, concentration: 1e-4 })).toThrow();
    expect(() => beerLambert({ epsilon: 100, pathCm: 0, concentration: 1e-4 })).toThrow();
    expect(() => beerLambert({ epsilon: 100, pathCm: 1, concentration: -1 })).toThrow();
    expect(() => concentrationFromAbsorbance(0, 100, 1)).toThrow();
  });
});
