import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseBankProgress, getSupabaseTestBankDetail, getSupabaseTestDetail, listSupabaseMyAttempts } from "../src/test-attempts.js";

const env = { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "public-anon-key-for-test-only" };
const groupId = "11111111-1111-4111-8111-111111111111";
const testId = "22222222-2222-4222-8222-222222222222";
const subjectId = "44444444-4444-4444-8444-444444444444";
const questionId = "55555555-5555-4555-8555-555555555555";
const question = {
  id: questionId, subject_id: subjectId, module_id: null, topic_id: null, type: "mcq",
  text: "Выберите правильный вариант", answer: "A",
  options: [{ label: "A", correct: true }, { label: "B", correct: false }],
  difficulty: 1, archived_at: null, modules: null, topics: null,
};
function makeRequest(path) {
  return new Request("https://worker.example/api/v1" + path, { headers: { authorization: "Bearer user-token" } });
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

test("full-bank detail shows answers and correct options only on the dedicated bank route", async () => {
  const result = await getSupabaseTestBankDetail(makeRequest("/tests/" + testId + "/bank?group_id=" + groupId), env, testId, groupId, baseMock((url) => {
    if (url.pathname === "/rest/v1/tests") return new Response(JSON.stringify([{ id: testId, title: "Тест", subject_id: subjectId, is_published: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify(membershipRow()), { status: 200 });
    if (url.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: subjectId, name: "Биохимия", specialty_slug: "mbh", is_active: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/test_questions") return new Response(JSON.stringify([{ test_id: testId, question_id: questionId, order_index: 0, questions: question }]), { status: 200 });
    throw new Error("unexpected path " + url.pathname);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.questions[0].answer, "A");
  assert.equal(result.data.questions[0].options[0].correct, true);
});

test("attempt history is limited to the authenticated user's selected group and safe fields", async () => {
  const result = await listSupabaseMyAttempts(makeRequest("/my/attempts?group_id=" + groupId), env, { group_id: groupId }, baseMock((url) => {
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify(membershipRow()), { status: 200 });
    if (url.pathname === "/rest/v1/test_attempts") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-1");
      assert.equal(url.searchParams.get("group_id"), "eq." + groupId);
      assert.ok(!url.searchParams.get("select").includes("question_snapshot"));
      return new Response(JSON.stringify([{ id: "attempt-1", user_id: "user-1", test_id: testId, status: "submitted", score: 1, max_score: 1, group_id: groupId, tests: { title: "Тест", subject_id: subjectId } }]), { status: 200 });
    }
    throw new Error("unexpected path " + url.pathname);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.items[0].test_title, "Тест");
  assert.equal(result.data.items[0].group_id, groupId);
  assert.equal("question_snapshot" in result.data.items[0], false);
});


test("bank progress counts published questions and selected-group sequential results only", async () => {
  const result = await getSupabaseBankProgress(makeRequest("/tests/" + testId + "/bank-progress?group_id=" + groupId), env, testId, groupId, baseMock((url) => {
    if (url.pathname === "/rest/v1/tests") return new Response(JSON.stringify([{ id: testId, title: "Тест", subject_id: subjectId, is_published: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify(membershipRow()), { status: 200 });
    if (url.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: subjectId, name: "Биохимия", specialty_slug: "mbh", is_active: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/test_questions") {
      assert.equal(url.searchParams.get("questions.is_published"), "eq.true");
      assert.equal(url.searchParams.get("questions.archived_at"), "is.null");
      return new Response(JSON.stringify([{ question_id: questionId, questions: { id: questionId } }, { question_id: "66666666-6666-4666-8666-666666666666", questions: { id: "66666666-6666-4666-8666-666666666666" } }]), { status: 200 });
    }
    if (url.pathname === "/rest/v1/test_preparation_sessions") {
      assert.equal(url.searchParams.get("group_id"), "eq." + groupId);
      assert.equal(url.searchParams.get("mode"), "eq.sequential");
      assert.ok(!url.searchParams.get("select").includes("question_snapshot"));
      return new Response(JSON.stringify([{ id: "77777777-7777-4777-8777-777777777777", group_id: groupId, status: "completed", current_index: 2, started_at: "2026-10-10T09:00:00Z", completed_at: "2026-10-10T09:05:00Z" }]), { status: 200 });
    }
    if (url.pathname === "/rest/v1/test_preparation_results") return new Response(JSON.stringify([{ id: "result-1", is_correct: true }, { id: "result-2", is_correct: false }]), { status: 200 });
    throw new Error("unexpected path " + url.pathname);
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.total, 2);
  assert.equal(result.data.answered, 2);
  assert.equal(result.data.correct, 1);
  assert.equal(result.data.remaining, 0);
  assert.equal(result.data.completed, true);
  assert.equal(result.data.session.group_id, groupId);
  assert.equal("question_snapshot" in result.data.session, false);
});
