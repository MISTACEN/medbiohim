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
const moduleShim = { exports: {} };
new Function("exports", "require", "module", js)(moduleShim.exports, require_, moduleShim);
const { pickNextLesson, nowParts } = moduleShim.exports;

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



// Расписание после разнесения считает время в хуке, а хук берёт расчёт из
// components/schedule/utils, который оборачивает общий @/lib/now-parts.
// Проверяем цепочку целиком: свой расчёт времени в расписании по-прежнему запрещён.
test("schedule feature and dashboard both use the shared time calculation", async () => {
  // Главная разнесена: страница собирает хук домена, а время считает хук.
  const dashboardPage = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.match(dashboardPage, /@\/components\/home\/useHomeDashboard/, "dashboard не собирается из своего хука");
  const dashboardHook = await readFile(new URL("../src/components/home/useHomeDashboard.ts", import.meta.url), "utf8");
  assert.match(dashboardHook, /@\/lib\/now-parts/, "dashboard не использует общий расчёт времени");

  const hook = await readFile(new URL("../src/components/schedule/useSchedulePage.ts", import.meta.url), "utf8");
  assert.match(hook, /nowParts/, "хук расписания не считает время");
  assert.match(hook, /@\/components\/schedule\/utils/, "хук должен брать nowParts из общего utils расписания");

  const utils = await readFile(new URL("../src/components/schedule/utils.ts", import.meta.url), "utf8");
  assert.match(utils, /@\/lib\/now-parts/, "utils расписания должен оборачивать общий расчёт времени");
});
