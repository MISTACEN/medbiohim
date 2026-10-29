import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  computeCalculator,
  getCalculator,
  listCalculators,
  CalculatorValidationError,
} from "../../../integrations/cloudflare-api/src/calculators.js";

const close = (actual, expected, tolerance = 0.05, label = "") => {
  assert.ok(
    Math.abs(Number(actual) - expected) <= tolerance,
    `${label || "value"}: ${actual} != ${expected} ± ${tolerance}`
  );
};

test("H5 catalog adds ABG, kinetics, ATP and unit-conversion calculators", () => {
  const items = listCalculators();
  const ids = items.map((item) => item.id);
  for (const id of [
    "abg",
    "michaelis_menten",
    "arrhenius",
    "atp_glucose",
    "atp_fatty_acid",
    "concentration_units",
    "pressure_units",
  ]) {
    assert.ok(ids.includes(id), `missing calculator ${id}`);
  }
  assert.equal(new Set(ids).size, ids.length, "calculator ids must be unique");

  const abg = getCalculator("abg");
  assert.ok(abg, "ABG definition exists");
  assert.ok(
    abg.fields.every((field) => typeof field.hint === "string" && field.hint.length > 0),
    "every ABG field carries a Russian unit/reference hint"
  );
  assert.equal(abg.approximate, true, "ABG is marked approximate");
  assert.ok(abg.fields.some((field) => field.key === "albumin_g_dl" && field.optional));
});

test("ABG: metabolic acidosis with appropriate Winter compensation", () => {
  const abg = computeCalculator("abg", {
    ph: 7.2,
    paco2_mm_hg: 25,
    hco3_mmol_l: 10,
    sodium: 138,
    chloride: 100,
    albumin_g_dl: 4,
  });

  assert.equal(abg.result["Первичное нарушение"], "Метаболический ацидоз");
  assert.equal(abg.result["Ожидаемый PaCO₂, мм рт. ст."], "21.0–25.0");
  assert.match(abg.result["Компенсация"], /в пределах ожидаемого/);
  assert.equal(abg.result["Анионная разница"], 28);
  assert.equal(abg.result["AG с поправкой на альбумин"], 28);
  assert.equal(abg.result["Delta ratio"], 1.14);
  assert.equal(abg.result["Base excess (приближ.), ммоль/л"], -17.4);
  assert.equal(abg.approximate, true);
  assert.ok(Array.isArray(abg.notes) && abg.notes.length >= 3, "approximation notes are returned");

  assert.ok(abg.steps.length >= 7, "step-by-step solution is returned");
  for (const entry of abg.steps) {
    assert.equal(typeof entry.label, "string");
    assert.equal(typeof entry.formula, "string");
    assert.equal(typeof entry.value, "string");
  }
  assert.ok(abg.steps.some((entry) => entry.formula.includes("1.5 × HCO₃⁻ + 8")), "Winter formula is shown");
  assert.ok(abg.steps.some((entry) => entry.label.includes("Delta ratio")), "delta ratio step is shown");
});

test("ABG: respiratory alkalosis reports acute/chronic expected HCO3", () => {
  const abg = computeCalculator("abg", { ph: 7.52, paco2_mm_hg: 28, hco3_mmol_l: 21 });
  assert.equal(abg.result["Первичное нарушение"], "Респираторный алкалоз");
  assert.match(abg.result["Ожидаемый HCO₃⁻, ммоль/л"], /21\.6 \(острое\) \/ 19\.2 \(хроническое\)/);
  assert.match(abg.result["Компенсация"], /острому/);
  assert.equal(abg.result["Анионная разница"], undefined, "no AG without electrolytes");
});

test("ABG: normal values produce no compensation formula", () => {
  const abg = computeCalculator("abg", { ph: 7.4, paco2_mm_hg: 40, hco3_mmol_l: 24 });
  assert.equal(abg.result["Первичное нарушение"], "КЩС в пределах референсных значений");
  assert.equal(abg.result["Компенсация"], "не требуется: pH, PaCO₂ и HCO₃⁻ в референсных диапазонах");
  assert.equal(abg.result["Base excess (приближ.), ммоль/л"], -0.4);
  assert.equal(abg.warnings.length, 0);
});

