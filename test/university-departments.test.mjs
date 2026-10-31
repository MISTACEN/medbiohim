import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(
  (await readFile(new URL("../src/lib/university/departments.ts", import.meta.url), "utf8"))
    .split("export const DEPARTMENTS: DepartmentCatalogEntry[] = ")[1]
    .replace(/;\s*$/, "")
);

test("каталог кафедр: 45 записей, дословные названия и абсолютные URL источника", () => {
  assert.equal(catalog.length, 45);
  for (const item of catalog) {
    assert.ok(item.name.startsWith("Кафедра"), item.name);
    assert.ok(item.url.startsWith("https://www.fesmu.ru/life/department/"), item.url);
    assert.ok(item.slug.length > 3);
  }
  // дубликаты слагов исключены
  const slugs = new Set(catalog.map((item) => item.slug));
  assert.equal(slugs.size, catalog.length);
});

test("UI каталога ищет по подстроке и честно указывает источник", async () => {
  const ui = await readFile(new URL("../src/components/university/DepartmentsCatalog.tsx", import.meta.url), "utf8");
  assert.match(ui, /DEPARTMENTS_CATALOG_SNAPSHOT/);
  assert.match(ui, /fesmu\.ru\/life\/department/);
  assert.match(ui, /toLowerCase\(\)\.includes/);
});
