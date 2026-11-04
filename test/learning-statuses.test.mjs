/**
 * Канонические статусы подготовки: единая модель для /schedule, главной и
 * плана темы. Проверяем честный вывод из реальных полей API — без фантазий.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { homeworkPrepStatus, topicPrepStatus, prepReadiness, needsAttention, PREP_STATUS_LABELS, PREP_STATUS_TONE } from "../src/lib/learning/statuses.ts";

const TODAY = "2026-11-05";

test("homeworkPrepStatus: сдача и оценка важнее отметки о выполнении", () => {
  assert.equal(homeworkPrepStatus({ submission_status: "graded" }, TODAY), "graded");
  assert.equal(homeworkPrepStatus({ submission_status: "submitted" }, TODAY), "submitted");
  // «returned» — преподаватель вернул работу: это отработка, а не «сдано».
  assert.equal(homeworkPrepStatus({ submission_status: "returned", my_status: "done" }, TODAY), "rework");
});

test("homeworkPrepStatus: выполнено, просрочено, не начато", () => {
  assert.equal(homeworkPrepStatus({ my_status: "done" }, TODAY), "done");
  assert.equal(homeworkPrepStatus({ my_completed: true }, TODAY), "done");
  assert.equal(homeworkPrepStatus({ due_date: "2026-11-01" }, TODAY), "overdue");
  // Просроченное, но выполненное — не «просрочено».
  assert.equal(homeworkPrepStatus({ due_date: "2026-11-01", my_status: "done" }, TODAY), "done");
  assert.equal(homeworkPrepStatus({ due_date: "2026-12-01" }, TODAY), "not_started");
  // Просроченная сданная работа — «сдано», не «просрочено».
  assert.equal(homeworkPrepStatus({ due_date: "2026-11-01", submission_status: "submitted" }, TODAY), "submitted");
  // Пустая запись — «не начато», без выдуманных статусов.
  assert.equal(homeworkPrepStatus({}, TODAY), "not_started");
  // Будущий срок в due_at (ISO) тоже разбирается.
  assert.equal(homeworkPrepStatus({ due_at: "2026-11-10T18:00:00" }, TODAY), "not_started");
  assert.equal(homeworkPrepStatus({ due_at: "2026-11-01T18:00:00" }, TODAY), "overdue");
});

test("topicPrepStatus: агрегат честен к незакрытым заданиям", () => {
  const done = { status: "done" };
  assert.equal(topicPrepStatus([]), "not_started");
  assert.equal(topicPrepStatus([done, { status: "graded" }]), "done");
  assert.equal(topicPrepStatus([done, { status: "not_started" }]), "not_started");
  assert.equal(topicPrepStatus([{ status: "in_progress" }]), "in_progress");
  assert.equal(topicPrepStatus([{ status: "overdue" }]), "overdue");
  // Отработка важнее прогресса, но не важнее просрочки (порядок проверок).
  assert.equal(topicPrepStatus([{ status: "rework" }, { status: "in_progress" }]), "rework");
});

test("prepReadiness: 0..100, частичный прогресс даёт частичный вес", () => {
  assert.equal(prepReadiness([]), 0);
  assert.equal(prepReadiness([{ status: "done" }]), 100);
  assert.equal(prepReadiness([{ status: "not_started" }]), 0);
  assert.equal(prepReadiness([{ status: "in_progress" }]), 50);
  assert.equal(prepReadiness([{ status: "done" }, { status: "not_started" }]), 50);
  assert.equal(prepReadiness([{ status: "done" }, { status: "in_progress" }]), 75);
});

test("needsAttention: только реальный долг", () => {
  assert.equal(needsAttention("overdue"), true);
  assert.equal(needsAttention("rework"), true);
  assert.equal(needsAttention("failed"), true);
  assert.equal(needsAttention("not_started"), false);
  assert.equal(needsAttention("done"), false);
});

test("подписи и тона определены для всех статусов", () => {
  for (const label of Object.values(PREP_STATUS_LABELS)) assert.ok(label.length > 0);
  for (const tone of Object.values(PREP_STATUS_TONE)) assert.ok(["ok", "warn", "critical", "muted", "primary"].includes(tone));
});
