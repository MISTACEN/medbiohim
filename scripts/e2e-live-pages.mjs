// Живой смок-прогон страниц платформы (по образцу ручного «пройдись по сайту
// как студент»). Логинится, обходит список страниц, собирает console-error /
// pageerror по каждой, снимает скриншоты и падает с ненулевым кодом, если
// нашлись ошибки, не входящие в известный шум auth-захода.
//
// Запуск: npm run test:e2e:pages
// Env: E2E_BASE (по умолчанию https://medbiohim.vercel.app), E2E_EMAIL,
// E2E_PASSWORD (обязательны), E2E_OUT (куда писать скриншоты).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.E2E_BASE || "https://medbiohim.vercel.app";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), "mbh-e2e-pages");

if (!EMAIL || !PASSWORD) {
  console.error("Нужны E2E_EMAIL и E2E_PASSWORD (админ/студент с доступом к закрытым страницам)");
  process.exit(2);
}

// Известный шум первого auth-захода (гонка me/refresh) — не считается ошибкой.
const KNOWN_NOISE = /the server responded with a status of 401|the server responded with a status of 422/;

const STOPS = [
  ["/", "00-home"],
  ["/study", "01-study"],
  ["/schedule", "02-schedule"],
  ["/cards", "03-cards"],
  ["/tools", "04-tools"],
  ["/atlas", "05-atlas"],
  ["/subjects", "06-subjects"],
  ["/tests", "07-tests"],
  ["/community", "08-community"],
  ["/library", "09-library"],
  ["/help", "10-help"],
  ["/settings", "11-settings"],
  ["/tickets", "12-tickets"],
  ["/bookmarks", "13-bookmarks"],
  ["/journal", "14-journal"],
  ["/curriculum", "15-curriculum"],
  ["/university", "16-university"],
];

fs.mkdirSync(OUT, { recursive: true });
const report = [];
const say = (line) => { report.push(line); console.log(line); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = {};
let cur = "login";
page.on("pageerror", (e) => { (errors[cur] ||= []).push("pageerror: " + String(e).slice(0, 200)); });
page.on("console", (m) => {
  if (m.type() !== "error" || KNOWN_NOISE.test(m.text())) return;
  (errors[cur] ||= []).push("console: " + m.text().slice(0, 200));
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await Promise.all([
  page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {}),
  page.keyboard.press("Enter"),
]);
await page.waitForTimeout(2500);
const loggedIn = !page.url().includes("/login");
say(`логин: ${loggedIn ? "ok" : "НЕ ВЫПОЛНЕН (" + page.url() + ")"}`);

for (const [route, shot] of STOPS) {
  cur = route;
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, `${shot}.png`) });
  const list = errors[route] || [];
  const text = await page.locator("body").innerText();
  say(`${route}: ${text.length} симв.; ошибок: ${list.length}`);
  for (const e of list.slice(0, 3)) say(`   ${e}`);
}

const total = Object.values(errors).reduce((sum, list) => sum + list.length, 0);
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(errors, null, 1));
await browser.close();
say(`итого ошибок: ${total}; скриншоты и report.json в ${OUT}`);
process.exit(total > 0 ? 1 : 0);
