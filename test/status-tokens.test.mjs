import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * F1–F2 DoD: в src/** нет сырых Tailwind-статусов emerald/rose/amber —
 * статусы задаются семантическими токенами темы (--status-ok/warn/critical-*).
 * Разрешено: декоративные градиенты (from-/to-/via-), ring-фокусы и __tests__.
 */
const ROOT = path.resolve(import.meta.dirname, "../src");
const RAW = /(^|[\s"'`:])((?:hover:|dark:|focus:)?(?:text|bg|border)-(?:emerald|rose|amber)-\d+)/g;
const ALLOWED_PREFIX = /(from-|via-|to-|ring-)/;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.includes(".test.") && !entry.name.includes(".stories.")) files.push(full);
  }
  return files;
}

test("статусные цвета заданы токенами темы, а не сырыми Tailwind-классами", async () => {
  const files = await walk(ROOT);
  const offenders = [];
  for (const file of files) {
    const src = await readFile(file, "utf8");
    for (const match of src.matchAll(RAW)) {
      const line = src.slice(0, match.index).split("\n").length;
      // градиентные и ring-комбинации — декоративные, гейт их не ловит
      const lineText = src.split("\n")[line - 1] || "";
      if (ALLOWED_PREFIX.test(match[2])) continue;
      if (/from-|via-|to-|ring-/.test(lineText)) continue;
      offenders.push(`${path.relative(process.cwd(), file)}:${line}: ${match[2]}`);
    }
  }
  assert.equal(offenders.length, 0, `сырые статусные классы:\n${offenders.slice(0, 20).join("\n")}`);
});
