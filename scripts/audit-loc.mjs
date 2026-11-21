#!/usr/bin/env node
/**
 * Аудит размеров и связности для архитектурных fitness-тестов.
 *
 *   node scripts/audit-loc.mjs           # отчёт (ничего не пишет)
 *   node scripts/audit-loc.mjs --write   # обновить baseline loc-budgets.json
 *
 * Baseline — «крыса»: файлы, которые уже больше лимита, фиксируются по текущему
 * размеру, и расти им больше нельзя; новые файлы обязаны укладываться в лимит.
 * Так правило `page.tsx ≤ 200` работает сразу, не требуя разнести все монолиты.
 */
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const BASELINE_FILE = "docs/architecture/registry/loc-budgets.json";

export const RULES = {
  /** `src/app/** /page.tsx` — тонкая точка входа. */
  appPageLimit: 200,
  /** Один файл маршрутов воркера. */
  routeFileLimit: 400,
  /** Один файл модуля (src/modules/**). */
  moduleFileLimit: 400,
  /** Один компонент/хук/модель домена (src/components/**). */
  componentLimit: 600,
  /** Один файл логики/данных (src/lib/**). */
  libLimit: 600,
};

const LIMIT_BY_KIND = {
  pages: "appPageLimit",
  routes: "routeFileLimit",
  modules: "moduleFileLimit",
  components: "componentLimit",
  lib: "libLimit",
};

export async function walk(dir, predicate = () => true) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, predicate)));
    else if (predicate(full)) files.push(full);
  }
  return files;
}

export function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

export async function countLines(file) {
  const source = await readFile(file, "utf8");
  let lines = 0;
  for (let i = 0; i < source.length; i += 1) if (source.charCodeAt(i) === 10) lines += 1;
  return lines;
}

async function withLines(files) {
  const result = [];
  for (const file of files) result.push({ path: rel(file), lines: await countLines(file) });
  return result.sort((a, b) => b.lines - a.lines);
}

export async function collect() {
  return {
    pages: await withLines(
      await walk(path.join(ROOT, "src/app"), (file) => /[\\/]page\.tsx$/.test(file)),
    ),
    routes: await withLines(
      await walk(path.join(ROOT, "workers/api/src/routes"), (file) => file.endsWith(".ts")),
    ),
    modules: await withLines(
      await walk(path.join(ROOT, "src/modules"), (file) => /\.(ts|tsx)$/.test(file)),
    ),
    components: await withLines(
      await walk(path.join(ROOT, "src/components"), (file) => /\.(ts|tsx)$/.test(file)),
    ),
    lib: await withLines(
      await walk(path.join(ROOT, "src/lib"), (file) => file.endsWith(".ts")),
    ),
  };
}

const IMPORT_RE = /(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g;

/** Разрешить относительный импорт в конкретный файл. */
export async function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    base,
  ];
  for (const candidate of candidates) {
    const found = await access(candidate).then(() => true, () => false);
    if (found) return candidate;
  }
  return null;
}

export async function importGraph(entryFile) {
  const visited = new Set();
  const queue = [entryFile];
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    const source = await readFile(current, "utf8").catch(() => "");
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = await resolveImport(current, match[1]);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

/** Файлы маршрутов, которые не импортируются из index.ts (мёртвый код). */
export async function unreachableRoutes() {
  const entry = path.join(ROOT, "workers/api/src/index.ts");
  const graph = await importGraph(entry);
  const routeFiles = await walk(
    path.join(ROOT, "workers/api/src/routes"),
    (file) => file.endsWith(".ts"),
  );
  return routeFiles
    .filter((file) => !graph.has(file))
    .map(rel)
    .sort();
}

/** Циклы импортов внутри каталога (относительные импорты). */
export async function findImportCycles(dir) {
  const files = await walk(dir, (file) => /\.(ts|tsx)$/.test(file));
  const graph = new Map();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const targets = [];
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = await resolveImport(file, match[1]);
      if (resolved && files.includes(resolved)) targets.push(resolved);
    }
    graph.set(file, targets);
  }

  const state = new Map();
  const stack = [];
  const cycles = [];
  const visit = (file) => {
    state.set(file, "open");
    stack.push(file);
    for (const target of graph.get(file) ?? []) {
      const mark = state.get(target);
      if (mark === "open") {
        const from = stack.indexOf(target);
        cycles.push([...stack.slice(from), target].map(rel));
      } else if (!mark) {
        visit(target);
      }
    }
    stack.pop();
    state.set(file, "done");
  };
  for (const file of files) if (!state.has(file)) visit(file);
  return cycles.map((cycle) => cycle.join(" → "));
}

export async function buildBaseline() {
  const inventory = await collect();
  const budgets = {};
  for (const [kind, files] of Object.entries(inventory)) {
    const limit = RULES[LIMIT_BY_KIND[kind]];
    for (const file of files) if (file.lines > limit) budgets[file.path] = file.lines;
  }
  return {
    version: 3,
    updated: new Date().toISOString().slice(0, 10),
    rules: RULES,
    budgets,
    unreachableRoutes: await unreachableRoutes(),
  };
}

async function main() {
  const write = process.argv.includes("--write");
  const inventory = await collect();
  const baseline = await buildBaseline();

  console.log("Файлов:", {
    pages: inventory.pages.length,
    routes: inventory.routes.length,
    modules: inventory.modules.length,
    components: inventory.components.length,
    lib: inventory.lib.length,
  });

  for (const [kind, files] of Object.entries(inventory)) {
    const limit = RULES[LIMIT_BY_KIND[kind]];
    const over = files.filter((file) => file.lines > limit);
    console.log(`\n${kind}: ${over.length} файлов сверх лимита ${limit}`);
    for (const file of over.slice(0, 10)) console.log(`  ${String(file.lines).padStart(5)}  ${file.path}`);
  }

  if (baseline.unreachableRoutes.length > 0) {
    console.log("\nНе импортируются из workers/api/src/index.ts:");
    for (const file of baseline.unreachableRoutes) console.log(`  ${file}`);
  }

  const cycles = await findImportCycles(path.join(ROOT, "src/modules"));
  if (cycles.length > 0) {
    console.log("\nЦиклы в src/modules:");
    for (const cycle of cycles) console.log(`  ${cycle}`);
  }
  for (const dir of ["src/lib", "src/components"]) {
    const domainCycles = await findImportCycles(path.join(ROOT, dir));
    if (domainCycles.length > 0) {
      console.log(`\nЦиклы в ${dir}:`);
      for (const cycle of domainCycles) console.log(`  ${cycle}`);
    }
  }

  if (write) {
    const target = path.join(ROOT, BASELINE_FILE);
    await writeFile(target, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`\nЗаписан ${BASELINE_FILE} (${Object.keys(baseline.budgets).length} записей)`);
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();
