import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// guards.ts — чистые функции без зависимостей; компилируем исходник штатным
// трансвайлером TypeScript (есть в node_modules) вместо хрупких регэкспов.
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const source = await readFile(new URL("../src/lib/guards.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", js)(module.exports, require_, module);
const { isAnnouncement, isProfile, isSubjectCard, isScheduleRow, isTestItem, filterSafe } = module.exports;

test("isAnnouncement accepts a valid announcement and rejects junk", () => {
  assert.equal(isAnnouncement({ id: "a1", title: "Объявление", body: "текст" }), true);
  assert.equal(isAnnouncement({ id: "a1", body: "без заголовка" }), true);
  assert.equal(isAnnouncement({ id: "a1" }), false, "нет ни title, ни body");
  assert.equal(isAnnouncement({ title: "без id" }), false);
  assert.equal(isAnnouncement("строка"), false);
  assert.equal(isAnnouncement(null), false);
});

test("isProfile requires id", () => {
  assert.equal(isProfile({ id: "u1", email: "a@b.c" }), true);
  assert.equal(isProfile({ email: "a@b.c" }), false);
  assert.equal(isProfile(undefined), false);
});

test("isSubjectCard requires id and name", () => {
  assert.equal(isSubjectCard({ id: "s1", name: "Гистология" }), true);
  assert.equal(isSubjectCard({ id: "s1" }), false);
  assert.equal(isSubjectCard({ name: "Гистология" }), false);
});

test("isScheduleRow requires id and ISO date", () => {
  assert.equal(isScheduleRow({ id: "e1", date: "2026-10-28" }), true);
  assert.equal(isScheduleRow({ id: "e1", date: "2026-10-28T09:00:00Z" }), true);
  assert.equal(isScheduleRow({ id: "e1", date: "28.10.2026" }), false, "не ISO");
  assert.equal(isScheduleRow({ id: "e1" }), false);
  assert.equal(isScheduleRow({ date: "2026-10-28" }), false);
});

test("isTestItem accepts title or name", () => {
  assert.equal(isTestItem({ id: "t1", title: "Неделя 14" }), true);
  assert.equal(isTestItem({ id: "t1", name: "Неделя 14" }), true);
  assert.equal(isTestItem({ id: "t1" }), false);
});

test("filterSafe drops broken rows and tolerates non-arrays", () => {
  const rows = [
    { id: "e1", date: "2026-10-28" },
    { id: "e2" },
    null,
    { id: "e3", date: "2026-10-29" },
  ];
  assert.equal(filterSafe(rows, isScheduleRow).length, 2);
  assert.equal(filterSafe("не массив", isScheduleRow).length, 0);
  assert.equal(filterSafe(undefined, isScheduleRow).length, 0);
});

test("guards are wired into api.ts payload boundaries", async () => {
  const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  assert.match(api, /from "@\/lib\/guards"/, "guards не импортированы в api.ts");
});
