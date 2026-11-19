#!/usr/bin/env node
/**
 * Архитектурный аудит MEDBIOHIM (B1).
 *
 * Только читает исходники и пишет docs/architecture/AUDIT-2026-11-19.md.
 * Без новых зависимостей: разбор импортов регулярный, метрики — по файлам.
 *
 * Запуск: node scripts/audit-architecture.mjs
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const WORKER = path.join(ROOT, "workers", "api", "src");
const OUT = path.join(ROOT, "docs", "architecture", "AUDIT-2026-11-19.md");
const TS_EXT = /\.(ts|tsx)$/;

function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (TS_EXT.test(entry.name) && !entry.name.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

const toPosix = (p) => p.replaceAll("\\", "/");
const rel = (p) => toPosix(path.relative(ROOT, p));
const lines = (text) => text.split("\n").length;

const srcFiles = walk(SRC);
const workerFiles = walk(WORKER);
const allFiles = [...srcFiles, ...workerFiles];
const known = new Set(allFiles.map(toPosix));

function importSpecs(file, text) {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specs = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const typeOnly = Boolean(node.importClause?.isTypeOnly || node.isTypeOnly);
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) specs.push({ spec: spec.text, typeOnly });
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) specs.push({ spec: arg.text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return specs;
}

function resolveImport(fromFile, spec) {
  let base = null;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  if (!base) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  for (const candidate of candidates) {
    const key = toPosix(candidate);
    if (known.has(key)) return key;
  }
  return null;
}

const graph = new Map();
const typeIn = new Map();
const textCache = new Map();
for (const file of allFiles) {
  const key = toPosix(file);
  const text = fs.readFileSync(file, "utf8");
  textCache.set(key, text);
  const edges = new Set();
  for (const { spec, typeOnly } of importSpecs(file, text)) {
    const target = resolveImport(file, spec);
    if (!target || target === key) continue;
    if (typeOnly) typeIn.set(target, (typeIn.get(target) ?? 0) + 1);
    else edges.add(target);
  }
  graph.set(key, [...edges]);
}

const fanIn = new Map(allFiles.map((f) => [toPosix(f), 0]));
for (const [, targets] of graph) for (const target of targets) fanIn.set(target, (fanIn.get(target) ?? 0) + 1);
for (const [target, count] of typeIn) fanIn.set(target, (fanIn.get(target) ?? 0) + count);

/* Циклы: SCC Тарьяна */
function sccs() {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const idx = new Map();
  const low = new Map();
  const result = [];
  const strong = (v) => {
    idx.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) result.push(component);
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) strong(v);
  return result.sort((a, b) => b.length - a.length);
}

const cycles = sccs();

/* Метрики по слоям */
function layerOf(file) {
  const r = rel(file);
  if (r.startsWith("src/app/")) return "src/app (страницы)";
  if (r.startsWith("src/components/")) return "src/components";
  if (r.startsWith("src/modules/")) return "src/modules";
  if (r.startsWith("src/lib/")) return "src/lib";
  if (r.startsWith("src/shared/")) return "src/shared";
  if (r.startsWith("src/hooks/")) return "src/hooks";
  if (r.startsWith("workers/api/src/routes/")) return "workers/routes";
  if (r.startsWith("workers/api/src/")) return "workers/lib";
  return "прочее";
}
const layers = new Map();
for (const file of allFiles) {
  const layer = layerOf(file);
  const row = layers.get(layer) ?? { files: 0, loc: 0 };
  row.files += 1;
  row.loc += lines(textCache.get(toPosix(file)));
  layers.set(layer, row);
}

const pages = srcFiles
  .filter((f) => rel(f).startsWith("src/app/") && f.endsWith("page.tsx"))
  .map((f) => ({ file: rel(f), loc: lines(textCache.get(toPosix(f))) }))
  .sort((a, b) => b.loc - a.loc);

const monoliths = allFiles
  .map((f) => ({ file: rel(f), loc: lines(textCache.get(toPosix(f))) }))
  .filter((f) => f.file.startsWith("src/") || f.file.startsWith("workers/"))
  .sort((a, b) => b.loc - a.loc)
  .slice(0, 15);

/* Границы модулей */
const deepModuleImports = [];
const aliasSelfImports = [];
const crossModuleImports = [];
for (const [file, targets] of graph) {
  const r = rel(file);
  const text = textCache.get(file);
  for (const match of text.matchAll(/["'](@\/modules\/[^"']+)["']/g)) {
    const spec = match[1];
    if (!r.startsWith("src/modules/")) {
      if (!/^@\/modules\/[^/]+(?:\/submodules\/[^/]+)?$/.test(spec)) deepModuleImports.push(`${r}: ${spec}`);
      continue;
    }
    const selfModule = r.split("/")[2];
    const targetModule = spec.split("/")[2];
    if (targetModule === selfModule) aliasSelfImports.push(`${r}: ${spec}`);
    else crossModuleImports.push(`${r}: ${spec}`);
  }
  void targets;
}

