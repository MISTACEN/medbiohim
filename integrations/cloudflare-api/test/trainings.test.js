import test from "node:test";
import assert from "node:assert/strict";
import { listSupabaseTrainings } from "../src/trainings.js";

const userId = "11111111-1111-4111-8111-111111111111";
const trainingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-publishable-key",
};
const request = (authorization = "Bearer test-access-token") => new Request("https://medbiohim.test/api/v1/trainings", {
  headers: authorization ? { authorization } : {},
});
const okJson = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("training list is scoped to the caller and keeps the legacy items shape", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    const target = new URL(String(url));
    calls.push({ url: target, init });
    if (target.pathname === "/auth/v1/user") return okJson({ id: userId, email: "student@example.test" });
    if (target.pathname === "/rest/v1/trainings") {
      return okJson([{
        id: trainingId,
        user_id: userId,
        subject_slug: "histology",
        specialty_slug: "mbh",
        status: "completed",
        topics: [],
        question_count: 3,
        total_questions: 3,
        updated_at: "2026-01-01T00:00:00Z",
      }]);
    }
    if (target.pathname === "/rest/v1/training_answers") {
      return okJson([
        { training_id: trainingId, user_answer: null, is_skipped: false },
        { training_id: trainingId, user_answer: null, is_skipped: true },
        { training_id: trainingId, user_answer: "answer", is_skipped: false },
      ]);
    }
    return okJson([]);
  };

  const result = await listSupabaseTrainings(request(), env, { status: "completed" }, fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].answered_count, 2);
  const trainingCall = calls.find((call) => call.url.pathname === "/rest/v1/trainings");
  assert.equal(trainingCall.url.searchParams.get("user_id"), "eq." + userId);
  assert.equal(trainingCall.url.searchParams.get("status"), "eq.completed");
  const answersCall = calls.find((call) => call.url.pathname === "/rest/v1/training_answers");
  assert.equal(answersCall.url.searchParams.get("training_id"), "in.(" + trainingId + ")");
  assert.equal(trainingCall.init.headers.authorization, "Bearer test-access-token");
});

test("training list rejects a missing bearer token before querying data", async () => {
  let calls = 0;
  const result = await listSupabaseTrainings(request(""), env, {}, async () => {
    calls += 1;
    return okJson({ id: userId });
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});
