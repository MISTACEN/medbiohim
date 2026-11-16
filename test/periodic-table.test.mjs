/**
 * Периодическая таблица — статические данные, поэтому проверяем целостность
 * файла без запуска UI: 118 элементов, номера 1…118 без дублей, у каждой
 * категории есть подпись и цвет.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "src", "lib", "chemistry", "periodic-table.ts");

test("периодическая таблица: 118 элементов без дублей и дыр", async () => {
  const source = await readFile(file, "utf8");
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\|[A-Z][a-z]?\|/.test(line));
  assert.equal(lines.length, 118, "ровно 118 строк данных");

  const numbers = lines.map((line) => Number(line.split("|")[0]));
  assert.deepEqual(
    numbers,
    Array.from({ length: 118 }, (_, index) => index + 1),
    "номера идут строго 1…118",
  );

  const symbols = lines.map((line) => line.split("|")[1]);
  assert.equal(new Set(symbols).size, 118, "символы уникальны");
  assert.equal(symbols[0], "H");
  assert.equal(symbols[117], "Og");

  const categories = new Set(lines.map((line) => line.split("|")[6]));
  assert.deepEqual(
    [...categories].sort(),
    ["actinide", "alkali", "alkaline", "halogen", "lanthanide", "metalloid", "noble", "nonmetal", "post", "transition"],
    "все 10 категорий используются",
  );
  assert.match(source, /CATEGORY_LABELS: Record<ElementCategory, string>/);
  assert.match(source, /CATEGORY_COLORS: Record<ElementCategory, string>/);
});
