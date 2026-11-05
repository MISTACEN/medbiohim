/**
 * Предметные связи реестра модулей (§19 задания агента №2) и математика
 * симуляции Na⁺/K⁺-АТФазы. Проверяются только фактические правила:
 * один инструмент — одна реализация; дубли дисциплин не создают дублей
 * инструментов; предметы без slug не теряют инструменты; нерелевантные
 * инструменты не показываются.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Реестр модулей использует tsconfig-алиасы "@/..." — подключаем тестовый резолвер
// до динамического импорта (статические импорты поднялись бы раньше хука).
register("./alias-resolver.mjs", import.meta.url);

const { LEARNING_MODULES, modulesForSubject, moduleById, moduleHref, resolveSubjectAreaKey, relationFor } = await import("../src/lib/learning/modules.ts");
const { SIMULATIONS, getSimulation } = await import("../src/lib/sim/catalog.ts");
const { SODIUM_PUMP_SIMULATION, pumpActivityFactor } = await import("../src/lib/sim/sodium-pump.ts");
const { evaluate, defaultParams } = await import("../src/lib/sim/engine.ts");

test("каждая симуляция зарегистрирована в реестре ровно одним модулем", () => {
  for (const simulation of SIMULATIONS) {
    const matches = LEARNING_MODULES.filter((m) => m.simulationSlug === simulation.slug);
    assert.equal(matches.length, 1, `симуляция ${simulation.slug} должна быть в реестре один раз`);
    assert.equal(moduleById(`sim.${simulation.slug}`)?.base.includes("/labs/simulations"), true);
  }
  // Новая обязательная симуляция существует и доступна по slug.
  assert.ok(getSimulation("sodium-potassium-pump"), "Na⁺/K⁺-АТФаза должна быть в каталоге");
});

test("химические модули доступны во всех химических дисциплинах", () => {
  const chemistryAreas = ["chemistry_organic_physical", "inorganic_chemistry"];
  for (const area of chemistryAreas) {
    const titles = modulesForSubject(area).map((m) => m.id);
    for (const required of ["chemistry.elements", "chemistry.workbench", "chemistry.solutions", "chemistry.lab"]) {
      assert.ok(titles.includes(required), `${required} должен быть доступен в ${area}`);
    }
  }
});

test("химические инструменты доступны в биохимии с обоснованием связи", () => {
  const solutions = modulesForSubject("biochemistry").find((m) => m.id === "chemistry.solutions");
  assert.ok(solutions, "Растворы и pH должны быть доступны в биохимии");
  const relation = relationFor(solutions, "biochemistry");
  assert.ok(relation && relation.reason.length > 10, "у связи должно быть объяснение, а не голое совпадение");
  assert.ok(relation.topics.length > 0, "должны быть указаны темы");
});

test("Na⁺/K⁺-АТФаза доступна в физиологии и смежных, но не в неорганической химии", () => {
  const pump = moduleById("sim.sodium-potassium-pump");
  assert.ok(pump, "модуль насоса должен быть в реестре");
  assert.equal(relationFor(pump, "physiology")?.level, 1, "в физиологии — основной уровень");
  assert.ok(relationFor(pump, "pharmacology"), "гликозиды — доказанная фармакологическая связь");
  assert.ok(relationFor(pump, "biophysics"), "электрогенный транспорт — биофизика");
  assert.ok(!modulesForSubject("inorganic_chemistry").some((m) => m.id === "sim.sodium-potassium-pump"), "насос не должен показываться в неорганической химии");
});

test("нерелевантные инструменты не показываются", () => {
  const inorganicIds = modulesForSubject("inorganic_chemistry").map((m) => m.id);
  assert.ok(!inorganicIds.includes("sim.hardy-weinberg"), "популяционная генетика не нужна в неорганической химии");
  assert.ok(!inorganicIds.includes("sim.oxygen-hemoglobin"), "оксигемоглобин не показывается в неорганической химии");
});

test("предметы без slug распознаются по названию и префиксу", () => {
  // Биохимия часто приходит без slug — резолвим по нормализованному названию.
  assert.equal(resolveSubjectAreaKey({ slug: null, name: "Биохимия" }), "biochemistry");
  assert.equal(resolveSubjectAreaKey({ slug: null, name: "биохимия " }), "biochemistry");
  // Префиксное совпадение не путает «физиологию» и «патофизиологию».
  assert.equal(resolveSubjectAreaKey({ slug: null, name: "Патологическая физиология" }), "pathophysiology");
  assert.equal(resolveSubjectAreaKey({ slug: null, name: "Физиология" }), "physiology");
  // Неизвестный предмет — null: чужие инструменты показывать нельзя.
  assert.equal(resolveSubjectAreaKey({ slug: null, name: "Древнеримская литература" }), null);
});

test("дубли дисциплин не создают дублей модулей: дедупликация по id", () => {
  const ids = modulesForSubject("biochemistry").map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "ids должны быть уникальны");
});

test("один инструмент — одна реализация: контекст передаётся параметрами маршрута", () => {
  const module = moduleById("sim.sodium-potassium-pump");
  assert.ok(module);
  const fromPhysiology = moduleHref(module, { subjectKey: "physiology", topic: "Мембранный потенциал" });
  const fromPharmacology = moduleHref(module, { subjectKey: "pharmacology", topic: "Сердечные гликозиды" });
  // База маршрута одна, различается только контекст query — копий инструмента нет.
  assert.ok(fromPhysiology.startsWith("/labs/simulations?slug=sodium-potassium-pump"));
  assert.ok(fromPharmacology.startsWith("/labs/simulations?slug=sodium-potassium-pump"));
  assert.notEqual(fromPhysiology, fromPharmacology);
  // Без контекста — чистый base.
  assert.equal(moduleHref(module, {}), module.base);
});

test("прогресс инструмента не зависит от предмета, из которого открыли", () => {
  for (const simulation of SIMULATIONS) {
    const module = moduleById(`sim.${simulation.slug}`);
    assert.equal(module?.progressKey, `sim.${simulation.slug}`);
  }
});

// ---- Математика Na⁺/K⁺-АТФазы ----

test("фактор активности насоса: калиемия и блокада", () => {
  const defaultFactor = pumpActivityFactor(4.5, 0);
  assert.ok(Math.abs(defaultFactor - 4.5 / 5.5) < 1e-9, "при 4.5 мМ активность = kOut/(kM+kOut)");
  assert.equal(pumpActivityFactor(0.5, 0) < defaultFactor, true, "гипокалиемия снижает активность");
  assert.equal(pumpActivityFactor(4.5, 1), 0, "полная блокада останавливает насос");
  assert.equal(pumpActivityFactor(10, 0), 10 / 11, "высокая калиемия → почти максимум");
});

test("расчёт симуляции насоса: стехиометрия 3Na/2K/1АТФ и электрогенность", () => {
  const params = defaultParams(SODIUM_PUMP_SIMULATION);
  const result = evaluate(SODIUM_PUMP_SIMULATION, params);
  const activity = result.outputs.pumpActivity;
  const cycles = result.outputs.cyclesPerUm2S;
  // 500 насосов × 10 циклов/с × фактор 4.5/5.5
  assert.ok(Math.abs(cycles - 500 * 10 * (4.5 / 5.5)) < 1, "циклов/с на мкм² считается от плотности и скорости");
  assert.ok(Math.abs(result.outputs.naOutPerMin - 3 * cycles * 60) < 1e-6, "3 Na⁺ за цикл");
  assert.ok(Math.abs(result.outputs.kInPerMin - 2 * cycles * 60) < 1e-6, "2 K⁺ за цикл");
  assert.ok(Math.abs(result.outputs.atpPerMin - cycles * 60) < 1e-6, "1 АТФ за цикл");
  assert.ok(result.outputs.emPump < 0, "электрогенный вклад отрицательный (внутрь клетки)");
  assert.ok(Math.abs(result.outputs.emPump + 8 * (activity / 100)) < 0.01, "вклад масштабируется от ~8 мВ при норме");
  assert.ok(activity > 70 && activity < 90, "при нормокалиемии активность 70–90% от максимума");
});

test("блокада гликозидами останавливает насос и убирает электрогенный вклад", () => {
  const result = evaluate(SODIUM_PUMP_SIMULATION, { density: 500, atpRate: 10, kOut: 4.5, ouabain: 100 });
  // -8 × 0 может дать -0 — сравниваем по модулю.
  assert.equal(Math.abs(result.outputs.cyclesPerUm2S), 0);
  assert.equal(Math.abs(result.outputs.naOutPerMin), 0);
  assert.equal(Math.abs(result.outputs.emPump), 0);
  assert.ok(result.warning, "при полной блокаде должно быть клиническое предупреждение");
});

test("экзаменационный вопрос симуляции корректен", () => {
  assert.equal(SODIUM_PUMP_SIMULATION.check.correctIndex, 1);
  assert.ok(SODIUM_PUMP_SIMULATION.check.options.length >= 4);
  assert.equal(SODIUM_PUMP_SIMULATION.steps.length, 8, "цикл Поста–Альберса — 8 этапов");
});
