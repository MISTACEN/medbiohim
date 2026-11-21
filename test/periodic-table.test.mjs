/**
 * Периодическая таблица — данные живут в src/data/chemical-elements.json
 * (источники: Bowserinator + Wikidata + сверка PubChem, см. meta в файле).
 * Проверяем целостность датасета без запуска UI: 118 элементов, номера 1…118
 * без дублей и дыр, символы уникальны, каждая категория датасета имеет
 * русскую подпись в lib/elements.ts (CATEGORY_LABELS_RU).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const datasetPath = path.join(root, "src", "data", "chemical-elements.json");
const elementsSource = path.join(root, "src", "lib", "elements.ts");

test("периодическая таблица: 118 элементов без дублей и дыр", async () => {
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  const elements = dataset.elements;
  assert.equal(Array.isArray(elements), true, "dataset.elements — массив");
  assert.equal(elements.length, 118, "ровно 118 элементов");

  const numbers = elements.map((element) => element.number);
  assert.deepEqual(
    numbers,
    Array.from({ length: 118 }, (_, index) => index + 1),
    "номера идут строго 1…118",
  );

  const symbols = elements.map((element) => element.symbol);
  assert.equal(new Set(symbols).size, 118, "символы уникальны");
  assert.equal(symbols[0], "H");
  assert.equal(symbols[117], "Og");

  const categories = [...new Set(elements.map((element) => element.category))];
  const source = await readFile(elementsSource, "utf8");
  // Ключи в CATEGORY_LABELS_RU бывают и bare (lanthanide: …), и в кавычках
  // ("alkali metal": …) — проверяем оба вида записи.
  const unlabelled = categories.filter(
    (category) =>
      !new RegExp(`(?:\"${category}\"|\\b${category})\\s*:`, "i").test(source),
  );
  assert.deepEqual(
    unlabelled,
    [],
    "каждая категория датасета подписана в CATEGORY_LABELS_RU (lib/elements.ts)",
  );
  assert.match(source, /CATEGORY_LABELS_RU: Record<string, string>/);
  assert.match(source, /CATEGORY_ORDER: string\[\]/);
});
