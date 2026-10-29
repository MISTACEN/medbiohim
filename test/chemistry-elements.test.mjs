import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/**
 * Контракт H3: таблица 118 элементов строится из снимка
 * `src/data/chemical-elements.json`, а не из захардкоженных в компонентах
 * значений; снимок обязан декларировать источник, лицензию и дату.
 */
const ROOT = new URL("../", import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), "utf8");
const readJson = (relative) => JSON.parse(read(relative));

const dataset = readJson("src/data/chemical-elements.json");
const elements = dataset.elements;
const libSource = read("src/lib/elements.ts");
const tableSource = read("src/components/chemistry/PeriodicTable.tsx");
const pageSource = read("src/app/chemistry/elements/page.tsx");
const chemistryIndexSource = read("src/app/chemistry/page.tsx");

test("снимок содержит ровно 118 элементов с непрерывными номерами", () => {
  assert.equal(dataset.meta.elementCount, 118);
  assert.equal(elements.length, 118);

  const numbers = elements.map((element) => element.number).sort((a, b) => a - b);
  assert.deepEqual(
    numbers,
    Array.from({ length: 118 }, (_, index) => index + 1),
    "атомные номера должны быть непрерывны 1..118"
  );

  const symbols = new Set(elements.map((element) => element.symbol));
  assert.equal(symbols.size, 118, "символы элементов должны быть уникальны");
});

test("у каждого элемента есть обязательные проверяемые поля", () => {
  const required = [
    "number",
    "symbol",
    "name_en",
    "name_ru",
    "atomic_mass",
    "group",
    "period",
    "category",
    "electron_configuration",
    "xpos",
    "ypos",
    "wikidata",
    "wikipedia",
  ];

  for (const element of elements) {
    for (const key of required) {
      assert.ok(
        element[key] !== undefined && element[key] !== null && element[key] !== "",
        `элемент №${element.number}: поле ${key} пустое`
      );
    }
    assert.match(element.symbol, /^[A-Z][a-z]?$/);
    assert.match(element.name_ru, /[А-Яа-яЁё]/, `элемент №${element.number}: name_ru без кириллицы`);
    assert.ok(element.atomic_mass > 0, `элемент №${element.number}: масса`);
    assert.ok(Number.isInteger(element.group) && element.group >= 1 && element.group <= 18);
    assert.ok(Number.isInteger(element.period) && element.period >= 1 && element.period <= 7);
    assert.ok(Number.isInteger(element.xpos) && element.xpos >= 1 && element.xpos <= 18);
    assert.ok([9, 10].includes(element.ypos) || (element.ypos >= 1 && element.ypos <= 7));
  }
});

test("снимок декларирует source, attribution, лицензию и дату", () => {
  assert.match(dataset.meta.source, /^https:\/\//);
  assert.ok(dataset.meta.license.length > 10, "лицензия должна быть указана текстом");
  assert.ok(dataset.meta.attribution.length > 10, "атрибуция обязательна");
  assert.match(dataset.meta.snapshotDate, /^\d{4}-\d{2}-\d{2}$/);

  assert.ok(Array.isArray(dataset.meta.sources) && dataset.meta.sources.length >= 2);
  const primary = dataset.meta.sources.find((source) => source.role === "primary");
  assert.ok(primary, "нужен основной источник данных");
  assert.match(primary.url, /^https:\/\//);
  assert.match(primary.commit, /^[0-9a-f]{40}$/, "снимок привязан к коммиту источника");
  assert.ok(primary.license.length > 5);
  assert.match(primary.retrieved, /^\d{4}-\d{2}-\d{2}$/);

  const verification = dataset.meta.sources.find((source) => source.role === "verification");
  assert.ok(verification, "нужен независимый источник для сверки");
  assert.match(verification.url, /pubchem/i);
});

test("отчёт о сверке приложен к снимку", () => {
  const verification = dataset.meta.verification;
  assert.equal(verification.symbolMatches, 118);
  assert.equal(verification.independentSource.includes("pubchem"), true);
  assert.ok(verification.massTolerance > 0);
  assert.ok(verification.massWithinTolerance > 0);
  assert.ok(Array.isArray(verification.samples) && verification.samples.length >= 4);
  for (const sample of verification.samples) {
    assert.ok(elements.some((element) => element.number === sample.number));
    assert.equal(sample.symbolMatch, true);
  }
});

test("библиотека читает снимок JSON, а не хардкодит элементы", () => {
  assert.match(libSource, /@\/data\/chemical-elements\.json/, "lib/elements.ts импортирует снимок");
  assert.match(libSource, /validateElementsDataset/, "валидатор объявлен в библиотеке");
  assert.match(libSource, /export const chemicalElements/, "элементы экспортируются из библиотеки");
  assert.match(libSource, /searchElements/, "поиск реализован в библиотеке");
  assert.match(libSource, /CATEGORY_LABELS_RU/, "русские названия категорий в библиотеке");

  // Литеральных данных элементов в коде библиотеки быть не должно.
  assert.doesNotMatch(libSource, /name_en:\s*"/);
  assert.doesNotMatch(libSource, /name_ru:\s*"/);
  assert.doesNotMatch(libSource, /atomic_mass:\s*\d/);
});

test("компонент таблицы строится из данных библиотеки", () => {
  assert.match(tableSource, /from "@\/lib\/elements"/);
  assert.match(tableSource, /chemicalElements\.map/, "ячейки строятся из массива данных");
  assert.match(tableSource, /aria-label=\{elementAriaLabel\(element\)\}/, "у ячеек есть доступные подписи");
  assert.match(tableSource, /role="dialog"/, "карточка элемента — доступный диалог");
  assert.doesNotMatch(tableSource, /"Hydrogen"|"Железо"|"Uranium"/, "в компоненте нет захардкоженных элементов");
  assert.doesNotMatch(tableSource, /atomic_mass:\s*\d/);
});

test("страница /chemistry/elements отдаёт таблицу, а /chemistry ссылается на неё", () => {
  assert.ok(existsSync(new URL("src/app/chemistry/elements/page.tsx", ROOT)), "маршрут таблицы существует");
  assert.match(pageSource, /from "@\/components\/chemistry\/PeriodicTable"/);
  assert.match(pageSource, /<PeriodicTable/);
  assert.match(chemistryIndexSource, /href="\/chemistry\/elements"/, "вход в таблицу есть со страницы химии");
});
