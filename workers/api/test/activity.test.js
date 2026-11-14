import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("activity feed is mounted student-only and read-only", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import activity from "\.\/routes\/activity"/);
  assert.match(index, /v1\.route\("\/activity", studentOnly\(activity\)\)/);

  const route = await source("../src/routes/activity.ts");
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  // Клиент не может создать событие: в маршруте нет insert.
  assert.doesNotMatch(route, /\.insert\(/);
  assert.match(route, /Math\.max\(1, Math\.min\(50, Math\.trunc\(requested\)\)\)/);
  assert.match(route, /"ACTIVITY_NOT_MIGRATED"/);
});

test("event writes use the service client and never break the main action", async () => {
  const lib = await source("../src/lib/activity.ts");
  assert.match(lib, /createServiceClient/);
  assert.match(lib, /KNOWN\.has\(String\(input\.kind\)\)\) return false;/);
  // Любая ошибка записи — предупреждение, а не исключение наружу.
  assert.match(lib, /catch \(error\) \{\n    console\.warn\("\[activity:log\]"/);
  assert.match(lib, /"test_finished"/);
  assert.match(lib, /"homework_marked"/);
});

test("all six write points are wired", async () => {
  const tests = await source("../src/routes/tests.ts");
  assert.match(tests, /kind: "test_finished"/);
  const srs = await source("../src/routes/srs.ts");
  assert.match(srs, /kind: "srs_review"/);
  assert.ok((srs.match(/kind: "srs_review"/g) || []).length >= 2, "both review routes log");
  const ai = await source("../src/routes/ai.ts");
  assert.match(ai, /kind: "tutor_message"/);
  const lectures = await source("../src/routes/lectures.ts");
  assert.match(lectures, /kind: "lecture_opened"/);
  const assignments = await source("../src/routes/assignments.ts");
  assert.match(assignments, /kind: "assignment_updated"/);
  const homework = await source("../src/routes/homework.ts");
  assert.match(homework, /kind: "homework_marked"/);
});

test("repeated lecture opens are debounced for half an hour", async () => {
  const lib = await source("../src/lib/activity.ts");
  assert.match(lib, /LECTURE_OPEN_DEBOUNCE_MINUTES = 30/);
  assert.match(lib, /input\.kind === "lecture_opened" && \(await recentlyLogged\(/);
  assert.match(lib, /\.eq\("ref_id", refId\)/);
  // Сбой проверки не теряет событие: пишем как обычно.
  assert.match(lib, /if \(error\) return false;\n    return Array\.isArray\(data\)/);
});

test("retention is 180 days and runs in the existing cron", async () => {
  const job = await source("../src/jobs/activity-prune.ts");
  assert.match(job, /ACTIVITY_RETENTION_DAYS = 180/);
  assert.match(job, /skipped: "no_service_role"/);
  assert.match(job, /skipped: "table_missing"/);
  const index = await source("../src/index.ts");
  assert.match(index, /runActivityPrune/);
});

test("activity_events migration keeps writes server-only", async () => {
  const sql = await source("../../../database/migrations/20261114_activity_events.sql");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for select to authenticated/);
  // Политик на insert/update/delete нет — историю нельзя подделать из клиента.
  assert.doesNotMatch(sql, /for insert to authenticated/);
  assert.match(sql, /revoke all on public\.activity_events from anon/i);
  assert.match(sql, /on public\.activity_events\(user_id, created_at desc\)/);
});

test("frontend shows the feed on /study", async () => {
  const endpoints = await source("../../../src/lib/endpoints.ts");
  assert.match(endpoints, /activity: \(query\?: string\): string => withQuery\("\/activity", query\)/);
  const page = await source("../../../src/app/study/page.tsx");
  assert.match(page, /<RecentActivity \/>/);
  const component = await source("../../../src/components/study/RecentActivity.tsx");
  assert.match(component, /export function relativeTime/);
  // Неизвестный вид события не ломает рендер.
  assert.match(component, /META\[event\.kind\] \|\|/);
});
