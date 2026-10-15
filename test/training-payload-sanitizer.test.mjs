import test from "node:test";
import assert from "node:assert/strict";
import { protectTrainingPayload, safeTrainerQuestion } from "../src/lib/training-payload-sanitizer.mjs";

test("sanitizer recursively removes private answer keys and preparation labels", () => {
  const question = {
    prompt: "Question",
    answer: "private",
    options: [{ text: "A", correct: true }, { text: "B", is_correct: false }],
    nested: { correctAnswer: "private", explanation: "private" },
    preparation: { name: "private", organ: "private", captions: ["private"], imageUrl: "/image" },
  };

  assert.deepEqual(safeTrainerQuestion(question), {
    prompt: "Question",
    options: [{ text: "A" }, { text: "B" }],
    nested: {},
    preparation: { imageUrl: "/image" },
  });
});

test("training create response hides answer keys", () => {
  const input = { ok: true, data: { questions: [{ answer: "secret", options: [{ correct: true }] }] } };
  const result = protectTrainingPayload(input, "POST", "trainings");
  assert.deepEqual(result.data.questions, [{ options: [{}] }]);
  assert.deepEqual(input.data.questions[0], { answer: "secret", options: [{ correct: true }] });
});

test("session response hides unanswered keys but retains answered review", () => {
  const input = {
    ok: true,
    data: {
      answers: [
        { user_answer: null, question_snapshot: { answer: "secret", options: [{ correct: true }] }, review_snapshot: { explanation: "secret" } },
        { user_answer: "A", question_snapshot: { answer: "revealed after answer" }, review_snapshot: { explanation: "review" } },
      ],
    },
  };
  const result = protectTrainingPayload(input, "GET", "trainings/session-id");
  assert.deepEqual(result.data.answers[0], { user_answer: null, question_snapshot: { options: [{}] }, review_snapshot: {} });
  assert.equal(result.data.answers[1].review_snapshot.explanation, "review");
  assert.equal(input.data.answers[0].question_snapshot.answer, "secret");
});

test("sanitizer leaves unrelated responses and answered training rows untouched", () => {
  const input = { ok: true, data: { answers: [{ is_skipped: true, question_snapshot: { answer: "revealed after skip" } }] } };
  const result = protectTrainingPayload(input, "GET", "trainings/session-id");
  assert.equal(result.data.answers[0].question_snapshot.answer, "revealed after skip");
  assert.deepEqual(input.data.answers[0].question_snapshot, { answer: "revealed after skip" });
  assert.equal(protectTrainingPayload(input, "GET", "tests/session-id"), input);
});
