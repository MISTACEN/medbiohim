import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const quickfix = await import(new URL("../src/lib/quickfix.ts", import.meta.url).href);

test("Quick fix: предпросмотр показывает только реальные изменения", () => {
  const current = { id: "x", title: "Старое", topic_id: null, is_published: true };
  const changes = quickfix.pickChanges("tests", current, { title: "Новое", topic_id: null, is_published: true, unknown_field: "ignored" });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, "title");
  assert.equal(changes[0].before, "Старое");
  assert.equal(changes[0].after, "Новое");
});

test("Quick fix: разрешены только безопасные поля и корректные типы", () => {
  assert.equal(quickfix.validateFixPatch("tests", { title: "OK" }), null);
  assert.match(quickfix.validateFixPatch("tests", { secret: "x" }), /нельзя править/);
  assert.match(quickfix.validateFixPatch("tests", { topic_id: "not-a-uuid" }), /некорректный идентификатор/);
  assert.match(quickfix.validateFixPatch("tests", { is_published: "yes" }), /boolean/);
  assert.match(quickfix.validateFixPatch("tests", { time_limit_sec: 999999 }), /14400/);
  assert.ok(quickfix.isFixTarget("workshop_items"));
  assert.equal(quickfix.isFixTarget("users"), false);
});

test("Staff routes: роли, запросы, предпросмотр и 24-часовой откат", async () => {
  const routes = await source("../src/routes/staff.ts");
  for (const contract of [
    'staff.get("/capabilities"',
    'staff.get("/groups/:id/manage"',
    'staff.patch("/groups/:id"',
    'staff.patch("/groups/:id/members/:userId"',
    'staff.patch("/groups/:id/homeworks/:homeworkId"',
    'staff.post("/groups/:id/join-requests"',
    'staff.patch("/groups/:id/join-requests/:requestId"',
    'staff.post("/requests"',
    'staff.get("/requests"',
    'staff.patch("/requests/:id"',
    'staff.post("/fixes/preview"',
    'staff.post("/fixes/apply"',
    'staff.post("/fixes/:id/revert"',
    'staff.post("/topics/merge"',
    'staff.get("/notifications"',
  ]) assert.ok(routes.includes(contract), "missing route: " + contract);

  // Курс и год поступления староста менять не может — только запрос админу.
  assert.match(routes, /LOCKED_FIELD/);
  assert.match(routes, /course_number/);
  assert.match(routes, /admission_year/);
  assert.match(routes, /is_group_starosta|role_in_group/);
  // Откат ограничен 24 часами, применение фиксирует before/after.
  assert.match(routes, /24 \* 60 \* 60 \* 1000/);
  assert.match(routes, /revertible_until/);
  assert.match(routes, /moderation_actions/);
  assert.match(routes, /content_versions/);
  // Вышестоящая роль получает уведомление.
  assert.match(routes, /notifyManagers/);
});
