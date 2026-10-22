import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(new URL("../src/routes/integrations.ts", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../../../browser-extension/manifest.json", import.meta.url), "utf8"));
const analyzerSource = await readFile(new URL("../../../browser-extension/src/content/analyzer.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../../../browser-extension/src/background/serviceWorker.js", import.meta.url), "utf8");
const popupSource = await readFile(new URL("../../../browser-extension/src/js/popup.js", import.meta.url), "utf8");
const workflow = await readFile(new URL("../../../.github/workflows/deploy-browser-extension.yml", import.meta.url), "utf8");

test("imports are user-scoped and never trust a client user id", () => {
  assert.ok(routeSource.includes("const user = c.get(\"user\")"));
  assert.ok(routeSource.includes("`extimport:${userId}:`"));
  assert.ok(routeSource.includes("`${prefix(user.id)}%`"));
  assert.ok(routeSource.includes(".eq(\"key\", `${prefix(user.id)}${id}`)"));
  assert.ok(!routeSource.includes("body.user_id"));
});

test("import validation bounds items, URLs and text", () => {
  assert.ok(routeSource.includes("const MAX_ITEMS = 50"));
  assert.ok(routeSource.includes("Не более ${MAX_ITEMS} элементов"));
  assert.ok(routeSource.includes("/^https?:\\/\\//i.test(url)"));
  assert.ok(routeSource.includes("clean(value.summary, 4000)"));
  assert.ok(routeSource.includes('"eios", "neofamily", "sechenov", "other"'));
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
  assert.deepEqual(manifest.content_scripts[0].js, ["analyzer.js"]);
  assert.deepEqual(manifest.content_scripts[0].css, ["styles.css"]);
  for (const host of ["lab.neofamily.ru", "xn--80aafla1ahtef3a7eg.xn--p1ai", "eios.fesmu.ru"]) {
    assert.ok(manifest.host_permissions.some((entry) => entry.includes(host)), `missing host permission ${host}`);
  }
});

test("content script and popup cover the three portals without auto-import", () => {
  for (const marker of ["neofamily", "xn--80aafla1ahtef3a7eg", "eios"]) {
    assert.ok(analyzerSource.includes(marker), `analyzer misses ${marker}`);
  }
  assert.ok(analyzerSource.includes("analyze_page"));
  assert.ok(popupSource.includes("selectedItems"));
  assert.ok(popupSource.includes("chrome.storage.sync"));
  assert.ok(workerSource.includes("/integrations/imports"));
  assert.ok(!popupSource.includes("reportWebVitals"));
});

test("CI builds and packages the extension", () => {
  assert.ok(workflow.includes("npm ci"));
  assert.ok(workflow.includes("npm run build"));
  assert.ok(workflow.includes("npm run package"));
  assert.ok(workflow.includes("upload-artifact"));
});
