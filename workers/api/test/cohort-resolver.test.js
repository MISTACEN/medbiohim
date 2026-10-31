/**
 * Резолвер когорты (Блок 5 бэклога): «МБХ 201» в учебном году 2026-27 —
 * когорта поступления 2025 (2 курс). Привязка к стабильному id группы, а не
 * к меняющемуся имени: в 2027-28 «МБХ 301» найдёт ту же группу.
 *
 * Run: node --test test/cohort-resolver.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as resolver from "../src/lib/cohort-resolver.ts";

// 10 октября 2026 = учебный год 2026-27.
const DATE_2026 = new Date("2026-10-10T00:00:00Z");
const DATE_2027 = new Date("2027-10-10T00:00:00Z");

const GROUPS = [
  { id: "g-mbkh-2025", code: "МБХ 201", name: "МБХ 201", admission_year: 2025, stream: "01", is_active: true },
  { id: "g-mbkh-2024", code: "МБХ 301", name: "МБХ 301", admission_year: 2024, stream: "01", is_active: true },
  { id: "g-mbkh-2025-2", code: "МБХ 202", name: "МБХ 202", admission_year: 2025, stream: "02", is_active: true },
  { id: "g-lech-2025", code: "ЛЕЧ 101", name: "ЛЕЧ 101", admission_year: 2025, stream: "01", is_active: true },
];

test("parseCohortLabel: база + курс + поток из типовых названий", () => {
  assert.deepEqual(resolver.parseCohortLabel("МБХ 201"), { base: "МБХ", course: 2, stream: "01" });
  assert.deepEqual(resolver.parseCohortLabel("МБХ-201"), { base: "МБХ", course: 2, stream: "01" });
  assert.deepEqual(resolver.parseCohortLabel("МБХ 2/01"), { base: "МБХ", course: 2, stream: "01" });
  assert.deepEqual(resolver.parseCohortLabel("МБХ 301"), { base: "МБХ", course: 3, stream: "01" });
  assert.deepEqual(resolver.parseCohortLabel("расписание МБХ 202 (сессия).xlsx"), { base: "расписание МБХ", course: 2, stream: "02" });
});

test("parseCohortLabel: без цифр курс не выдумывается", () => {
  const parsed = resolver.parseCohortLabel("МБХ");
  assert.equal(parsed.base, "МБХ");
  assert.equal(parsed.course, null);
  assert.equal(parsed.stream, null);
  assert.equal(resolver.parseCohortLabel(""), null);
  assert.equal(resolver.parseCohortLabel(null), null);
});

test("резолв: «МБХ 201» в 2026-27 находит когорту 2025 (курс 2)", () => {
  const r = resolver.resolveGroupByCohort("МБХ 201", GROUPS, DATE_2026);
  assert.equal(r.reason, "ok");
  assert.equal(r.match?.id, "g-mbkh-2025");
  assert.equal(r.computed.academic_year, 2026);
});

test("резолв: в 2027-28 тот же id когорты находится по «МБХ 301»", () => {
  // Когорта 2025 через год стала 3 курсом: файл называется иначе, группа та же.
  const r2026 = resolver.resolveGroupByCohort("МБХ 201", GROUPS, DATE_2026);
  const r2027 = resolver.resolveGroupByCohort("МБХ 301", GROUPS, DATE_2027);
  assert.equal(r2026.match?.id, "g-mbkh-2025");
  assert.equal(r2027.match?.id, "g-mbkh-2025", "когорта стабильна, меняется только имя файла");
  assert.equal(r2027.match?.id, r2026.match?.id);
});

test("резолв: поток различает группы одной когорты", () => {
  const r = resolver.resolveGroupByCohort("МБХ 202", GROUPS, DATE_2026);
  assert.equal(r.match?.id, "g-mbkh-2025-2");
});

test("резолв: больше одной группы — match null, кандидаты на подтверждение", () => {
  const extra = [...GROUPS, { id: "g-mbkh-2025-3", code: "МБХ 203", name: "МБХ 203", admission_year: 2025, stream: "03", is_active: true }];
  const r = resolver.resolveGroupByCohort("МБХ 2", extra, DATE_2026);
  assert.equal(r.match, null);
  assert.ok(r.candidates.length >= 3, "три потока когорты 2025");
});

test("резолв: нет курса в названии — честный reason, а не угадывание", () => {
  const r = resolver.resolveGroupByCohort("МБХ", GROUPS, DATE_2026);
  assert.equal(r.match, null);
  assert.equal(r.reason, "no_course_in_label");
});

test("резолв: база не совпала — no_match, не исключение", () => {
  const r = resolver.resolveGroupByCohort("ХИМ 201", GROUPS, DATE_2026);
  assert.equal(r.match, null);
  assert.equal(r.reason, "no_match");
  assert.equal(r.candidates.length, 0);
});

test("резолв: сентябрьская граница учебного года (1 сентября — новый курс)", () => {
  const august = resolver.resolveGroupByCohort("МБХ 201", GROUPS, new Date("2027-08-20T00:00:00Z"));
  const september = resolver.resolveGroupByCohort("МБХ 301", GROUPS, new Date("2027-09-05T00:00:00Z"));
  assert.equal(august.match?.id, "g-mbkh-2025", "в августе 2027 когорта 2025 ещё 2 курс");
  assert.equal(september.match?.id, "g-mbkh-2025", "с 1 сентября 2027 она же 3 курс");
});
