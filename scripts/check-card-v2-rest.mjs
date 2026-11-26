/**
 * Проверка PostgREST-контракта карточки v2 без воркера:
 * embed trainer_card_images и фильтр is_archived должны приниматься API базы.
 * Read-only: только GET.
 */
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(repo, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
  if (!m) continue;
  let value = m[2].trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = value;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / service key missing");

const select = "id,mode_set,is_archived,hotspots,trainer_card_images(id,caption,sort_order,hotspots)";
const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/trainer_feed_cards?select=${encodeURIComponent(select)}&is_archived=eq.false&limit=3`;
const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 1200));
if (!res.ok) process.exit(1);
const rows = JSON.parse(text);
if (!rows.every((row) => Array.isArray(row.trainer_card_images))) {
  console.error("embed trainer_card_images отсутствует в ответе");
  process.exit(1);
}
console.log("ok: embed и фильтр is_archived приняты, карточек", rows.length);