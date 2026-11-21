// Архивные конспекты (public/content/portals/lectures-*.json) — статический
// контент, который читают вкладка «Портал» предмета и /search. Тест держит
// инварианты, из-за нарушения которых студент видел «дубли непонятно откуда»:
// повторяющиеся id/названия внутри и между наборами, отсутствующий файл набора.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const PORTALS = new URL("../public/content/portals/", import.meta.url);
const SETS = [
  "bio",
  "math",
  "chem",
  "chem-organic",
  "phys",
  // Конспекты гистологии (источник — учебный архив, подключены через
  // LEGACY_PORTALS.histology → lectures: "hist").
  "hist",
  "latin",
  "english",
  "history",
];

const readSet = (id) => JSON.parse(readFileSync(new URL(`lectures-${id}.json`, PORTALS), "utf8"));

/** То же сравнение, что в ArchiveLectures (src/shared/lectures/lecture-title.ts):
 *  парити-копия — node --test не импортирует .ts, инвариант закреплён тестом ниже. */
const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^(?:тема|неделя|недели)\s*[\d\s.,–\-—/]*/i, "")
    .replace(/(?:лекция|лекции|конспект|практика|семинар)\s*[\d\s.,–\-—/·:]*/gi, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();

test("каждый набор конспектов из LEGACY_PORTALS существует и не пуст", () => {
  for (const id of SETS) {
    const set = readSet(id);
    assert.ok(Array.isArray(set.items) && set.items.length > 0, `lectures-${id}.json: нет items`);
    assert.ok(String(set.subject || "").trim(), `lectures-${id}.json: нет subject`);
  }
});

test("внутри набора нет повторяющихся id и названий", () => {
  for (const id of SETS) {
    const items = readSet(id).items;
    const ids = items.map((item) => String(item.id));
    assert.equal(new Set(ids).size, ids.length, `lectures-${id}.json: повторяющийся id`);
    const titles = items.map((item) => normalize(item.title)).filter(Boolean);
    assert.equal(new Set(titles).size, titles.length, `lectures-${id}.json: повторяющееся название`);
  }
});

test("между наборами нет повторяющихся id", () => {
  const seen = new Map();
  for (const id of SETS) {
    for (const item of readSet(id).items) {
      const key = String(item.id);
      assert.equal(seen.has(key), false, `id ${key} встречается в ${seen.get(key)} и ${id}`);
      seen.set(key, id);
    }
  }
});

test("лента органической химии (chem + chem-organic) не содержит дублей", () => {
  const items = [...readSet("chem").items, ...readSet("chem-organic").items];
  const titles = items.map((item) => normalize(item.title)).filter(Boolean);
  const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index);
  assert.deepEqual(duplicates, [], "в объединённой ленте химии есть повторяющиеся конспекты");
});

test("индекс поиска покрывает ровно все наборы конспектов", () => {
  const index = JSON.parse(readFileSync(new URL("../public/content/lectures-search-index.json", import.meta.url), "utf8"));
  const items = Array.isArray(index) ? index : index.items || [];

  // Раньше сверялось только количество: индекс с тем же числом, но другими
  // записями проходил, и поиск молча вёл на чужие конспекты. Сверяем id и набор.
  // Индекс хранит id как `${setId}:${item.id}` (scripts/build-lectures-search-index.mjs).
  const expected = new Map();
  for (const setId of SETS) {
    for (const item of readSet(setId).items) expected.set(`${setId}:${item.id}`, setId);
  }

  const indexed = new Map();
  for (const item of items) {
    const key = String(item.id);
    assert.equal(indexed.has(key), false, `lectures-search-index.json: повторяющийся id ${key}`);
    assert.equal(expected.has(key), true, `lectures-search-index.json: лишняя запись ${key} — пересоберите scripts/build-lectures-search-index.mjs`);
    indexed.set(key, String(item.setId ?? ""));
  }

  const missing = [...expected.keys()].filter((key) => !indexed.has(key));
  assert.deepEqual(missing, [], `в индексе нет конспектов: ${missing.slice(0, 5).join(", ")}`);

  const wrongSet = [...expected.entries()].filter(([key, setId]) => indexed.get(key) !== setId);
  assert.deepEqual(
    wrongSet.map(([key, setId]) => `${key}: индекс ${indexed.get(key)}, конспект в ${setId}`),
    [],
    "набор в индексе разошёлся с файлом конспектов",
  );

  if (!Array.isArray(index) && "count" in index) {
    assert.equal(index.count, items.length, "поле count разошлось с items");
  }
});

test("лишних файлов lectures-*.json в порталах нет", () => {
  const known = new Set(SETS.map((id) => `lectures-${id}.json`));
  const actual = readdirSync(PORTALS).filter((file) => /^lectures-.*\.json$/.test(file));
  assert.deepEqual(actual.filter((file) => !known.has(file)), [], "набор конспектов не подключён к LEGACY_PORTALS");
});
