/**
 * Контрактный тест реестра общих компонентов (этап A целевой архитектуры).
 *
 * Проверяет, что данные реестра — docs/architecture/registry/components.json —
 * соответствуют зафиксированной схеме (docs/architecture/SHARED-COMPONENT-REGISTRY.md):
 * уникальные id, допустимые типы и статусы, semver-версия, существующие пути кода,
 * непустые списки совместимых модулей и прав.
 *
 * Это защита от «второго реестра» и от записи, которая ссылается на удалённый файл.
 * Перенос компонентов тест не проверяет: этап A файлы не переносит.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "docs", "architecture", "registry", "components.json");
const contractPath = path.join(root, "docs", "architecture", "SHARED-COMPONENT-REGISTRY.md");

const TYPES = new Set([
  "ui-primitive",
  "media",
  "content-block",
  "question-type",
  "editor",
  "schema",
  "template",
  "utility",
]);
const STATUSES = new Set(["active", "experimental", "deprecated"]);
const MODULES = new Set([
  "subjects",
  "tests",
  "lectures",
  "materials",
  "trainers",
  "assignments",
  "schedule",
  "progress",
  "teaching",
  "admin",
  "atlas",
  "labs",
]);
const ENGINEERING_ROLES = new Set(["frontend", "backend", "database", "education", "storage", "devops", "qa"]);
const USE_ROLES = new Set(["admin", "teacher", "student"]);
const ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

async function loadRegistry() {
  const raw = await readFile(registryPath, "utf8");
  return JSON.parse(raw);
}

test("контракт реестра и файл данных существуют", async () => {
  await stat(contractPath);
  const registry = await loadRegistry();
  assert.match(registry.schema_version, SEMVER, "schema_version должен быть semver");
  assert.match(registry.updated_at, /^\d{4}-\d{2}-\d{2}$/, "updated_at должен быть YYYY-MM-DD");
  assert.ok(Array.isArray(registry.components) && registry.components.length > 0, "registry.components должен быть непустым массивом");
});

test("id уникальны и соответствуют шаблону", async () => {
  const { components } = await loadRegistry();
  const seen = new Set();
  for (const entry of components) {
    assert.match(entry.id, ID_PATTERN, `недопустимый id: ${entry.id}`);
    assert.ok(!seen.has(entry.id), `повторяющийся id: ${entry.id}`);
    seen.add(entry.id);
  }
});

test("тип и статус входят в перечисления, версия — semver", async () => {
  const { components } = await loadRegistry();
  for (const entry of components) {
    assert.ok(TYPES.has(entry.type), `${entry.id}: неизвестный тип ${entry.type}`);
    assert.ok(STATUSES.has(entry.status), `${entry.id}: неизвестный статус ${entry.status}`);
    assert.match(entry.version, SEMVER, `${entry.id}: версия должна быть semver`);
  }
});

test("code_paths существуют, устаревшие записи имеют замену или причину", async () => {
  const { components } = await loadRegistry();
  for (const entry of components) {
    assert.ok(Array.isArray(entry.code_paths) && entry.code_paths.length > 0, `${entry.id}: нужен хотя бы один code_path`);
    for (const rel of entry.code_paths) {
      await stat(path.join(root, rel)).catch(() => {
        assert.fail(`${entry.id}: файл не найден — ${rel}`);
      });
    }
    if (entry.status === "deprecated") {
      assert.ok(entry.replaced_by || (entry.notes && entry.notes.length > 10), `${entry.id}: устаревшая запись требует replaced_by или причины`);
    }
  }
});

test("активные записи не делят один и тот же файл", async () => {
  const { components } = await loadRegistry();
  const seen = new Map();
  for (const entry of components.filter((item) => item.status === "active")) {
    for (const rel of entry.code_paths) {
      assert.ok(!seen.has(rel), `${rel}: уже зарегистрирован активной записью ${seen.get(rel)}, повтор в ${entry.id}`);
      seen.set(rel, entry.id);
    }
  }
});

test("совместимые модули и права заполнены допустимыми значениями", async () => {
  const { components } = await loadRegistry();
  for (const entry of components) {
    assert.ok(Array.isArray(entry.compatible_modules) && entry.compatible_modules.length > 0, `${entry.id}: compatible_modules обязателен`);
    for (const moduleName of entry.compatible_modules) {
      assert.ok(moduleName === "*" || MODULES.has(moduleName), `${entry.id}: неизвестный модуль ${moduleName}`);
    }
    const { edit, use } = entry.permissions ?? {};
    assert.ok(Array.isArray(edit) && edit.length > 0, `${entry.id}: permissions.edit обязателен`);
    assert.ok(Array.isArray(use) && use.length > 0, `${entry.id}: permissions.use обязателен`);
    for (const role of edit) {
      assert.ok(ENGINEERING_ROLES.has(role), `${entry.id}: неизвестная роль редактирования ${role}`);
    }
    for (const role of use) {
      assert.ok(role === "*" || USE_ROLES.has(role), `${entry.id}: неизвестная роль использования ${role}`);
    }
  }
});