/* Дрейф эндпоинтов */
const endpointsText = fs.readFileSync(path.join(SRC, "lib", "endpoints.ts"), "utf8");
const endpointPaths = new Set();
for (const match of endpointsText.matchAll(/["'`](\/[^"'`\n]*)["'`]/g)) {
  let value = match[1];
  if (!value.startsWith("/") || value.startsWith("/api/")) continue;
  value = value.split("?")[0].replace(/\$\{[^}]+\}/g, ":param").replace(/\/$/, "");
  if (value.length > 1) endpointPaths.add(value);
}
const ROUTE_CALL = /([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete)\(\s*["'`](\/[^"'`]*)/g;
const normalizeRoute = (value) => value.replace(/:[A-Za-z0-9_]+/g, ":param");

// Префиксы mount-точек: import X from "./routes/x"; app.route("/x", X)
const mountPrefix = new Map();
for (const file of workerFiles) {
  const text = textCache.get(toPosix(file));
  const ids = new Map();
  for (const match of text.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g)) {
    const target = resolveImport(file, match[2]);
    if (target) ids.set(match[1], target);
  }
  for (const match of text.matchAll(/\.route\(\s*["']([^"']+)["']\s*,([^\n]*)/g)) {
    const candidates = [...match[2].matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]);
    const identifier = candidates.reverse().find((name) => ids.has(name));
    const target = identifier ? ids.get(identifier) : null;
    if (target) mountPrefix.set(target, match[1]);
  }
}

const workerRoutes = [];
for (const file of workerFiles) {
  const text = textCache.get(toPosix(file));
  const prefix = mountPrefix.get(toPosix(file)) ?? "";
  for (const match of text.matchAll(ROUTE_CALL)) {
    const route = normalizeRoute(match[3]);
    const joined = prefix.replace(/\/$/, "") + (route.startsWith("/") ? route : `/${route}`);
    const full = joined.replace(/\/+$/, "") || "/";
    workerRoutes.push({ file: rel(file), method: match[2].toUpperCase(), route: full });
  }
}
const routeSuffixes = new Set();
for (const { route } of workerRoutes) {
  const parts = route.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) routeSuffixes.add("/" + parts.slice(i).join("/"));
}
const endpointDrift = [];
for (const endpoint of endpointPaths) {
  const generic = endpoint.replace(/:[a-zA-Z]+/g, ":param");
  const parts = generic.split("/").filter(Boolean);
  let matched = false;
  for (let i = 0; i < parts.length; i += 1) {
    const suffix = "/" + parts.slice(i).join("/");
    if (routeSuffixes.has(suffix)) {
      matched = true;
      break;
    }
  }
  if (!matched) endpointDrift.push(endpoint);
}

/* Защита маршрутов (эвристика) */
const guardRe = /requireAuth|requireAdmin|requireModerator|requireTeachingCapability|requireCapability|moduleGate|teacherBlock|hasRole|gate\(|MANAGERS|staffOnly|adminOnly|requireSecret|verifySecret|verifyTelegram|verifySignature|serviceRole|timingSafeEqual|SECRET|secret|SERVICE_TOKEN|checkSecret/;
const routeFiles = [];
for (const file of workerFiles) {
  const r = rel(file);
  if (!r.startsWith("workers/api/src/routes/")) continue;
  const text = textCache.get(toPosix(file));
  const routes = [...text.matchAll(ROUTE_CALL)].length;
  if (!routes) continue;
  const guards = (text.match(guardRe) ?? []).length;
  routeFiles.push({ file: r, routes, guards });
}
const unguarded = routeFiles.filter((f) => f.guards === 0).sort((a, b) => b.routes - a.routes);

/* SQL-горячие точки */
const sqlFiles = [];
for (const file of workerFiles) {
  const r = rel(file);
  const text = textCache.get(toPosix(file));
  const from = (text.match(/\.from\(/g) ?? []).length;
  if (!from) continue;
  const limit = (text.match(/\.limit\(/g) ?? []).length;
  const star = (text.match(/select\(\s*["'`]\*["'`]\s*\)/g) ?? []).length;
  sqlFiles.push({ file: r, from, limit, star, loc: lines(text) });
}
sqlFiles.sort((a, b) => b.from - a.from);

/* Файлы без входящих импортов */
const dead = [...fanIn.entries()]
  .filter(([file, count]) => {
    const r = rel(file);
    return count === 0 && !r.startsWith("src/app/") && !r.includes("__tests__") && r !== "workers/api/src/index.ts";
  })
  .map(([file]) => ({ file: rel(file), loc: lines(textCache.get(file) ?? "") }))
  .filter((f) => f.loc >= 60)
  .sort((a, b) => b.loc - a.loc)
  .slice(0, 30);

/* Дубли химии */
const chemRefs = { componentsChem: 0, componentsChemistry: 0, moduleChemistry: 0 };
for (const text of textCache.values()) {
  chemRefs.componentsChem += (text.match(/@\/components\/chem["'/]/g) ?? []).length;
  chemRefs.componentsChemistry += (text.match(/@\/components\/chemistry["'/]/g) ?? []).length;
  chemRefs.moduleChemistry += (text.match(/@\/modules\/subjects\/submodules\/chemistry/g) ?? []).length;
}

const stat = (files) => ({ files: files.length, loc: files.reduce((s, f) => s + lines(textCache.get(toPosix(f))), 0) });
const srcStat = stat(srcFiles);
const workerStat = stat(workerFiles);
const dirty = (() => {
  try {
    return fs.readFileSync(path.join(ROOT, ".git", "HEAD"), "utf8").trim().slice(0, 7);
  } catch {
    return "unknown";
  }
})();

const md = [];
md.push("# Архитектурный аудит MEDBIOHIM — 2026-11-19");
md.push("");
md.push("**Метод:** статический анализ исходников (`scripts/audit-architecture.mjs`), без запуска приложения, без изменений кода, БД и конфигураций.");
md.push("**Base commit:** `fab432d` (`main`). **Рабочая копия:** грязная — 54 изменённых/удалённых файла (незавершённая работа по химии и порталам), поэтому все выводы ниже относятся к текущему дереву, а не к чистому HEAD.");
md.push("");
md.push("## 1. Объём и слои");
md.push("");
md.push("| Слой | Файлов | Строк |");
md.push("|---|---:|---:|");
for (const [layer, row] of [...layers.entries()].sort((a, b) => b[1].loc - a[1].loc)) md.push(`| ${layer} | ${row.files} | ${row.loc} |`);
md.push(`| **Всего** | **${srcStat.files + workerStat.files}** | **${srcStat.loc + workerStat.loc}** |`);
md.push("");
md.push("## 2. Монолиты");
md.push("");
md.push("| Файл | Строк |");
md.push("|---|---:|");
for (const row of monoliths) md.push(`| \`${row.file}\` | ${row.loc} |`);
md.push("");
md.push(`Страниц с LOC > 200: **${pages.filter((p) => p.loc > 200).length}** из ${pages.length}. Бюджет MODULE-ARCHITECTURE — 200 строк на \`page.tsx\`.`);
md.push("");
md.push("## 3. Циклические зависимости");
md.push("");
if (cycles.length) {
  md.push(`Найдено SCC размером > 1: **${cycles.length}**.`);
  md.push("");
  for (const component of cycles.slice(0, 12)) {
    md.push(`- (${component.length}) ${component.map((f) => `\`${rel(f)}\``).join(" ↔ ")}`);
  }
} else {
  md.push("Циклов не найдено.");
}
md.push("");
md.push("## 4. Границы модулей");
md.push("");
md.push(`- Глубокие импорты \`@/modules/...\` снаружи: **${deepModuleImports.length}**.`);
md.push(`- Алиасные самоссылки внутри модуля: **${aliasSelfImports.length}**.`);
md.push(`- Межмодульные импорты: **${crossModuleImports.length}**.`);
for (const line of [...deepModuleImports, ...aliasSelfImports].slice(0, 15)) md.push(`  - ${line}`);
md.push("");
md.push("## 5. Дрейф API");
md.push("");
md.push(`Уникальных путей в \`src/lib/endpoints.ts\`: **${endpointPaths.size}**. Зарегистрированных route-вызовов воркера: **${workerRoutes.length}**.`);
md.push(`Не нашлось соответствия по суффиксу: **${endpointDrift.length}** (эвристика, требует ручной сверки). Пути \`/api/*\` — Next route handlers, не воркер, из сверки исключены.`);
if (endpointDrift.length) {
  md.push("");
  for (const endpoint of endpointDrift.slice(0, 30)) md.push(`- \`${endpoint}\``);
}
md.push("");
md.push("## 6. Защита маршрутов");
md.push("");
md.push("Файлы роутов без единого упоминания guard-хелпера (эвристика; public-маршруты ожидаемы):");
md.push("");
md.push("| Файл | Маршрутов | Guard-упоминаний |");
md.push("|---|---:|---:|");
for (const row of unguarded.slice(0, 20)) md.push(`| \`${row.file}\` | ${row.routes} | ${row.guards} |`);
md.push("");
md.push("## 7. SQL-нагрузка");
md.push("");
md.push("| Файл | `.from()` | `.limit()` | `select(*)` | Строк |");
md.push("|---|---:|---:|---:|---:|");
for (const row of sqlFiles.slice(0, 15)) md.push(`| \`${row.file}\` | ${row.from} | ${row.limit} | ${row.star} | ${row.loc} |`);
md.push("");
md.push("## 8. Кандидаты в мёртвый код");
md.push("");
md.push("Файлы без входящих импортов (≥60 строк, вне `app/`):");
md.push("");
for (const row of dead) md.push(`- \`${row.file}\` — ${row.loc} строк`);
md.push("");
md.push("## 9. Дублирование");
md.push("");
md.push(`- \`@/components/chem\`: **${chemRefs.componentsChem}** ссылок.`);
md.push(`- \`@/components/chemistry\`: **${chemRefs.componentsChemistry}** ссылок.`);
md.push(`- \`@/modules/subjects/submodules/chemistry\`: **${chemRefs.moduleChemistry}** ссылок.`);
md.push(`- Права: \`src/shared/permissions\` и \`src/lib/admin/access.ts\` — две клиентские модели (сервер один: \`workers/api/src/lib/permissions.ts\`).`);
md.push("");
md.push("## 10. Приоритеты");
md.push("");
md.push("**P0 — до любого рефакторинга:**");
md.push("1. Закрыть грязное дерево отдельным WIP-коммитом (54 файла) или вынести работу в worktree: сейчас `npm test` красный из‑за удалённых `mc-*.json`, и любой перенос смешается с чужой работой.");
md.push("2. Зафиксировать baseline: `typecheck` ✅, `lint` 0 ошибок / 154 warning, worker 490/490 ✅, `npm test` ❌ (2 теста: удалённые порталы + отсутствующий источник гистологии в `Desktop/Гистология`).");
md.push("");
md.push("**P1 — декомпозиция (после P0):**");
md.push("1. `admin.ts` (1481) → `routes/admin/{users,telegram,lectures,questions,files}` по образцу `routes/teacher/`.");
md.push("2. `settings/page.tsx` (924) → `components/settings/`; `practice/page.tsx` (830) → `components/practice/`.");
md.push("3. `workshop.ts` (787), `admin-parity.ts` (681) → каталоги.");
md.push("4. Удалить `components/chem` после перевода ссылок на баррель подмодуля.");
md.push("");
md.push("**P2 — расширяемость и масштаб:**");
md.push("1. Реестр подмодулей предмета и генератор `scripts/new-module.mjs`.");
md.push("2. Политика кэша Upstash (TTL + stale-while-revalidate) и пагинация во всех списочных маршрутах.");
md.push("3. Architecture fitness-тесты: циклы, глубокие импорты, LOC-бюджет страниц, дрейф эндпоинтов.");
md.push("4. ADR-шаблон и правила аддитивного расширения API.");
md.push("");
md.push("## 11. Что не проверено");
md.push("");
md.push("- Runtime, production, RLS на живой БД, реальные права ролей — статический анализ их не заменяет.");
md.push("- Размер бандла: `next build` не запускался, потому что baseline уже красный из‑за грязного дерева.");
md.push("- Граф импортов построен через TypeScript AST. `import type` учтён во входящих связях, но исключён из runtime-циклов; динамические импорты с переменным путём не разрешаются.");
md.push("");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md.join("\r\n"), "utf8");

console.log(JSON.stringify({
  srcFiles: srcStat.files,
  srcLoc: srcStat.loc,
  workerFiles: workerStat.files,
  workerLoc: workerStat.loc,
  pages: pages.length,
  pagesOver200: pages.filter((p) => p.loc > 200).length,
  cycles: cycles.length,
  deepModuleImports: deepModuleImports.length,
  aliasSelfImports: aliasSelfImports.length,
  crossModuleImports: crossModuleImports.length,
  endpoints: endpointPaths.size,
  workerRoutes: workerRoutes.length,
  endpointDrift: endpointDrift.length,
  unguardedRouteFiles: unguarded.length,
  deadCandidates: dead.length,
  chemRefs,
}, null, 2));
