import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { computeCalculator, getCalculator, listCalculators, CalculatorValidationError } from "../src/calculators.js";

function request(path, options = {}) {
  return new Request(`https://api-shadow.example.test${path}`, options);
}

test("calculator catalog matches the PHP list projection and creates grouped categories", () => {
  const items = listCalculators();
  assert.equal(items.length, 8);
  assert.deepEqual(items.map((item) => item.id), [
    "bmi", "bsa", "ckd_epi_2021", "cockcroft_gault",
    "anion_gap", "corrected_calcium", "serum_osmolality", "infusion_rate",
  ]);
  assert.equal(items.find((item) => item.id === "anion_gap").fields.find((field) => field.key === "albumin").optional, true);
  assert.deepEqual(getCalculator("missing"), null);
  assert.equal(getCalculator("bmi").name, "Индекс массы тела (ИМТ)");
});

test("BMI and Mosteller calculators return PHP-compatible keys and rounding", () => {
  const bmi = computeCalculator("bmi", { weight_kg: 70, height_cm: 175 });
  assert.deepEqual(bmi.result, { "ИМТ": 22.86 });
  assert.equal(bmi.interpretation, "Диапазон 18.5–24.9.");
  assert.deepEqual(bmi.warnings, []);

  const bsa = computeCalculator("bsa", { weight_kg: 70, height_cm: 175 });
  assert.deepEqual(bsa.result, { "ППТ, м²": 1.84 });
  assert.equal(bsa.interpretation, "Формула Mosteller, справочный расчёт.");
});

test("CKD-EPI 2021 and Cockcroft–Gault formulas return positive estimates", () => {
  const egfr = computeCalculator("ckd_epi_2021", { age: 50, creatinine_mg_dl: 0.8, sex: "female" });
  assert.ok(egfr.result["СКФ, мл/мин/1.73 м²"] > 0);
  assert.match(egfr.interpretation, /CKD-EPI 2021/);

  const crcl = computeCalculator("cockcroft_gault", { age: 50, weight_kg: 70, creatinine_mg_dl: 1, sex: "male" });
  assert.deepEqual(crcl.result, { "CrCl, мл/мин": 87.5 });
});

test("anion gap, albumin correction and osmolality preserve PHP output shape", () => {
  const gap = computeCalculator("anion_gap", { sodium: 140, chloride: 100, bicarbonate: 24, albumin: 4 });
  assert.deepEqual(gap.result, { "Анионная разница": 16, "AG с поправкой на альбумин": 16 });

  const noAlbumin = computeCalculator("anion_gap", { sodium: 140, chloride: 100, bicarbonate: 24 });
  assert.deepEqual(noAlbumin.result, { "Анионная разница": 16 });

  const osm = computeCalculator("serum_osmolality", { sodium: 140, glucose_mg_dl: 90, bun_mg_dl: 14 });
  assert.deepEqual(osm.result, { "Расчётная осмолярность, мОсм/кг": 290 });
});

test("corrected calcium and infusion-rate calculators produce expected results", () => {
  const calcium = computeCalculator("corrected_calcium", { calcium_mg_dl: 8.5, albumin_g_dl: 3 });
  assert.deepEqual(calcium.result, { "Скорректированный Ca, мг/дл": 9.3 });

  const infusion = computeCalculator("infusion_rate", { volume_ml: 1000, time_hours: 8, drop_factor: 20 });
  assert.deepEqual(infusion.result, { "мл/ч": 125, "капель/мин": 42 });
});

test("calculator validation rejects missing/non-numeric values and invalid clinical inputs", () => {
  assert.throws(() => computeCalculator("bmi", { weight_kg: 70 }), CalculatorValidationError);
  assert.throws(() => computeCalculator("bmi", { weight_kg: 70, height_cm: 0 }), /Рост должен быть больше нуля/);
  assert.throws(() => computeCalculator("ckd_epi_2021", { age: 17, creatinine_mg_dl: 0.8, sex: "female" }), /Проверьте возраст/);
  assert.throws(() => computeCalculator("cockcroft_gault", { age: 50, weight_kg: 70, creatinine_mg_dl: 1, sex: "other" }), /Проверьте входные данные/);
  assert.throws(() => computeCalculator("infusion_rate", { volume_ml: 1000, time_hours: 0, drop_factor: 20 }), /Время и капельный фактор/);
  assert.throws(() => computeCalculator("bsa", { weight_kg: "not-a-number", height_cm: 175 }), /должно быть числом/);
  assert.throws(() => computeCalculator("unknown", {}), /Калькулятор не найден/);
});

test("calculator endpoints require a verified bearer token", async () => {
  const env = {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  };
  for (const path of ["/api/v1/calculators", "/api/v1/calculators/bmi"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED");
  }

  const compute = await worker.fetch(request("/api/v1/calculators/bmi/compute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ weight_kg: 70, height_cm: 175 }),
  }), env);
  assert.equal(compute.status, 401);
  assert.equal((await compute.json()).error.code, "UNAUTHORIZED");
});

test("calculator methods are guarded explicitly", async () => {
  const listPost = await worker.fetch(request("/api/v1/calculators", { method: "POST" }), {});
  assert.equal(listPost.status, 405);
  assert.equal(listPost.headers.get("allow"), "GET, OPTIONS");

  const detailPost = await worker.fetch(request("/api/v1/calculators/bmi", { method: "POST" }), {});
  assert.equal(detailPost.status, 405);
  assert.equal(detailPost.headers.get("allow"), "GET, OPTIONS");

  const computeGet = await worker.fetch(request("/api/v1/calculators/bmi/compute"), {});
  assert.equal(computeGet.status, 405);
  assert.equal(computeGet.headers.get("allow"), "POST, OPTIONS");
});
