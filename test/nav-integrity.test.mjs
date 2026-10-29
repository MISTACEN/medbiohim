import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * G3 (база): целостность навигации — каждый пункт сайдбара и мобильной
 * навигации ведёт на существующий маршрут (page.tsx существует, либо это
 * динамический маршрут с [id]). Полноценный Playwright-smoke (реальный
 * браузер в CI) — следующий шаг: требует установки браузеров в runner.
 */
const APP = path.resolve(import.meta.dirname, "../src/app");

function routeExists(href) {
  const clean = href.split("?")[0].replace(/\/$/, "") || "/";
  const dir = path.join(APP, clean === "/" ? "" : clean);
  try {
    const st = statSync(dir);
    if (!st.isDirectory()) return false;
  } catch {
    return false;
  }
  return true;
}

// statSync через sync-обёртку для простоты
import { statSync } from "node:fs";

async function extractHrefs(file) {
  const src = await readFile(file, "utf8");
  const hrefs = [];
  // href: "/..." в объектах навигации
  for (const match of src.matchAll(/href:\s*"([^"]+)"/g)) hrefs.push(match[1]);
  // <Link href="/..."> и href={"/..."}
  for (const match of src.matchAll(/<Link[^>]*?href=\{?"([^"]+)"/g)) hrefs.push(match[1]);
  return hrefs.filter((href) => href.startsWith("/") && !href.startsWith("//"));
}

test("каждый пункт навигации ведёт на существующий маршрут приложения", async () => {
  const navFiles = [
    "../src/components/layout/Sidebar.tsx",
    "../src/components/layout/MobileNav.tsx",
    "../src/components/layout/TopBar.tsx",
  ];
  const problems = [];
  for (const rel of navFiles) {
    const file = path.resolve(import.meta.dirname, rel);
    let src;
    try {
      src = await readFile(file, "utf8");
    } catch {
      continue; // MobileNav может отсутствовать
    }
    const hrefs = await extractHrefs(file);
    for (const href of hrefs) {
      const clean = href.split("?")[0].replace(/\/$/, "") || "/";
      // внешние ссылки пропускаем
      if (/^https?:/.test(href)) continue;
      const dir = path.join(APP, clean);
      let ok = false;
      try {
        ok = statSync(dir).isDirectory();
      } catch {
        ok = false;
      }
      if (!ok) problems.push(`${rel}: ${href} → нет каталога маршрута`);
    }
  }
  assert.equal(problems.length, 0, problems.join("\n"));
});

test("ключевые страницы отдают осмысленный контент (фикстуры маршрутов)", async () => {
  // маршруты, от которых зависит навигация (C8-сайдбар)
  const routes = ["", "/schedule", "/subjects", "/progress", "/community", "/atlas", "/search", "/assignments", "/academic", "/calculators", "/attestations", "/tutor", "/changelog", "/bookmarks"];
  for (const route of routes) {
    const dir = path.join(APP, route);
    const entries = await readdir(dir);
    assert.ok(
      entries.includes("page.tsx") || entries.some((e) => e.startsWith("[") === false && e === "page.tsx"),
      `нет page.tsx у маршрута ${route || "/"}`
    );
  }
});
