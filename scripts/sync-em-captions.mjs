#!/usr/bin/env node
/**
 * Синхронизация подписей ЭМ-карточек с архивом методичек.
 *
 * Источник — `data/em-captions-2026-11.json` (28 docx, сверены с банком 1:1).
 * По умолчанию ничего не пишет: печатает план изменений. Запись — только с
 * `--apply`, и перед ней сохраняет текущие подписи в `data/em-captions-backup.json`.
 *
 * Почему через админский API, а не SQL: контент карточек правится одной ручкой,
 * она же валидирует поля; прямые UPDATE в обход API не нужны.
 *
 *   node scripts/sync-em-captions.mjs            # план
 *   node scripts/sync-em-captions.mjs --apply    # записать
 */
import { readFileSync, writeFileSync } from "node:fs";

const API = (process.env.MBH_API_ORIGIN || "https://medbiohim.vercel.app") + "/api/v1";
const manifest = JSON.parse(readFileSync("data/em-captions-2026-11.json", "utf8"));
const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

function captions(file) {
  const item = manifest.files.find((entry) => entry.file === file);
  const paragraphs = (item?.paragraphs || []).map((text) => String(text).trim()).filter(Boolean);
  // Первый абзац обычно дублирует название — в подписи он лишний.
  const body = paragraphs.slice(1);
  return (body.length ? body : paragraphs).slice(0, 4);
}

const rows = (manifest.matching || [])
  .filter((row) => row.status === "confirmed" && row.card_id)
  .slice(0, limit);

if (!rows.length) {
  console.error("Нет подтверждённых совпадений в data/em-captions-2026-11.json");
  process.exit(1);
}

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      // Сессия админа: либо cookie браузера, либо bearer из MBH_TOKEN.
      ...(process.env.MBH_TOKEN ? { authorization: `Bearer ${process.env.MBH_TOKEN}` } : {}),
      ...(init.headers || {}),
    },
    credentials: "include",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(`${init.method || "GET"} ${path} → ${response.status} ${body?.error?.message || ""}`);
  }
  return body.data;
}

const plan = [];
for (const row of rows) {
  const next = captions(row.file);
  if (!next.length) continue;
  const current = await call(`/admin/trainer-cards/${encodeURIComponent(row.card_id)}`);
  const card = current.card || current;
  const preparation = { ...(card.preparation || {}) };
  const before = Array.isArray(preparation.captions) ? preparation.captions.map(String) : [];
  const same = before.length === next.length && before.every((text, index) => text === next[index]);
  plan.push({ card_id: row.card_id, name: row.card_name, before, next, same });
  console.log(`${same ? "=" : "+"} ${row.card_name}: ${next.length} подпись(и)`);
}

const changed = plan.filter((entry) => !entry.same);
console.log(`\n карточек: ${plan.length}, изменятся: ${changed.length}`);
if (!apply || !changed.length) {
  console.log(apply ? "Нечего записывать." : "План готов. Запись: --apply");
  process.exit(0);
}

writeFileSync(
  "data/em-captions-backup.json",
  JSON.stringify({ saved_at: new Date().toISOString(), items: plan }, null, 2) + "\n",
  "utf8",
);

let written = 0;
for (const entry of changed) {
  await call(`/admin/trainer-cards/${encodeURIComponent(entry.card_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ preparation: { captions: entry.next } }),
  });
  written += 1;
}
console.log(`Записано: ${written}. Бэкап: data/em-captions-backup.json`);
