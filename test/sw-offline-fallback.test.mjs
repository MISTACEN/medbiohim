/**
 * PWA offline-fallback: service worker должен:
 *  1) кэшировать /offline.html при установке;
 *  2) подменять неудачную HTML-навигацию офлайн-страницей;
 *  3) не трогать /api/, /auth/ и логин (данные и сессия — только сеть);
 *  4) не трогать не-GET запросы.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("service worker caches offline.html on install", async () => {
  const source = await readFile(path.join(root, "public", "sw.js"), "utf8");
  assert.match(source, /cache\.add\(\s*["']\/offline\.html["']\s*\)/, "install должен кэшировать /offline.html");
});

test("service worker falls back to offline.html for failed navigations", async () => {
  const source = await readFile(path.join(root, "public", "sw.js"), "utf8");
  assert.match(source, /request\.mode\s*===\s*["']navigate["']/, "навигация должна обрабатываться отдельно");
  assert.match(source, /cache\.match\(\s*["']\/offline\.html["']\s*\)/, "фолбэк должен читаться из кэша");
  // Навигация сначала идёт в сеть — кэшировать HTML-ответы нельзя (чтобы не
  // показывать устаревшие страницы приложений).
  const navigateBlock = source.slice(source.indexOf('request.mode === "navigate"'));
  assert.ok(navigateBlock.indexOf("fetch(request)") < navigateBlock.indexOf("cache.match"), "сначала сеть, потом фолбэк");
});

test("service worker keeps api, auth and login on network only", async () => {
  const source = await readFile(path.join(root, "public", "sw.js"), "utf8");
  assert.match(source, /\/api\//, "исключение /api/ обязательно");
  assert.match(source, /\/auth\//, "исключение /auth/ обязательно");
  assert.match(source, /login/, "исключение login обязательно");
  assert.match(source, /request\.method\s*!==\s*["']GET["']/, "не-GET не перехватывается");
  // Исключения должны стоять до navigate-ветки, иначе навигация на /login попадёт в фолбэк.
  const guard = source.indexOf('url.pathname.startsWith("/api/")');
  const navigate = source.indexOf('request.mode === "navigate"');
  assert.ok(guard > -1 && navigate > -1 && guard < navigate, "исключения до ветки навигации");
});

test("offline page exists, is self-contained and offers retry", async () => {
  const source = await readFile(path.join(root, "public", "offline.html"), "utf8");
  assert.match(source, /<html lang="ru">/);
  assert.match(source, /location\.reload/, "должна быть кнопка повторной попытки");
  assert.doesNotMatch(source, /<script/, "офлайн-страница не тянет внешний JS");
  // Не должна ссылаться на ресурсы, недоступные офлайн.
  assert.doesNotMatch(source, /<link[^>]+href="/, "без внешних стилей — только инлайновые");
});
