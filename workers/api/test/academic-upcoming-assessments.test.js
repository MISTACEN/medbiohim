// /academic/state отдавал только первые 30 событий из одного окна занятий.
// Коллоквиум через две недели вытеснялся обычными парами, и /study не показывал
// ни готовность в процентах, ни план подготовки. Аттестации читаются отдельным
// запросом и получают места в сводке первыми — проверяем именно это.
import assert from "node:assert/strict";
import test from "node:test";
import { mergeUpcomingEventRows } from "../src/lib/upcoming-events.ts";

const schedule = { is_active: true };

function entry(id, date, startTime, eventKind = "class") {
  return { id, date, start_time: startTime, event_kind: eventKind, schedules: schedule };
}

test("коллоквиум за пределами окна занятий остаётся в сводке", () => {
  const classes = Array.from({ length: 40 }, (_, index) =>
    entry(`class-${index}`, `2026-11-${String(15 + (index % 10)).padStart(2, "0")}`, "08:30:00"));
  const assessments = [entry("colloquium", "2026-11-30", "12:50:00", "colloquium")];

  const merged = mergeUpcomingEventRows(assessments, classes);
  assert.equal(merged.length, 30);
  const colloquium = merged.find((event) => event.id === "colloquium");
  assert.ok(colloquium, "коллоквиум обязан попасть в ближайшие события");
  assert.equal(colloquium.event_kind, "colloquium");
});

test("аттестации не теряются даже при полном лимите", () => {
  const classes = Array.from({ length: 40 }, (_, index) =>
    entry(`class-${index}`, `2026-11-${String(15 + (index % 10)).padStart(2, "0")}`, "10:40:00"));
  const assessments = [
    entry("colloquium", "2026-11-30", "12:50:00", "colloquium"),
    entry("test-work", "2026-12-07", "12:50:00", "control_work"),
  ];

  const merged = mergeUpcomingEventRows(assessments, classes);
  assert.equal(merged.length, 30);
  assert.deepEqual(
    merged.filter((event) => event.event_kind !== "class").map((event) => event.id),
    ["colloquium", "test-work"],
  );
  assert.ok(merged.some((event) => event.id === "class-0"), "ближайшие занятия тоже остаются");
});

test("сводка идёт по дате и времени, дубли не повторяются", () => {
  const shared = entry("shared", "2026-11-16", "10:40:00");
  const merged = mergeUpcomingEventRows(
    [entry("exam", "2026-12-01", "08:30:00", "exam")],
    [shared, entry("later", "2026-11-16", "12:50:00"), entry("earlier", "2026-11-15", "14:45:00")],
  );

  assert.deepEqual(merged.map((event) => event.id), ["earlier", "shared", "later", "exam"]);
  assert.equal(merged.filter((event) => event.id === "shared").length, 1);
});

test("события неактивного расписания в сводку не попадают", () => {
  const merged = mergeUpcomingEventRows(
    [{ id: "archived-exam", date: "2026-11-21", start_time: "08:30:00", schedules: { is_active: false } }],
    [
      entry("live", "2026-11-20", "08:30:00"),
      { id: "archived", date: "2026-11-21", start_time: "09:00:00", schedules: { is_active: false } },
      { id: "nested", date: "2026-11-22", start_time: "08:30:00", schedules: [{ is_active: false }] },
    ],
  );

  assert.deepEqual(merged.map((event) => event.id), ["live"]);
});
