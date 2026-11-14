import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("study-prep mounted under the academic module gate", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import studyPrep from "\.\/routes\/study-prep"/);
  assert.match(index, /v1\.route\("\/study-prep", gatedModule\("academic", studyPrep\)\)/);
});

test("prep plan reads are owner-scoped and event-checked", async () => {
  const route = await source("../src/routes/study-prep.ts");
  // План читается и пишется только своим пользователем.
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  // Событие ищется в расписании группы пользователя.
  assert.match(route, /group_memberships/);
  assert.match(route, /"EVENT_NOT_FOUND"/);
  // Пользователь не может подставить чужой user_id из тела запроса.
  assert.doesNotMatch(route, /user_id:\s*payload/);
});

test("plan is deterministic rules, not an LLM call", async () => {
  const route = await source("../src/routes/study-prep.ts");
  assert.match(route, /export function buildPlanDays/);
  assert.match(route, /generated_by: "rules"/);
  // Роут не ходит в ИИ и не расходует квоты тьютора.
  assert.doesNotMatch(route, /aiChat|generateAiCompletion|workersAiComplete/);
});

test("missing study_plans table degrades instead of failing", async () => {
  const route = await source("../src/routes/study-prep.ts");
  assert.match(route, /function isMissingTable/);
  assert.match(route, /42P01/);
  assert.match(route, /persisted/);
});

test("study_plans migration keeps RLS owner-only", async () => {
  const sql = await source("../../../database/migrations/20261114_study_plans.sql");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on public\.study_plans from anon/i);
});
