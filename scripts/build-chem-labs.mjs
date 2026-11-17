#!/usr/bin/env node
/**
 * Собирает лабораторные по органике в public/content/portals/lectures-chem.json.
 * Контент — scripts/chem-labs.content.mjs, формулы уходят в KaTeX через $$…$$.
 */
import fs from "node:fs";
import { LABS } from "./chem-labs.content.mjs";

const TARGET = "public/content/portals/lectures-chem.json";
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(blocks) {
  const out = [];
  for (const block of blocks) {
    if (block.t === "h2") out.push(`<h2>${escapeHtml(block.v)}</h2>`);
    else if (block.t === "h3") out.push(`<h3>${escapeHtml(block.v)}</h3>`);
    else if (block.t === "eq") out.push(`<div class="lec-math">\\[${block.v}\\]</div>`);
    else if (block.t === "note") out.push(`<p><strong>${escapeHtml(block.v)}</strong></p>`);
    else if (block.t === "ul") out.push(`<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    else out.push(`<p>${escapeHtml(block.v)}</p>`);
  }
  return out.join("\n");
}

const data = JSON.parse(fs.readFileSync(TARGET, "utf8"));
data.items ??= [];

for (const lab of LABS) {
  const item = { id: lab.id, title: lab.title, html: render(lab.blocks) };
  const index = data.items.findIndex((existing) => existing.id === lab.id);
  if (index >= 0) data.items[index] = item;
  else data.items.push(item);
  console.log(`${lab.id}: ${item.html.length} символов HTML`);
}

data.stats = { ...(data.stats ?? {}), lectures: data.items.length };
fs.writeFileSync(TARGET, `${JSON.stringify(data, null, 1)}\n`);
console.log(`записано: ${TARGET} (${data.items.length} лекций)`);
