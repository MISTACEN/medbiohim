/**
 * Контрактный тест реестра типов вопросов (этап B целевой архитектуры).
 *
 * Проверяет, что реестр типов не расходится с двумя источниками истины:
 *  - серверный канон `integrations/cloudflare-api/src/question-format.js`
 *    (наборы OPEN_TYPES / CLOSED_TYPES и их легаси-написания);
 *  - единая образовательная модель `src/lib/learning/types.ts` (ActivityType).
 *
 * Дополнительно: запись `question-type.registry` в реестре общих компонентов
 * существует и ссылается на живые файлы.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryFile = path.join(root, "src", "lib", "question-types", "registry.ts");
const learningTypesFile = path.join(root, "src", "lib", "learning", "types.ts");
const serverCanonFile = path.join(root, "integrations", "cloudflare-api", "src", "question-format.js");
const componentRegistryFile = path.join(root, "docs", "architecture", "registry", "components.json");

const QUESTION_TYPE_IDS = new Set([
  "single_choice",
  "multiple_choice",
  "true_false",
  "numeric",
  "short_text",
  "formula",
  "ordering",
  "matching",
  "open_text",
  "image_hotspot",
  "clinical_case",
  "structure_formula",
  "lab_experiment",
]);

async function loadRegistryModule() {
  // registry.ts импортирует только типы — Node стирает их и модуль загружается.
  return import(pathToFileURL(registryFile).href);
}

/** Строки из литерала массива/Set в исходнике JS/TS. */
function quotedBetween(source, startPattern, endPattern) {
  const start = source.indexOf(startPattern);
  assert.ok(start >= 0, `не найден фрагмент ${startPattern}`);
  const from = start + startPattern.length;
  const end = source.indexOf(endPattern, from);
  assert.ok(end > from, `не найден конец фрагмента ${startPattern}`);
  const chunk = source.slice(from, end);
  return [...chunk.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

test("реестр типов загружается и содержит допустимые записи", async () => {
  const registry = await loadRegistryModule();
  assert.ok(Array.isArray(registry.QUESTION_TYPES) && registry.QUESTION_TYPES.length > 0);
  const ids = new Set();
  for (const descriptor of registry.QUESTION_TYPES) {
    assert.ok(QUESTION_TYPE_IDS.has(descriptor.id), `неизвестный id типа: ${descriptor.id}`);
    assert.ok(!ids.has(descriptor.id), `повторяющийся id типа: ${descriptor.id}`);
    ids.add(descriptor.id);
    assert.ok(descriptor.label && descriptor.shortLabel, `${descriptor.id}: нужны label и shortLabel`);
    assert.ok(["closed", "open", "unsupported"].includes(descriptor.kind), `${descriptor.id}: недопустимый kind`);
    assert.ok(["closed", "open", "none"].includes(descriptor.grading), `${descriptor.id}: недопустимая политика проверки`);
    assert.equal(typeof descriptor.inActivityModel, "boolean", `${descriptor.id}: inActivityModel должен быть boolean`);
  }
  assert.equal(registry.QUESTION_TYPE_IDS.length, ids.size);
});

test("каждое серверное написание типа разрешается реестром", async () => {
  const source = await readFile(serverCanonFile, "utf8");
  const openTypes = quotedBetween(source, "const OPEN_TYPES = new Set([", "]);");
  const closedTypes = quotedBetween(source, "const CLOSED_TYPES = new Set([", "]);");
  assert.ok(openTypes.length > 0 && closedTypes.length > 0, "наборы типов сервера должны читаться");

  const registry = await loadRegistryModule();
  for (const alias of [...openTypes, ...closedTypes]) {
    const descriptor = registry.resolveQuestionType(alias);
    assert.ok(descriptor, `серверный алиас без соответствия в реестре: ${alias}`);
  }
});

test("все типы ActivityType покрыты реестром", async () => {
  const source = await readFile(learningTypesFile, "utf8");
  const union = quotedBetween(source, "export type ActivityType =", ";");
  assert.ok(union.length >= 10, `ожидался список типов активности, найдено ${union.length}`);

  const registry = await loadRegistryModule();
  for (const type of union) {
    const descriptor = registry.resolveQuestionType(type);
    assert.ok(descriptor, `ActivityType без соответствия в реестре: ${type}`);
    assert.equal(descriptor.inActivityModel, true, `${type}: inActivityModel должен быть true`);
  }
});

test("алиасы не пересекаются между типами", async () => {
  const registry = await loadRegistryModule();
  const owners = new Map();
  for (const descriptor of registry.QUESTION_TYPES) {
    for (const alias of [descriptor.id, ...descriptor.aliases]) {
      const key = registry.normalizeTypeKey(alias);
      const owner = owners.get(key);
      assert.ok(!owner || owner === descriptor.id, `алиас ${key} принадлежит и ${owner}, и ${descriptor.id}`);
      owners.set(key, descriptor.id);
    }
  }
});

test("запись question-type.registry существует и ссылается на живые файлы", async () => {
  const raw = await readFile(componentRegistryFile, "utf8");
  const registry = JSON.parse(raw);
  const entry = registry.components.find((item) => item.id === "question-type.registry");
  assert.ok(entry, "в реестре общих компонентов нужна запись question-type.registry");
  assert.equal(entry.type, "question-type");
  assert.ok(Array.isArray(entry.code_paths) && entry.code_paths.length > 0);
  for (const rel of entry.code_paths) {
    await stat(path.join(root, rel)).catch(() => {
      assert.fail(`question-type.registry: файл не найден — ${rel}`);
    });
  }
});
