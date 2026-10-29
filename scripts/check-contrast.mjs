#!/usr/bin/env node
/**
 * F1–F2 (TECH-AUDIT-PLAN §5.1): проверка контраста WCAG для семантических
 * статусных токенов всех тем из src/app/globals.css.
 *
 * Правила:
 *  • текст: --status-*-fg на --status-*-bg → ≥ 4.5 (AA);
 *  • рамка полей ввода: --input-border поверх фона карточки → ≥ 3.0.
 *
 * Прозрачные цвета смешиваются с фоном (card может быть rgba — смешиваем
 * card поверх background, как в браузере). Запуск: node scripts/check-contrast.mjs
 * Падение (exit 1) — гейт в CI.
 */
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

// --- разбор тем -------------------------------------------------------------
const themes = [];
const themeRe = /(?:^|\n)((?::root|html(?:\.dark)?\[data-theme="[^"]+"\])(?:\s*,\s*\nhtml(?:\.dark)?\[data-theme="[^"]+"\])*?)\s*\{([^}]*)\}/g;
let match;
while ((match = themeRe.exec(css))) {
  const body = match[2];
  const vars = {};
  for (const line of body.split("\n")) {
    const m = line.match(/--([a-z0-9-]+):\s*([^;]+);/);
    if (m) vars[m[1]] = m[2].trim();
  }
  if (vars["status-ok-fg"]) themes.push({ name: (match[1].match(/data-theme="([^"]+)"/) || [, "classic-light"])[1], vars });
}
if (!themes.length) {
  console.error("Не найдено ни одной темы со статусными токенами");
  process.exit(1);
}

// --- цвета -------------------------------------------------------------------
function parseColor(value) {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(",").map((x) => parseFloat(x.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

/** Смешать цвет поверх фона (alpha compositing), как в браузере. */
function blend(color, background) {
  const c = typeof color === "string" ? parseColor(color) : color;
  if (!c) return null;
  if (c.a >= 1) return c;
  const bg = background ? (typeof background === "string" ? blend(background, null) : background) : { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: Math.round(c.r * c.a + bg.r * (1 - c.a)),
    g: Math.round(c.g * c.a + bg.g * (1 - c.a)),
    b: Math.round(c.b * c.a + bg.b * (1 - c.a)),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const ch = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// --- проверки ----------------------------------------------------------------
const STATUSES = ["ok", "warn", "critical", "info", "neutral", "pending"];
let failures = 0;

for (const theme of themes) {
  const background = blend(theme.vars.background || "#ffffff", "#ffffff");
  const cardRaw = theme.vars.card || "#ffffff";
  const card = blend(cardRaw, background); // rgba-карточки поверх фона
  for (const status of STATUSES) {
    const fg = parseColor(theme.vars[`status-${status}-fg`] || "");
    const bg = blend(theme.vars[`status-${status}-bg`] || "", card);
    if (!fg || !bg) {
      console.error(`[${theme.name}] status-${status}: не удалось разобрать пару`);
      failures += 1;
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= 4.5;
    console.log(`[${theme.name}] ${status}: ${ratio.toFixed(2)}:1 ${ok ? "✓" : "✗ (нужно ≥ 4.5)"}`);
    if (!ok) failures += 1;
  }
  // Рамка полей ввода ≥ 3:1
  const inputBorder = blend(theme.vars["input-border"] || "", card);
  if (inputBorder) {
    const ratio = contrast(inputBorder, card);
    const ok = ratio >= 3.0;
    console.log(`[${theme.name}] input-border: ${ratio.toFixed(2)}:1 ${ok ? "✓" : "✗ (нужно ≥ 3.0)"}`);
    if (!ok) failures += 1;
  }
}

console.log(`\nТем проверено: ${themes.length}; провалов: ${failures}`);
process.exit(failures ? 1 : 0);
