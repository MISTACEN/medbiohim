/**
 * Биохимические модели (§10) и новые модули реестра (эмбриология, конструктор):
 * честные числа — установленные факты биохимии; предметные связи без выдумок.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./alias-resolver.mjs", import.meta.url);

const { getSimulation, SIMULATIONS } = await import("../src/lib/sim/catalog.ts");
const { LEARNING_MODULES, moduleById, modulesForSubject, relationFor } = await import("../src/lib/learning/modules.ts");

function sim(slug) {
  const definition = getSimulation(slug);
  assert.ok(definition, `симуляция ${slug} должна существовать`);
  return definition;
}

// ————— Гликолиз —————

test("гликолиз: анаэробно 2 АТФ и 2 лактата, аэробно 30–32", () => {
  const model = sim("glycolysis");
  const anaerobic = model.compute({ glucose: 5, oxygen: 0, pfk: 60 });
  assert.equal(anaerobic.outputs.atpPerGlucose, 2);
  assert.equal(anaerobic.outputs.lactatePerGlucose, 2);
  assert.equal(anaerobic.outputs.pyruvateToMito, 0);
  assert.ok(anaerobic.warning, "анаэробный режим должен предупреждать о лактат-ацидозе");

  const aerobic = model.compute({ glucose: 5, oxygen: 100, pfk: 60 });
  assert.ok(aerobic.outputs.atpPerGlucose >= 30 && aerobic.outputs.atpPerGlucose <= 32, "аэробный выход 30–32 АТФ");
  assert.equal(aerobic.outputs.lactatePerGlucose, 0);
  assert.equal(aerobic.outputs.pyruvateToMito, 100);
  assert.equal(aerobic.warning, undefined);
});

test("гликолиз: ФФК-1 тормозит поток — rate-limiting этап", () => {
  const model = sim("glycolysis");
  const full = model.compute({ glucose: 5, oxygen: 100, pfk: 100 });
  const blocked = model.compute({ glucose: 5, oxygen: 100, pfk: 10 });
  assert.ok(blocked.outputs.rate < full.outputs.rate, "поток падает при торможении ФФК-1");
  assert.equal(blocked.outputs.rate, Math.round(full.outputs.rate * 0.1));
});

// ————— Цикл Кребса —————

test("цикл Кребса: 3 NADH + 1 FADH₂ + 1 GTP + 2 CO₂ за оборот", () => {
  const model = sim("krebs-cycle");
  const result = model.compute({ acoa: 1, adp: 60, nadh: 20, calcium: 0 });
  assert.equal(result.outputs.nadhTurn, 3);
  assert.equal(result.outputs.fadh2Turn, 1);
  assert.equal(result.outputs.gtpTurn, 1);
  assert.equal(result.outputs.co2Turn, 2);
});

test("цикл Кребса: высокий NADH тормозит, Са²⁺ ускоряет", () => {
  const model = sim("krebs-cycle");
  const rested = model.compute({ acoa: 1, adp: 20, nadh: 90, calcium: 0 });
  const working = model.compute({ acoa: 1, adp: 90, nadh: 10, calcium: 0 });
  const muscle = model.compute({ acoa: 1, adp: 90, nadh: 10, calcium: 100 });
  assert.ok(rested.outputs.flux < working.outputs.flux, "запас энергии тормозит цикл");
  assert.ok(muscle.outputs.flux > working.outputs.flux, "Са²⁺ усиливает дегидрогеназы при мышечной работе");
});

test("цикл Кребса: 10 АТФ-эквивалентов на ацетил-КоА при максимальном потоке", () => {
  const model = sim("krebs-cycle");
  const max = model.compute({ acoa: 5, adp: 100, nadh: 0, calcium: 100 });
  assert.equal(max.outputs.atpEquivMin, 10, "поток 100% × 10 АТФ-эквивалентов");
});

// ————— Дыхательная цепь —————

test("дыхательная цепь: P/O 2.5 для NADH при полной сопряжённости", () => {
  const model = sim("respiratory-chain");
  const result = model.compute({ nadhFlow: 60, o2: 100, uncoupler: 0, cyanide: 0 });
  assert.ok(Math.abs(result.outputs.poNadh - 2.5) < 0.01);
  assert.ok(result.outputs.atpRate > 0);
  assert.equal(result.outputs.protonLeak, 0);
});

test("дыхательная цепь: разобщение обращает АТФ в тепло", () => {
  const model = sim("respiratory-chain");
  const coupled = model.compute({ nadhFlow: 60, o2: 100, uncoupler: 0, cyanide: 0 });
  const uncoupled = model.compute({ nadhFlow: 60, o2: 100, uncoupler: 100, cyanide: 0 });
  assert.ok(Math.abs(uncoupled.outputs.poNadh) < 0.01, "P/O падает к нулю");
  assert.equal(uncoupled.outputs.protonLeak, 100);
  assert.ok(uncoupled.outputs.heatRate > coupled.outputs.heatRate, "теплопродукция растёт");
  assert.ok(uncoupled.outputs.o2Rate > 0, "транспорт электронов продолжается — O₂ расходуется");
});

test("дыхательная цепь: цианид останавливает весь транспорт электронов", () => {
  const model = sim("respiratory-chain");
  const poisoned = model.compute({ nadhFlow: 60, o2: 100, uncoupler: 0, cyanide: 100 });
  assert.equal(poisoned.outputs.atpRate, 0);
  assert.equal(poisoned.outputs.o2Rate, 0);
  assert.ok(poisoned.warning, "должно быть клиническое предупреждение об отравлении");
});

test("дыхательная цепь: гипоксия уменьшает синтез АТФ", () => {
  const model = sim("respiratory-chain");
  const normoxia = model.compute({ nadhFlow: 60, o2: 100, uncoupler: 0, cyanide: 0 });
  const hypoxia = model.compute({ nadhFlow: 60, o2: 20, uncoupler: 0, cyanide: 0 });
  assert.ok(hypoxia.outputs.atpRate < normoxia.outputs.atpRate);
});

// ————— Контракт и предметные связи —————

test("биохимические модели: 21 симуляция, биохимия видит все три новые", () => {
  assert.equal(SIMULATIONS.length, 21);
  for (const slug of ["glycolysis", "krebs-cycle", "respiratory-chain"]) {
    const record = moduleById(`sim.${slug}`);
    assert.ok(record, `${slug} должен быть в реестре`);
    assert.equal(relationFor(record, "biochemistry")?.level, 1, `${slug} — основной модуль биохимии`);
    assert.ok(record.related && record.related.length > 0, `${slug} должен предлагать связанные инструменты (§10)`);
    // related-ссылки ведут на существующие модули реестра.
    for (const link of record.related ?? []) {
      assert.ok(moduleById(link.id), `related ${link.id} должен существовать в реестре`);
    }
  }
});

test("нерелевантные предметы не получают биохимию", () => {
  const inorganicIds = modulesForSubject("inorganic_chemistry").map((m) => m.id);
  assert.ok(!inorganicIds.includes("sim.glycolysis"));
  assert.ok(!inorganicIds.includes("sim.krebs-cycle"));
  // Токсикология честно получает цепь: цианид.
  assert.ok(modulesForSubject("analytical_toxicology").some((m) => m.id === "sim.respiratory-chain"));
});

test("related-модули биохимии не дублируют симуляцию сами на себя", () => {
  for (const slug of ["glycolysis", "krebs-cycle", "respiratory-chain"]) {
    const record = moduleById(`sim.${slug}`);
    assert.ok(record && !(record.related ?? []).some((link) => link.id === `sim.${slug}`), "модель не ссылается на себя");
  }
});

// ————— Новые модули: эмбриология и конструктор —————

test("эмбриологический таймлайн зарегистрирован для смежных дисциплин", () => {
  const record = moduleById("embryology.timeline");
  assert.ok(record, "модуль эмбриологии должен быть в реестре");
  assert.equal(relationFor(record, "embryology")?.level, 1);
  assert.ok(relationFor(record, "histology"));
  assert.ok(relationFor(record, "cytology"));
  assert.ok(relationFor(record, "biology"));
  // Не показываем там, где он не нужен.
  assert.ok(!modulesForSubject("inorganic_chemistry").some((m) => m.id === "embryology.timeline"));
});

test("конструктор материалов универсален и не дублируется", () => {
  const matches = LEARNING_MODULES.filter((m) => m.id === "constructor.materials");
  assert.equal(matches.length, 1);
  assert.ok(modulesForSubject("biochemistry").some((m) => m.id === "constructor.materials"));
  assert.ok(modulesForSubject("histology").some((m) => m.id === "constructor.materials"));
});
