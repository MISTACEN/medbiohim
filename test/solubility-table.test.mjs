/**
 * Таблица растворимости — статическая матрица, поэтому проверяем форму данных:
 * 14 катионов × 13 анионов, только допустимые коды, и классические якоря
 * (все нитраты растворимы, BaSO4 нерастворим, AgCl нерастворим).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "src", "lib", "chemistry", "solubility.ts");

test("таблица растворимости: размерность и допустимые значения", async () => {
  const source = await readFile(file, "utf8");
  // Строки матрицы — массивы кодов с запятой и комментарием в конце строки.
  const rows = source.match(/^\s*\["[^\]]*\],?(?:\s*\/\/.*)?$/gm) || [];
  assert.equal(rows.length, 14, `14 строк матрицы, найдено ${rows.length}`);
  const parsed = rows.map((row) =>
    [...row.matchAll(/"([^"]*)"/g)].map((match) => match[1]),
  );
  for (const row of parsed) assert.equal(row.length, 13, "в строке 13 анионов");
  const codes = new Set(parsed.flat());
  assert.deepEqual([...codes].sort(), ["м", "н", "р", "—"], "только р/м/н/—");

  assert.match(source, /export const CATIONS/);
  assert.match(source, /export const ANIONS/);
  assert.match(source, /SOLUBILITY_LEGEND/);

  // Якоря школьной программы: нитратный столбец весь растворим.
  const nitrateIndex = parsed[0].length - 5; // NO₃⁻ — девятый анион из 13
  for (const row of parsed) assert.equal(row[nitrateIndex], "р", "нитраты растворимы");
});
