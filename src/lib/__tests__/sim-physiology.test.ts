import { describe, expect, it } from "vitest";

import { PHYSIOLOGY_RELATIONS, PHYSIOLOGY_SIMS } from "@/lib/sim/catalog_physiology";

/** Строковые ключи допустимых предметных областей (как в модулях обучения). */
const ALLOWED_SUBJECTS = [
  "chemistry_organic_physical",
  "inorganic_chemistry",
  "analytical_toxicology",
  "biochemistry",
  "biology",
  "cytology",
  "histology",
  "embryology",
  "genetics",
  "molecular_biology",
  "physiology",
  "pathophysiology",
  "pharmacology",
  "physics",
  "optics",
  "biophysics",
  "medical_technology",
  "anatomy",
  "pathological_anatomy",
  "microbiology",
  "immunology",
];

function sim(slug: string) {
  const found = PHYSIOLOGY_SIMS.find((item) => item.slug === slug);
  if (!found) throw new Error(`Нет симуляции ${slug}`);
  return found;
}

function defaultParams(slug: string): Record<string, number> {
  const params: Record<string, number> = {};
  for (const parameter of sim(slug).parameters) params[parameter.id] = parameter.default;
  return params;
}

describe("каталог физиологических симуляций", () => {
  it("содержит пять новых моделей (насос — в базовом каталоге)", () => {
    expect(PHYSIOLOGY_SIMS.map((item) => item.slug)).toEqual([
      "action-potential",
      "cardiac-cycle",
      "breathing-cycle",
      "kidney-filtration",
      "diffusion-fick",
    ]);
  });

  it("subjectSlug каждой модели из допустимого набора областей", () => {
    for (const item of PHYSIOLOGY_SIMS) {
      expect(ALLOWED_SUBJECTS).toContain(item.subjectSlug);
    }
  });

  it("у каждой модели источник teaching_model, ограничения, assumptions, 3–7 шагов и проверки в границах", () => {
    for (const item of PHYSIOLOGY_SIMS) {
      expect(item.source.kind).toBe("teaching_model");
      expect(item.source.limitations.length).toBeGreaterThanOrEqual(2);
      expect(item.source.limitations.length).toBeLessThanOrEqual(3);
      expect(item.assumptions.length).toBeGreaterThanOrEqual(2);
      expect(item.assumptions.length).toBeLessThanOrEqual(4);
      expect(item.steps.length).toBeGreaterThanOrEqual(3);
      expect(item.steps.length).toBeLessThanOrEqual(7);
      expect(item.check.correctIndex).toBeGreaterThanOrEqual(0);
      expect(item.check.correctIndex).toBeLessThan(item.check.options.length);
    }
  });

  it("relations используют строковые ключи областей, уровни 1–3 и непустые темы", () => {
    expect(Object.keys(PHYSIOLOGY_RELATIONS)).toEqual(PHYSIOLOGY_SIMS.map((item) => item.slug));
    for (const relations of Object.values(PHYSIOLOGY_RELATIONS)) {
      for (const [subject, relation] of Object.entries(relations)) {
        expect(ALLOWED_SUBJECTS).toContain(subject);
        expect(relation?.level).toBeGreaterThanOrEqual(1);
        expect(relation?.level).toBeLessThanOrEqual(3);
        expect(relation?.reason.length).toBeGreaterThan(0);
        expect(relation?.topics.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("action-potential", () => {
  it("при [K⁺] внутри 140 и снаружи 4 EK ≈ −95 мВ", () => {
    const result = sim("action-potential").compute({ kOut: 4, kIn: 140, naOut: 145, naIn: 12 });
    expect(result.outputs.ek).toBeCloseTo(-94.96, 1);
    expect(result.outputs.ek).toBeGreaterThan(-96);
    expect(result.outputs.ek).toBeLessThan(-94.5);
    // E(Na⁺) = 61.5·lg(145/12) ≈ 66.6 мВ
    expect(result.outputs.ena).toBeCloseTo(61.5 * Math.log10(145 / 12), 5);
  });

  it("пик ниже E(Na⁺), гиперполяризация не ниже E(K⁺) + поправки", () => {
    const result = sim("action-potential").compute({ kOut: 4, kIn: 140, naOut: 145, naIn: 12 });
    expect(result.outputs.peak).toBeLessThan(result.outputs.ena);
    expect(result.outputs.undershoot).toBeGreaterThan(result.outputs.ek);
    expect(result.outputs.undershoot).toBeLessThan(result.outputs.resting);
    expect(result.outputs.amplitude).toBeCloseTo(result.outputs.peak - result.outputs.resting, 6);
  });

  it("рост [K⁺] снаружи деполяризует покой", () => {
    const normal = sim("action-potential").compute({ kOut: 4, kIn: 140, naOut: 145, naIn: 12 });
    const hyperkalemia = sim("action-potential").compute({ kOut: 8, kIn: 140, naOut: 145, naIn: 12 });
    expect(hyperkalemia.outputs.ek).toBeGreaterThan(normal.outputs.ek);
    expect(hyperkalemia.outputs.resting).toBeGreaterThan(normal.outputs.resting);
    expect(hyperkalemia.warning).toBeDefined();
  });
});

describe("cardiac-cycle", () => {
  it("при 75 уд/мин цикл 0.8 с, УО = КДО − КСО, МОК = УО·ЧСС", () => {
    const result = sim("cardiac-cycle").compute({ hr: 75, edv: 120, esv: 50, sysBP: 120, diaBP: 80 });
    expect(result.outputs.cycleDur).toBeCloseTo(0.8, 6);
    expect(result.outputs.sv).toBeCloseTo(70, 6);
    expect(result.outputs.co).toBeCloseTo(5.25, 6);
    expect(result.outputs.ef).toBeCloseTo((70 / 120) * 100, 6);
  });

  it("систола и диастола в сумме дают цикл", () => {
    const result = sim("cardiac-cycle").compute({ hr: 150, edv: 130, esv: 40, sysBP: 120, diaBP: 80 });
    expect(result.outputs.sysDur + result.outputs.diaDur).toBeCloseTo(result.outputs.cycleDur, 6);
    expect(result.outputs.sv).toBeCloseTo(90, 6);
    expect(result.outputs.co).toBeCloseTo(13.5, 6);
  });
});

describe("breathing-cycle", () => {
  it("при ЧД 12 и ДО 500, МП 150: минутная 6000, альвеолярная 4200 мл/мин", () => {
    const result = sim("breathing-cycle").compute({ rr: 12, tv: 500, dead: 150, fio2: 21, paco2: 40 });
    expect(result.outputs.ventMinute).toBeCloseTo(6000, 6);
    expect(result.outputs.ventAlv).toBeCloseTo(4200, 6);
    expect(result.outputs.ventDead).toBeCloseTo(1800, 6);
  });

  it("PAO₂ по уравнению альвеолярного воздуха: 0.21·713 − 40/0.8 ≈ 99.7 мм рт. ст.", () => {
    const result = sim("breathing-cycle").compute({ rr: 12, tv: 500, dead: 150, fio2: 21, paco2: 40 });
    expect(result.outputs.pao2).toBeCloseTo(0.21 * (760 - 47) - 40 / 0.8, 6);
  });

  it("при ДО ≤ мёртвому пространству есть предупреждение", () => {
    const result = sim("breathing-cycle").compute({ rr: 12, tv: 150, dead: 150, fio2: 21, paco2: 40 });
    expect(result.warning).toBeDefined();
    expect(result.outputs.ventAlv).toBe(0);
  });
});

describe("kidney-filtration", () => {
  it("при Pгл 60, Pкап 18, Pонк 30: движущая сила 12, СКФ 150 мл/мин", () => {
    const result = sim("kidney-filtration").compute({ pgc: 60, pbs: 18, pi: 30, rpf: 660 });
    expect(result.outputs.netPressure).toBeCloseTo(12, 6);
    expect(result.outputs.gfr).toBeCloseTo(150, 6);
    expect(result.outputs.ff).toBeCloseTo((150 / 660) * 100, 6);
    // Диурез: 150·0.01 мл/мин · 1440 мин / 1000 = 2.16 л/сут
    expect(result.outputs.urineDay).toBeCloseTo(2.16, 6);
  });

  it("при нулевой движущей силе фильтрация прекращается", () => {
    const result = sim("kidney-filtration").compute({ pgc: 40, pbs: 20, pi: 20, rpf: 660 });
    expect(result.outputs.netPressure).toBe(0);
    expect(result.outputs.gfr).toBe(0);
    expect(result.warning).toBeDefined();
  });
});

describe("diffusion-fick", () => {
  it("поток J = D·A·ΔC/d при дефолтных параметрах", () => {
    const result = sim("diffusion-fick").compute({ d: 1.8e-5, area: 10, deltaC: 0.2, thickness: 0.5 });
    // ΔC = 0.2 мМ = 0.2e-6 моль/см³; d = 0.5 мкм = 0.5e-4 см
    const expected = (1.8e-5 * 10 * 0.2e-6) / 0.5e-4; // моль/с
    expect(result.outputs.fluxNmol).toBeCloseTo(expected * 1e9, 3);
    expect(result.outputs.fluxNmol).toBeCloseTo(720, 3);
    // τ = d²/(2D) = (0.5e-4)² / (3.6e-5) ≈ 6.94e-5 с = 0.0694 мс
    expect(result.outputs.tauMs).toBeCloseTo((0.5e-4 * 0.5e-4) / (2 * 1.8e-5) * 1000, 4);
  });

  it("удвоение толщины вдвое уменьшает поток", () => {
    const thin = sim("diffusion-fick").compute({ d: 1.8e-5, area: 10, deltaC: 0.2, thickness: 0.5 });
    const thick = sim("diffusion-fick").compute({ d: 1.8e-5, area: 10, deltaC: 0.2, thickness: 1 });
    expect(thick.outputs.fluxNmol).toBeCloseTo(thin.outputs.fluxNmol / 2, 3);
  });

  it("при очень большом потоке есть предупреждение о нереалистичности", () => {
    const result = sim("diffusion-fick").compute({ d: 1e-4, area: 100, deltaC: 5, thickness: 0.2 });
    expect(result.warning).toBeDefined();
  });
});
