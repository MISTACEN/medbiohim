/**
 * Контрактный тест D4/D5 (TECH-AUDIT-PLAN-2026-10-27 §6):
 * 1) реестр эндпоинтов существует и экспортирует билдеры;
 * 2) в реестре ≥ 140 уникальных путей;
 * 3) в api-модулях (src/lib/api/*.ts) нет сырых строковых путей — только
 *    endpoints.ts (исключение: client.ts → "/auth/refresh", "/health", "/admin");
 * 4) билдеры кодируют параметры через encodeURIComponent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const endpointsFile = path.join(root, "src", "lib", "endpoints.ts");
const apiDir = path.join(root, "src", "lib", "api");

/** Все строковые литералы (кавычки/бэктики) из исходника. */
function stringLiterals(source) {
  const out = [];
  let index = 0;
  while (index < source.length) {
    const quote = source[index];
    if (quote !== '"' && quote !== "'" && quote !== "`") { index++; continue; }
    let value = "";
    let cursor = index + 1;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "\\") { value += source[cursor + 1] ?? ""; cursor += 2; continue; }
      if (char === quote) break;
      value += char;
      cursor++;
    }
    out.push(value);
    index = cursor + 1;
  }
  return out;
}

test("endpoints registry exists and exports path builders", async () => {
  const source = await readFile(endpointsFile, "utf8");
  assert.match(source, /export const endpoints\b/, "реестр должен экспортировать объект endpoints");
  assert.match(source, /export const cacheableGetPrefixes\b/, "реестр должен отдавать префиксы кэша");
  // Билдеры — функции, возвращающие путь-литерал.
  assert.match(source, /:\s*string\s*=>\s*[`"']\/[a-z]/, "ожидаются функции-билдеры путей");
  // Модуль должен реально загружаться (TS со стираемым синтаксисом).
  const mod = await import(pathToFileURL(endpointsFile).href);
  assert.equal(typeof mod.endpoints, "object");
  for (const domain of ["auth", "subjects", "tests", "schedule", "homeworks", "admin", "content", "community", "files", "misc", "settings", "features"]) {
    assert.equal(typeof mod.endpoints[domain], "object", `группа endpoints.${domain} отсутствует`);
    const builders = Object.values(mod.endpoints[domain]);
    assert.ok(builders.length > 0 && builders.every((fn) => typeof fn === "function"), `endpoints.${domain} должен содержать билдеры-функции`);
  }
});

test("registry contains at least 140 unique paths", async () => {
  const source = await readFile(endpointsFile, "utf8");
  const paths = new Set(
    stringLiterals(source)
      .filter((literal) => /^\/[a-z]/.test(literal))
  );
  assert.ok(paths.size >= 140, `ожидалось ≥ 140 уникальных путей, найдено ${paths.size}`);
});

test("api modules contain no raw string paths outside endpoints.ts", async () => {
  const files = (await readdir(apiDir)).filter((name) => name.endsWith(".ts"));
  assert.ok(files.length >= 10, `ожидаются api-модули в src/lib/api, найдено ${files.length}`);
  // client.ts проверяет путь refresh-запроса и админскую зону окна; это
  // транспорт, а не эндпоинт реестра. /health — тот же служебный случай.
  const allowedInClient = new Set(["/auth/refresh", "/health", "/admin"]);
  for (const name of files) {
    const source = await readFile(path.join(apiDir, name), "utf8");
    const offenders = stringLiterals(source).filter(
      (literal) => /^\/[a-z]/.test(literal) && !(name === "client.ts" && allowedInClient.has(literal))
    );
    assert.deepEqual(offenders, [], `${name}: сырые пути должны жить в src/lib/endpoints.ts`);
  }
  // Реестр используется в каждом доменном модуле.
  for (const name of files) {
    if (["types.ts", "client.ts", "ai.ts", "srs.ts"].includes(name)) continue;
    const source = await readFile(path.join(apiDir, name), "utf8");
    assert.match(source, /from "\.\.\/endpoints"/, `${name}: пути должны браться из реестра endpoints`);
  }
});

test("sample builders encode dynamic segments with encodeURIComponent", async () => {
  const mod = await import(pathToFileURL(endpointsFile).href);
  const { endpoints } = mod;
  assert.equal(endpoints.subjects.detail("id with space"), "/subjects/id%20with%20space");
  assert.equal(endpoints.subjects.detail("a/b?c"), "/subjects/a%2Fb%3Fc");
  assert.equal(endpoints.tests.attemptsAnswerRegrade("a b", "c/d"), "/tests/attempts/a%20b/answers/c%2Fd/regrade");
  assert.equal(endpoints.misc.note("x?y"), "/notes/x%3Fy");
  assert.equal(endpoints.homeworks.submissions("a b"), "/homeworks/a%20b/submissions");
  assert.equal(endpoints.admin.telegramChatBind(123), "/admin/telegram/chats/123/bind");
  assert.equal(endpoints.content.attestation("subject/slug", "аттестация"), "/attestations/subject%2Fslug/%D0%B0%D1%82%D1%82%D0%B5%D1%81%D1%82%D0%B0%D1%86%D0%B8%D1%8F");
  // Query-параметры приходят готовой строкой, билдер добавляет "?".
  assert.equal(endpoints.tests.list("subject_id=1"), "/tests?subject_id=1");
  assert.equal(endpoints.tests.list(), "/tests");
  assert.equal(endpoints.files.fileDownload("a b"), "/files/a%20b/download");
});
