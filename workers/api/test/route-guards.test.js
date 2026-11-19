// Страж «каждый маршрут-файл имеет guard»: auth-проверка, capability-проверка
// или rate limit для публичных по замыслу маршрутов. Файл без ни одного из
// упоминаний — потенциальная незащищённая точка входа (аудит 2026-11-19,
// п. «guard-хелперы»: тогда таких было ровно 2, оба закрыты rate limit'ом).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROUTES = new URL("../src/routes/", import.meta.url);

const GUARD_RE =
  /requireAuth|requireAdmin|requireTeachingCapability|optionalAuth|moduleGate|rateLimit|initDataAuth|verify[A-Z]|guardInternal|constantTimeEqual|authorized/;

// Явно разрешённые исключения (публичные по документированному замыслу,
// прикрыты rate limit'ом или не выполняют запросов).
const ALLOWLIST = new Set([
  "health.ts", // healthcheck
  "telegram-ingest/01-health.ts", // healthcheck телеграм-воркера
  "trainers/03-image.ts", // байты только опубликованных карточек, публичный по замыслу (см. комментарий в файле)
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("каждый файл маршрутов упоминает guard-хелпер или в allowlist", () => {
  const offenders = [];
  for (const file of walk(ROUTES.pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
    const relative = path.relative(ROUTES.pathname.replace(/^\/([A-Za-z]:)/, "$1"), file).replaceAll("\\", "/");
    if (ALLOWLIST.has(relative)) continue;
    const source = readFileSync(file, "utf8");
    // Инфраструктура без эндпоинтов (index-реэкспорты, shared-хелперы, types)
    // guard не требует — проверяем только файлы, объявляющие маршруты.
    const declaresEndpoints = /\.(get|post|put|delete|patch)\(\s*["'`]\//.test(source);
    if (!declaresEndpoints) continue;
    if (!GUARD_RE.test(source)) offenders.push(relative);
  }
  assert.deepEqual(
    offenders,
    [],
    `маршруты без guard-хелпера (добавь guard или оформи исключение в ALLOWLIST):\n${offenders.join("\n")}`
  );
});