test("ABG: mixed acidosis is flagged and compensation formulas are withheld", () => {
  const abg = computeCalculator("abg", { ph: 7.1, paco2_mm_hg: 60, hco3_mmol_l: 18 });
  assert.equal(abg.result["Первичное нарушение"], "Смешанный ацидоз (метаболический + респираторный)");
  assert.match(abg.result["Компенсация"], /неприменимы/);
});

test("Michaelis–Menten: V = Vmax/2 at [S] = Km and approaches Vmax when S >> Km", () => {
  const half = computeCalculator("michaelis_menten", { substrate: 2, km: 2, vmax: 10 });
  assert.equal(half.result["V, ед. скорости"], 5);
  assert.equal(half.result["V/Vmax, %"], 50);

  const saturated = computeCalculator("michaelis_menten", { substrate: 1e6, km: 1, vmax: 10 });
  close(saturated.result["V, ед. скорости"], 10, 0.001, "saturated V");
  assert.ok(saturated.result["V/Vmax, %"] >= 99.9);

  const firstOrder = computeCalculator("michaelis_menten", { substrate: 0.001, km: 1000, vmax: 10 });
  assert.ok(
    Number(firstOrder.result["V, ед. скорости"]) < 0.0001,
    "S << Km gives nearly linear low rate"
  );

  assert.equal(half.steps.length, 5);
  assert.equal(half.approximate, false);
});

test("Arrhenius: k increases monotonically with temperature and matches exp() at 310 K", () => {
  const compute = (temp) =>
    computeCalculator("arrhenius", { a: 1e13, ea_kj: 80, temp_k: temp }).result["k (в единицах A)"];

  const k300 = compute(300);
  const k310 = compute(310);
  const k320 = compute(320);
  assert.ok(k300 < k310 && k310 < k320, "k(T) is monotonic for Ea > 0");
  close(k310, 0.331403, 0.0005, "k(310 K)");

  const pair = computeCalculator("arrhenius", { a: 1e13, ea_kj: 80, temp_k: 310, temp2_k: 320 });
  assert.ok(pair.result["k₂ / k₁"] > 1);
  assert.equal(pair.result["Ea/(R·T)"], -31.038);
  assert.ok(pair.steps.some((entry) => entry.formula.includes("−Ea / (R·T)")));
});

test("ATP: glucose oxidation yields 30, 32 or the 30–32 range depending on the shuttle", () => {
  const range = computeCalculator("atp_glucose", { shuttle: "range" });
  assert.equal(range.result["АТФ, всего"], "30–32");
  assert.equal(range.approximate, true);

  const malate = computeCalculator("atp_glucose", { shuttle: "malate_aspartate" });
  assert.equal(malate.result["АТФ, всего"], 32);

  const glycerol = computeCalculator("atp_glucose", { shuttle: "glycerol_phosphate" });
  assert.equal(glycerol.result["АТФ, всего"], 30);

  assert.ok(range.steps.some((entry) => entry.formula.includes("NADH")));
  assert.ok(range.notes.some((note) => /P\/O/.test(note)), "P/O spread is explained");
});

test("ATP: palmitate β-oxidation yields the textbook 106 ATP", () => {
  const palmitate = computeCalculator("atp_fatty_acid", { carbons: 16 });
  assert.equal(palmitate.result["Циклов β-окисления"], 7);
  assert.equal(palmitate.result["Ацетил-КоА, шт."], 8);
  assert.equal(palmitate.result["АТФ, всего"], 106);
  assert.equal(palmitate.approximate, true);

  const butyrate = computeCalculator("atp_fatty_acid", { carbons: 4 });
  assert.equal(butyrate.result["Циклов β-окисления"], 1);
  assert.equal(butyrate.result["АТФ, всего"], 22);
});

