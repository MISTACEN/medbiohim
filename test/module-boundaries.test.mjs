import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Границы модулей (этап A модульной архитектуры, docs/architecture/MODULE-ARCHITECTURE.md).
 *
 * Правила:
 * 1. Снаружи `src/modules` можно импортировать только публичную поверхность:
 *    `@/modules/<module>` или `@/modules/<module>/submodules/<slug>` — не глубже.
 *    Импорт `@/modules/.../ui/...` или `.../model/...` снаружи запрещён.
 * 2. Внутри `src/modules` файл не импортирует свой же модуль через alias `@/modules/...`:
 *    внутренние связи только относительными путями (иначе цикл и обход барьера).
 *
 * Проверка статическая: читает исходники, ничего не исполняет.
 */
const ROOT = path.resolve(import.meta.dirname, "../src");
const MODULES = path.join(ROOT, "modules");

const IMPORT_RE = /(?:from\s+|import\s*\()\s*["'](@\/modules\/[^"']+)["']/g;
const PUBLIC_SURFACE = /^@\/modules\/[^/]+(?:\/submodules\/[^/]+)?$/;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("модули импортируются снаружи только через публичную поверхность", async () => {
  const all = await walk(ROOT);
  const offenders = [];
  for (const file of all) {
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    if (relative.startsWith("modules/")) continue;
    const src = await readFile(file, "utf8");
    for (const match of src.matchAll(IMPORT_RE)) {
      if (PUBLIC_SURFACE.test(match[1])) continue;
      const line = src.slice(0, match.index).split("\n").length;
      offenders.push(`${relative}:${line}: ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `глубокие импорты модулей:\n${offenders.join("\n")}`);
});

test("внутри модуля нет алиасных ссылок на собственный модуль", async () => {
  const files = await walk(MODULES);
  const offenders = [];
  for (const file of files) {
    const relative = path.relative(MODULES, file).replaceAll("\\", "/");
    const moduleName = relative.split("/")[0];
    const src = await readFile(file, "utf8");
    const allowedPrefix = `@/modules/${moduleName}`;
    for (const match of src.matchAll(IMPORT_RE)) {
      if (!match[1].startsWith(allowedPrefix)) continue;
      const line = src.slice(0, match.index).split("\n").length;
      offenders.push(`${relative}:${line}: ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `алиасные самоссылки:\n${offenders.join("\n")}`);
});
