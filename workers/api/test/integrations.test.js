import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(new URL("../src/routes/integrations.ts", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../../../browser-extension/manifest.json", import.meta.url), "utf8"));
const analyzerSource = await readFile(new URL("../../../browser-extension/src/content/analyzer.js", import.meta.url), "utf8");
const sourcesMap = JSON.parse(await readFile(new URL("../../../browser-extension/src/content/sources.json", import.meta.url), "utf8"));
const interceptorSource = await readFile(new URL("../../../browser-extension/src/content/interceptor.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../../../browser-extension/src/background/serviceWorker.js", import.meta.url), "utf8");
const popupSource = await readFile(new URL("../../../browser-extension/src/js/popup.js", import.meta.url), "utf8");
const workflow = await readFile(new URL("../../../.github/workflows/deploy-browser-extension.yml", import.meta.url), "utf8");

test("imports are user-scoped and never trust a client user id", () => {
  assert.ok(routeSource.includes("const user = c.get(\"user\")"));
  // Основное хранилище — imported_sources, строки привязаны к user_id из JWT.
  assert.ok(routeSource.includes('.eq("user_id", user.id)'));
  assert.ok(routeSource.includes("user_id: user.id"));
  // Legacy-ключи site_content читаются/удаляются только в своём префиксе.
  assert.ok(routeSource.includes("`extimport:${userId}:`"));
  assert.ok(routeSource.includes("`${legacyPrefix(user.id)}%`"));
  assert.ok(routeSource.includes(".eq(\"key\", `${legacyPrefix(user.id)}${id}`)"));
  assert.ok(!routeSource.includes("body.user_id"));
});

test("import validation bounds items, URLs and text", () => {
  assert.ok(routeSource.includes("const MAX_ITEMS = 50"));
  assert.ok(routeSource.includes("Не более ${MAX_ITEMS} элементов"));
  assert.ok(routeSource.includes("/^https?:\\/\\//i.test(url)"));
  assert.ok(routeSource.includes("clean(value.summary, 4000)"));
  // The allowlist is asserted value-by-value so adding a source (e.g. `fesmu`
  // for public FESMU/ДВГМУ pages) does not require an exact-string rewrite.
  for (const source of ["eios", "neofamily", "sechenov", "fesmu", "other"]) {
    assert.ok(routeSource.includes(`"${source}"`), `SOURCES misses ${source}`);
  }
});

test("extension compatibility aliases exist and are mounted", () => {
  assert.ok(routeSource.includes('integrations.post("/fesmu/import"'));
  assert.ok(routeSource.includes('integrations.post("/fesmu/dedup"'));
  assert.ok(indexSource.includes('v1.route("/integrations", integrations)'));
});

test("manifest is a loadable MV3 package", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.action.default_popup, "popup.html");
  // Два content script: interceptor в MAIN-мире на document_start (перехват
  // fetch/XHR) и analyzer в isolated-мире с CSS.
  const mainWorld = manifest.content_scripts.find((entry) => entry.world === "MAIN");
  const isolated = manifest.content_scripts.find((entry) => entry.world !== "MAIN");
  assert.deepEqual(mainWorld.js, ["interceptor.js"]);
  assert.equal(mainWorld.run_at, "document_start");
  assert.deepEqual(isolated.js, ["analyzer.js"]);
  assert.deepEqual(isolated.css, ["styles.css"]);
  assert.deepEqual(mainWorld.matches, isolated.matches);
  for (const host of ["lab.neofamily.ru", "xn--80aafla1ahtef3a7eg.xn--p1ai", "eios.fesmu.ru"]) {
    assert.ok(manifest.host_permissions.some((entry) => entry.includes(host)), `missing host permission ${host}`);
  }
});

test("content script and popup cover the three portals without auto-import", () => {
  // Хосты живут в декларативной карте источников, а не в коде анализатора.
  const sourcesText = JSON.stringify(sourcesMap);
  for (const marker of ["neofamily", "xn--80aafla1ahtef3a7eg", "eios"]) {
    assert.ok(sourcesText.includes(marker), `sources.json misses ${marker}`);
  }
  assert.ok(analyzerSource.includes("./sources.json"), "analyzer must read the sources map");
  assert.ok(analyzerSource.includes("analyze_page"));
  assert.ok(popupSource.includes("selectedItems"));
  assert.ok(popupSource.includes("chrome.storage.sync"));
  assert.ok(workerSource.includes("/integrations/imports"));
  assert.ok(!popupSource.includes("reportWebVitals"));
});

test("network capture is opt-in, same-origin and never reads credentials", () => {
  // Включение только по кнопке: analyzer шлёт arm/disarm, interceptor их слушает.
  assert.ok(analyzerSource.includes("medbiohim:arm"));
  assert.ok(analyzerSource.includes("disarm_capture"));
  assert.ok(interceptorSource.includes("medbiohim:arm"));
  assert.ok(interceptorSource.includes("medbiohim:capture"));
  // Ничего не уходит наружу: только CustomEvent внутри страницы.
  assert.ok(!interceptorSource.includes("chrome.runtime.sendMessage"));
  assert.ok(!interceptorSource.includes("chrome.storage"));
  // Только свой origin и только JSON; логин-трафик исключён.
  assert.ok(interceptorSource.includes("sameOrigin(requestUrl)"));
  assert.ok(interceptorSource.includes("DENY_URL"));
  assert.ok(interceptorSource.includes("const DENY_URL = /login|logout|auth|token"));
  assert.ok(interceptorSource.includes("/json/i"));
  // Ни куки, ни заголовки, ни тела запросов не читаются.
  assert.ok(!interceptorSource.includes("document.cookie"));
  assert.ok(!interceptorSource.includes("request.headers"));
  assert.ok(!interceptorSource.includes("args[1].body"));
});

test("CI builds and packages the extension", () => {
  assert.ok(workflow.includes("npm ci"));
  assert.ok(workflow.includes("npm run build"));
  assert.ok(workflow.includes("npm run package"));
  assert.ok(workflow.includes("upload-artifact"));
});