test("unit conversions: known coefficients and round-trip within display precision", () => {
  const glucose = computeCalculator("concentration_units", { analyte: "glucose", direction: "to_si", value: 90 });
  close(glucose.result["Результат, ммоль/л"], 4.996, 0.001, "glucose 90 mg/dL");
  const glucoseBack = computeCalculator("concentration_units", {
    analyte: "glucose",
    direction: "from_si",
    value: glucose.result["Результат, ммоль/л"],
  });
  close(glucoseBack.result["Результат, mg/dL"], 90, 0.02, "glucose round-trip");

  const cholesterol = computeCalculator("concentration_units", {
    analyte: "cholesterol",
    direction: "to_si",
    value: 200,
  });
  close(cholesterol.result["Результат, ммоль/л"], 5.172, 0.001, "cholesterol 200 mg/dL");

  const urea = computeCalculator("concentration_units", { analyte: "urea", direction: "to_si", value: 36 });
  close(urea.result["Результат, ммоль/л"], 5.994, 0.001, "urea 36 mg/dL");
  assert.ok(urea.notes.some((note) => note.includes("BUN")), "urea vs BUN difference is explained");

  const creatinine = computeCalculator("concentration_units", {
    analyte: "creatinine",
    direction: "to_si",
    value: 1,
  });
  close(creatinine.result["Результат, ммоль/л"], 0.088, 0.001, "creatinine 1 mg/dL");

  const pressure = computeCalculator("pressure_units", { direction: "mmhg_to_kpa", value: 120 });
  close(pressure.result["Результат, кПа"], 15.999, 0.001, "120 mmHg to kPa");
  const pressureBack = computeCalculator("pressure_units", {
    direction: "kpa_to_mmhg",
    value: pressure.result["Результат, кПа"],
  });
  close(pressureBack.result["Результат, мм рт. ст."], 120, 0.01, "pressure round-trip");
});

test("existing calculators now return steps without changing their result keys", () => {
  const bmi = computeCalculator("bmi", { weight_kg: 70, height_cm: 175 });
  assert.deepEqual(bmi.result, { "ИМТ": 22.86 });
  assert.ok(bmi.steps.length >= 3);
  assert.deepEqual(bmi.warnings, []);

  const anionGap = computeCalculator("anion_gap", { sodium: 140, chloride: 100, bicarbonate: 24 });
  assert.deepEqual(anionGap.result, { "Анионная разница": 16 });
  assert.ok(anionGap.steps.some((entry) => entry.formula.includes("AG =")));
});

test("validation returns Russian 422 messages and rejects non-physiological input", () => {
  assert.throws(() => computeCalculator("abg", {}), /Поле «pH» обязательно/);
  assert.throws(
    () => computeCalculator("abg", { ph: 9, paco2_mm_hg: 40, hco3_mmol_l: 24 }),
    /pH должен быть в диапазоне/
  );
  assert.throws(
    () => computeCalculator("abg", { ph: 7.4, paco2_mm_hg: 40, hco3_mmol_l: 24, albumin_g_dl: 0 }),
    /Альбумин должен быть в диапазоне/
  );
  assert.throws(
    () => computeCalculator("michaelis_menten", { substrate: 1, km: 0, vmax: 10 }),
    /Km должна быть больше нуля/
  );
  assert.throws(
    () => computeCalculator("arrhenius", { a: 1, ea_kj: 50, temp_k: 0 }),
    /Температура должна быть в диапазоне/
  );
  assert.throws(
    () => computeCalculator("atp_fatty_acid", { carbons: 15 }),
    /только чётные цепи/
  );
  assert.throws(
    () => computeCalculator("concentration_units", { analyte: "unknown", direction: "to_si", value: 1 }),
    /Выберите показатель/
  );
  assert.throws(
    () => computeCalculator("pressure_units", { direction: "mmhg_to_kpa", value: -1 }),
    /не может быть отрицательным/
  );
  assert.throws(() => computeCalculator("abg", null), /Некорректные входные данные/);
  assert.throws(() => computeCalculator("unknown", {}), CalculatorValidationError);
});

test("worker route maps CalculatorValidationError to an honest 422 response", async () => {
  const route = await readFile(new URL("../src/routes/calculators.ts", import.meta.url), "utf8");
  assert.match(route, /CalculatorValidationError/);
  assert.match(route, /fail\("VALIDATION", \(error as Error\)\.message, 422, rid\)/);
  assert.doesNotMatch(route, /ok\(\{\s*items:\s*\[\]\s*\}\)/);
});
