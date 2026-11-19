import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BASELINE_FILE,
  ROOT,
  RULES,
  collect,
  findImportCycles,
  unreachableRoutes,
  walk,
} from "../scripts/audit-loc.mjs";

/**
 * Architecture fitness-тесты (docs/architecture/MODULE-ARCHITECTURE.md).
 *
 * Это не тесты поведения, а «крыса» на архитектуру: правила, которые иначе
 * тихо размываются первым же удобным коммитом.
 *
 * - `page.tsx ≤ 200`, файл маршрутов воркера ≤ 400, файл модуля ≤ 400;
 *   уже существующие монолиты зафиксированы в registry/loc-budgets.json и
 *   расти им нельзя (baseline обновляется только осознанно:
 *   `node scripts/audit-loc.mjs --write`).
 * - каждый файл маршрутов импортируется из `workers/api/src/index.ts`
 *   (мёртвый маршрут не считается «на будущее»).
 * - в `src/modules` нет циклов импортов.
 * - модуль не импортирует `src/app` и не лезет в чужой модуль напрямую.
 */
const LIMIT_BY_KIND = {
  pages: RULES.appPageLimit,
  routes: RULES.routeFileLimit,
  modules: RULES.moduleFileLimit,
};

const baseline = JSON.parse(await readFile(path.join(ROOT, BASELINE_FILE), "utf8"));

test("baseline описывает те же лимиты, что и скрипт аудита", () => {
  assert.deepEqual(baseline.rules, RULES);
  assert.equal(baseline.version, 2);
});

test("размер файлов не превышает бюджет и общий лимит", async () => {
  const inventory = await collect();
  const problems = [];
  for (const [kind, files] of Object.entries(inventory)) {
    for (const file of files) {
      const budget = baseline.budgets[file.path];
      const limit = budget ?? LIMIT_BY_KIND[kind];
      if (file.lines > limit) {
        const hint = budget ? "файл вырос сверх зафиксированного размера" : "новый файл сверх лимита";
        problems.push(`${file.path}: ${file.lines} > ${limit} (${hint})`);
      }
    }
  }
  assert.deepEqual(problems, [], `архитектурный бюджет превышен:\n${problems.join("\n")}`);
});

test("в бюджете нет исчезнувших файлов", async () => {
  const existing = new Set();
  for (const files of Object.values(await collect())) {
    for (const file of files) existing.add(file.path);
  }
  const stale = Object.keys(baseline.budgets).filter((file) => !existing.has(file));
  assert.deepEqual(stale, [], `удалите записи из ${BASELINE_FILE}: ${stale.join(", ")}`);
});

test("каждый файл маршрутов достижим из workers/api/src/index.ts", async () => {
  const actual = await unreachableRoutes();
  const known = new Set(baseline.unreachableRoutes ?? []);
  const fresh = actual.filter((file) => !known.has(file));
  const resolved = [...known].filter((file) => !actual.includes(file));
  assert.deepEqual(fresh, [], `файлы маршрутов не смонтированы:\n${fresh.join("\n")}`);
  assert.deepEqual(resolved, [], `эти маршруты снова смонтированы, уберите их из baseline: ${resolved.join(", ")}`);
});

test("в src/modules нет циклов импортов", async () => {
  const cycles = await findImportCycles(path.join(ROOT, "src/modules"));
  assert.deepEqual(cycles, [], `циклы импортов:\n${cycles.join("\n")}`);
});

test("модули не импортируют src/app и не ходят в чужие модули напрямую", async () => {
  const files = await walk(path.join(ROOT, "src/modules"), (file) => /\.(ts|tsx)$/.test(file));
  const offenders = [];
  for (const file of files) {
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    if (relative.includes("/__tests__/")) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier.startsWith("@/app/") || specifier.startsWith("../app/") || specifier.startsWith("../../app/")) {
        offenders.push(`${relative}: ${specifier}`);
      }
      if (specifier.startsWith("@/modules/")) {
        const target = specifier.split("/")[2];
        const own = relative.split("/")[2];
        if (target && own && target !== own) offenders.push(`${relative}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `модуль зависит от app или от чужого модуля:\n${offenders.join("\n")}`);
});
