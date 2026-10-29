/**
 * PWA-иконки: файлы существуют, ссылки в метаданных и манифесте на них ведут.
 * Регрессия: /apple-icon.svg отдавал 404 в проде, консоль каждого клиента
 * показывала «resource isn't a valid image».
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicPath = (...parts) => path.join(root, "public", ...parts);

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

test("растровые иконки присутствуют в public/", async () => {
  for (const size of [180, 192, 512]) {
    for (const name of [`apple-icon-${size}.png`, `icon-${size}.png`]) {
      assert.equal(await exists(publicPath(name)), true, `нет ${name}`);
    }
  }
  assert.equal(await exists(publicPath("favicon.ico")), true, "нет favicon.ico");
});

test("статические копии SVG на месте", async () => {
  for (const name of ["apple-icon.svg", "icon.svg"]) {
    assert.equal(await exists(publicPath(name)), true, `нет ${name}`);
  }
});

test("layout.tsx ссылается на существующие файлы иконок", async () => {
  const layout = await readFile(path.join(root, "src", "app", "layout.tsx"), "utf8");
  const block = layout.slice(layout.indexOf("icons:"), layout.indexOf("openGraph:"));
  const urls = [...block.matchAll(/"\/([^"]+)"/g)].map((m) => `/public-not-used/${m[1]}`.replace("/public-not-used/", "/"));
  assert.ok(urls.length > 0, "блок icons пуст");
  for (const url of urls) {
    const file = path.join(root, "public", url.replace(/^\//, ""));
    const appFile = path.join(root, "src", "app", url.replace(/^\//, ""));
    const ok = (await exists(file)) || (await exists(appFile));
    assert.equal(ok, true, `layout.tsx ведёт на ${url}, файла нет ни в public/, ни в src/app/`);
  }
});

test("manifest.ts содержит PNG 192/512 и существующие пути", async () => {
  const manifest = await readFile(path.join(root, "src", "app", "manifest.ts"), "utf8");
  assert.match(manifest, /"\/icon-192\.png"/);
  assert.match(manifest, /"\/icon-512\.png"/);
  assert.match(manifest, /purpose:\s*"maskable"/);
  const urls = [...manifest.matchAll(/"\/([^"]+)"/g)].map((m) => "/" + m[1]);
  for (const url of urls) {
    const file = path.join(root, "public", url.replace(/^\//, ""));
    const appFile = path.join(root, "src", "app", url.replace(/^\//, ""));
    const ok = (await exists(file)) || (await exists(appFile));
    assert.equal(ok, true, `манифест ведёт на ${url}, файла нет`);
  }
});
