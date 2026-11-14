// Лента «Ближайшее» брала первые 14 элементов по дате. За две недели это одни
// занятия, поэтому коллоквиум с готовностью в процентах и кнопкой плана в ленту
// не попадал. Окно должно оставлять аттестации и оставаться хронологическим.
import assert from "node:assert/strict";
import test from "node:test";
import { limitAgendaItems } from "../src/lib/study/agenda-window.mjs";

const lesson = (id, date) => ({ id, kind: "lesson", date });

test("коллоквиум попадает в окно, даже если впереди только занятия", () => {
  const lessons = Array.from({ length: 20 }, (_, index) =>
    lesson(`lesson-${index}`, `2026-11-${String(15 + (index % 10)).padStart(2, "0")}`));
  const items = [...lessons, { id: "colloquium", kind: "colloquium", date: "2026-11-30", masteryPct: 49 }];

  const window = limitAgendaItems(items);
  assert.equal(window.length, 14);
  assert.ok(window.some((item) => item.id === "colloquium"), "коллоквиум обязан остаться в ленте");
  assert.ok(window.some((item) => item.id === "lesson-0"), "ближайшие занятия тоже видны");
});

test("лента остаётся хронологической", () => {
  const items = [
    { id: "exam", kind: "exam", date: "2026-12-01" },
    lesson("a", "2026-11-16"),
    lesson("b", "2026-11-15"),
  ];
  assert.deepEqual(limitAgendaItems(items, 3).map((item) => item.id), ["b", "a", "exam"]);
});

test("аттестации не вытесняют друг друга", () => {
  const items = [
    { id: "colloquium", kind: "colloquium", date: "2026-11-30" },
    { id: "control", kind: "control_work", date: "2026-12-07" },
    lesson("a", "2026-11-15"),
    lesson("b", "2026-11-16"),
  ];
  const window = limitAgendaItems(items, 3);
  assert.equal(window.length, 3);
  assert.deepEqual(window.map((item) => item.id), ["a", "colloquium", "control"]);
});
