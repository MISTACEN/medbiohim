import test from "node:test";
import assert from "node:assert/strict";
import {
  finishSupabaseTestAttempt,
  getSupabaseTestDetail,
  listSupabaseMyAttempts,
  saveSupabaseTestAnswer,
  startSupabaseTestAttempt,
} from "../src/test-attempts.js";

const env = { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "public-anon-key-for-test-only" };
const groupId = "11111111-1111-4111-8111-111111111111";
const testId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const subjectId = "44444444-4444-4444-8444-444444444444";
const questionId = "55555555-5555-4555-8555-555555555555";
const question = {
  id: questionId, subject_id: subjectId, module_id: null, topic_id: null, type: "mcq",
  text: "Выберите правильный вариант", answer: "A",
  options: [{ label: "A", correct: true }, { label: "B", correct: false }],
  difficulty: 1, archived_at: null, modules: null, topics: null,
};
function makeRequest(path, method = "GET", body = undefined) {
  return new Request("https://worker.example/api/v1" + path, {
    method,
    headers: { authorization: "Bearer user-token", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function baseMock(handler) {
  return async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    assert.equal(init.headers.authorization, "Bearer user-token");
    assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
    return handler(parsed, init);
  };
}
function membershipRow() {
  return [{ group_id: groupId, groups: { id: groupId, name: "МБХ-201", is_active: true, specialty_slug: "mbh", course_number: 2 } }];
}

test("test detail exposes visible question text and option labels without correct answers", async () => {
  const result = await getSupabaseTestDetail(makeRequest("/tests/" + testId + "?group_id=" + groupId), env, testId, groupId, baseMock((url) => {
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify(membershipRow()), { status: 200 });
    if (url.pathname === "/rest/v1/tests") return new Response(JSON.stringify([{ id: testId, title: "Тест", subject_id: subjectId, is_published: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: subjectId, name: "Биохимия", specialty_slug: "mbh", is_active: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/test_questions") return new Response(JSON.stringify([{ test_id: testId, question_id: questionId, order_index: 0, questions: question }]), { status: 200 });
    throw new Error("unexpected path " + url.pathname);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.test.title, "Тест");
  assert.equal(result.data.questions.length, 1);
  assert.equal(result.data.questions[0].body, question.text);
  assert.deepEqual(result.data.questions[0].options, [{ label: "A" }, { label: "B" }]);
  assert.equal("answer" in result.data.questions[0], false);
  assert.equal("correct" in result.data.questions[0].options[0], false);
});

test("starting a test stores the private answer snapshot but returns no snapshot to the browser", async () => {
  const result = await startSupabaseTestAttempt(makeRequest("/tests/" + testId + "/start", "POST"), env, testId, groupId, baseMock((url, init) => {
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify(membershipRow()), { status: 200 });
    if (url.pathname === "/rest/v1/tests") return new Response(JSON.stringify([{ id: testId, title: "Тест", subject_id: subjectId, is_published: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: subjectId, name: "Биохимия", specialty_slug: "mbh", is_active: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/test_attempts" && !init.method) return new Response("[]", { status: 200 });
    if (url.pathname === "/rest/v1/test_questions") return new Response(JSON.stringify([{ test_id: testId, question_id: questionId, order_index: 0, questions: question }]), { status: 200 });
    if (url.pathname === "/rest/v1/test_attempts" && init.method === "POST") {
      const input = JSON.parse(init.body);
      assert.equal(input.user_id, "user-1");
      assert.equal(input.group_id, groupId);
      assert.equal(input.question_snapshot[0].answer, "A");
      assert.equal(input.question_snapshot[0].options[0].correct, true);
      assert.ok(!url.searchParams.get("select").includes("question_snapshot"));
      return new Response(JSON.stringify([{ id: attemptId, test_id: testId, user_id: "user-1", status: "in_progress", group_id: groupId, max_score: 1 }]), { status: 201 });
    }
    throw new Error("unexpected path " + url.pathname + " method " + init.method);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.attempt.id, attemptId);
  assert.equal("question_snapshot" in result.data.attempt, false);
});

test("saving a multiple-choice answer grades server-side and upserts by attempt/question", async () => {
  const snapshot = [{ ...question, options: [{ label: "A", correct: true }, { label: "B", correct: false }] }];
  const result = await saveSupabaseTestAnswer(makeRequest("/tests/attempts/" + attemptId + "/answers", "POST", { question_id: questionId, answer_text: "A" }), env, attemptId, { question_id: questionId, answer_text: "A" }, baseMock((url, init) => {
    if (url.pathname === "/rest/v1/test_attempts") return new Response(JSON.stringify([{ id: attemptId, user_id: "user-1", status: "in_progress", question_snapshot: snapshot }]), { status: 200 });
    if (url.pathname === "/rest/v1/test_answers") {
      assert.equal(init.method, "POST");
      assert.equal(url.searchParams.get("on_conflict"), "attempt_id,question_id");
      const body = JSON.parse(init.body);
      assert.equal(body.is_correct, true);
      assert.equal(body.grading_status, "deterministic");
      return new Response(JSON.stringify([{ id: "answer-1", ...body }]), { status: 201 });
    }
    throw new Error("unexpected path " + url.pathname);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.answer.is_correct, true);
  assert.equal(result.data.answer.grading_status, "deterministic");
});

test("finishing attempt calculates score from saved answers and is idempotent after submission", async () => {
  const snapshot = [{ id: questionId }, { id: "66666666-6666-4666-8666-666666666666" }];
  const result = await finishSupabaseTestAttempt(makeRequest("/tests/attempts/" + attemptId + "/finish", "POST"), env, attemptId, baseMock((url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/test_attempts" && !init.method) return new Response(JSON.stringify([{ id: attemptId, test_id: testId, user_id: "user-1", status: "in_progress", question_snapshot: snapshot, group_id: groupId }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/test_answers") return new Response(JSON.stringify([{ question_id: questionId, is_correct: true }, { question_id: "66666666-6666-4666-8666-666666666666", is_correct: false }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/test_attempts" && init.method === "PATCH") {
      const patch = JSON.parse(init.body);
      assert.equal(patch.status, "submitted");
      assert.equal(patch.score, 1);
      assert.equal(patch.max_score, 2);
      assert.equal(patch.percent, 50);
      return new Response(JSON.stringify([{ id: attemptId, test_id: testId, user_id: "user-1", status: "submitted", score: 1, max_score: 2, percent: 50, group_id: groupId }]), { status: 200 });
    }
    throw new Error("unexpected path " + parsed.pathname);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.attempt.status, "submitted");
  assert.equal(result.data.attempt.percent, 50);
  assert.equal("question_snapshot" in result.data.attempt, false);
});

test("attempt history is limited to the authenticated user's selected group", async () => {
  const result = await listSupabaseMyAttempts(makeRequest("/my/attempts?group_id=" + groupId), env, { group_id: groupId }, baseMock((url, init) => {
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify(membershipRow()), { status: 200 });
    if (url.pathname === "/rest/v1/test_attempts") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-1");
      assert.equal(url.searchParams.get("group_id"), "eq." + groupId);
      return new Response(JSON.stringify([{ id: attemptId, user_id: "user-1", test_id: testId, status: "submitted", score: 1, max_score: 1, tests: { title: "Тест", subject_id: subjectId } }]), { status: 200 });
    }
    throw new Error("unexpected path " + url.pathname);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.items[0].test_title, "Тест");
  assert.equal(result.data.items[0].group_id, undefined);
  assert.equal("question_snapshot" in result.data.items[0], false);
});
