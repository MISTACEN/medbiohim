import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// FD8: единый расчёт «ближайшей пары» — тест на чистую функцию pickNextLesson.
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const source = await readFile(new URL("../src/lib/now-parts.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", js)(module.exports, require_, module);
const { pickNextLesson, nowParts } = module.exports;

const NOW = { date: "2026-10-28", timeLabel: "10:30", minutes: 630 };

test("pickNextLesson returns the still-upcoming lesson today", () => {
  const rows = [
    { id: "1", date: "2026-10-28", start_time: "08:00" },
    { id: "2", date: "2026-10-28", start_time: "11:45" },
    { id: "3", date: "2026-10-28", start_time: "14:00" },
  ];
  assert.equal(pickNextLesson(rows, NOW)?.id, "2");
});

test("pickNextLesson skips past days and picks the earliest future day", () => {
  const rows = [
    { id: "old", date: "2026-10-27", start_time: "18:00" },
    { id: "tomorrow-late", date: "2026-10-29", start_time: "15:00" },
    { id: "tomorrow-early", date: "2026-10-29", start_time: "08:30" },
  ];
  assert.equal(pickNextLesson(rows, NOW)?.id, "tomorrow-early");
});

test("pickNextLesson includes a lesson starting exactly now", () => {
  const rows = [{ id: "now", date: "2026-10-28", start_time: "10:30" }];
  assert.equal(pickNextLesson(rows, NOW)?.id, "now");
});

test("pickNextLesson tolerates broken rows and empty input", () => {
  assert.equal(pickNextLesson([], NOW), null);
  assert.equal(pickNextLesson([{ id: "x", date: null, start_time: null }], NOW), null, "null-дата не раньше today → отброшена");
});

test("nowParts produces platform-tz date and HH:MM label", () => {
  const now = nowParts();
  assert.match(now.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(now.timeLabel, /^\d{2}:\d{2}$/);
  assert.equal(now.minutes, now.hour * 60 + now.minute);
});

test("schedule page and dashboard both import the shared module", async () => {
  for (const file of ["../src/app/page.tsx", "../src/app/schedule/page.tsx"]) {
    const src = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(src, /@\/lib\/now-parts/, file + " не использует общий расчёт времени");
  }
});
