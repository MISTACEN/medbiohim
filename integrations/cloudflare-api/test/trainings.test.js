import test from "node:test";
import assert from "node:assert/strict";
import {
  answerSupabaseTrainingQuestion,
  cancelSupabaseTraining,
  completeSupabaseTraining,
  createSupabaseTraining,
  getSupabaseTraining,
  listSupabaseTrainings,
} from "../src/trainings.js";

const userId = "11111111-1111-4111-8111-111111111111";
const trainingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-publishable-key",
};
const request = (path = "/api/v1/trainings", authorization = "Bearer test-access-token") =>
  new Request("https://medbiohim.test" + path, { headers: authorization ? { authorization } : {} });
const okJson = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});
function rpcFetch(expectedName, result, calls = []) {
  return async (url, init) => {
    const target = new URL(String(url));
    calls.push({ url: target, init });
    if (target.pathname === "/auth/v1/user") return okJson({ id: userId, email: "student@example.test" });
    assert.equal(target.pathname, "/rest/v1/rpc/" + expectedName);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.authorization, "Bearer test-access-token");
    assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
    return okJson(result);
  };
}

test("training list calls only the owner-scoped RPC, never private tables directly", async () => {
  const calls = [];
  const result = await listSupabaseTrainings(request(), env, { status: "completed" }, rpcFetch(
    "histology_training_list",
    { ok: true, data: { items: [{ id: trainingId, status: "completed", answered_count: 2 }] } },
    calls,
  ));
  assert.equal(result.ok, true);
  assert.equal(result.data.items[0].answered_count, 2);
  const rpc = calls.find((call) => call.url.pathname.includes("/rpc/"));
  assert.deepEqual(JSON.parse(rpc.init.body), { p_status: "completed" });
  assert.equal(calls.filter((call) => call.url.pathname.startsWith("/rest/v1/")).length, 1);
});

test("training list rejects invalid status before upstream access", async () => {
  let calls = 0;
  const result = await listSupabaseTrainings(request(), env, { status: "everything" }, async () => {
    calls += 1;
    return okJson({});
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(calls, 0);
});

test("training list rejects a missing bearer token before querying Supabase", async () => {
  let calls = 0;
  const result = await listSupabaseTrainings(request("/api/v1/trainings", ""), env, {}, async () => {
    calls += 1;
    return okJson({ id: userId });
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test("training creation passes preferences to one server-owned lifecycle RPC", async () => {
  const input = {
    topics: ["Неделя 1 · Клетка"],
    content_type: "preparation",
    question_count: 10,
    all_questions: false,
    label_mode: "without",
    layout_mode: "sidebar",
    force: true,
  };
  const calls = [];
  const result = await createSupabaseTraining(request(), env, input, rpcFetch(
    "histology_training_create",
    { ok: true, data: { training: { id: trainingId, status: "in_progress" }, questions: [] } },
    calls,
  ));
  assert.equal(result.ok, true);
  assert.equal(result.data.training.id, trainingId);
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.pathname.includes("/rpc/")).init.body), { p_input: input });
});

test("training detail calls one owner-scoped RPC and returns safe snapshots", async () => {
  const calls = [];
  const safeData = { training: { id: trainingId }, answers: [{ question_snapshot: { question: { prompt: "Что изображено?" }, options: [{ id: "a", label: "A" }] } }] };
  const result = await getSupabaseTraining(request("/api/v1/trainings/" + trainingId), env, trainingId, rpcFetch(
    "histology_training_get",
    { ok: true, data: safeData },
    calls,
  ));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, safeData);
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.pathname.includes("/rpc/")).init.body), { p_training_id: trainingId });
});

test("answer RPC receives only the selected answer and skip state; server computes correctness", async () => {
  const calls = [];
  const result = await answerSupabaseTrainingQuestion(
    request("/api/v1/trainings/" + trainingId + "/answer"),
    env,
    trainingId,
    { order: 2, user_answer: "option-b", is_skipped: false, is_correct: true, user_id: "forged" },
    rpcFetch("histology_training_answer", {
      ok: true,
      data: { answer: { order: 2, user_answer: "option-b", is_correct: false }, correct: false },
    }, calls),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.correct, false);
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.pathname.includes("/rpc/")).init.body), {
    p_training_id: trainingId, p_order: 2, p_user_answer: "option-b", p_is_skipped: false,
  });
});

test("answer validation refuses malformed IDs, missing values and huge answers before network access", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return okJson({}); };
  const badId = await answerSupabaseTrainingQuestion(request(), env, "../other", { order: 0, user_answer: "x" }, fetcher);
  const badOrder = await answerSupabaseTrainingQuestion(request(), env, trainingId, { order: 500, user_answer: "x" }, fetcher);
  const missingAnswer = await answerSupabaseTrainingQuestion(request(), env, trainingId, { order: 0, user_answer: "" }, fetcher);
  const hugeAnswer = await answerSupabaseTrainingQuestion(request(), env, trainingId, { order: 0, user_answer: "x".repeat(5001) }, fetcher);
  assert.equal(badId.status, 422);
  assert.equal(badOrder.status, 422);
  assert.equal(missingAnswer.status, 422);
  assert.equal(hugeAnswer.status, 422);
  assert.equal(calls, 0);
});

test("complete and cancel use dedicated lifecycle RPCs", async () => {
  const completed = await completeSupabaseTraining(request(), env, trainingId, rpcFetch(
    "histology_training_complete",
    { ok: true, data: { training: { id: trainingId, status: "completed" }, stats: { total: 1, correct: 1, wrong: 0, skipped: 0, percent: 100, grade: 5 } } },
  ));
  const cancelled = await cancelSupabaseTraining(request(), env, trainingId, rpcFetch(
    "histology_training_cancel",
    { ok: true, data: { training: { id: trainingId, status: "cancelled" } } },
  ));
  assert.equal(completed.ok, true);
  assert.equal(completed.data.stats.grade, 5);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.data.training.status, "cancelled");
});

test("RPC conflict metadata is retained without exposing PostgREST internals", async () => {
  const result = await createSupabaseTraining(request(), env, { topics: [] }, rpcFetch(
    "histology_training_create",
    { ok: false, status: 409, code: "TRAINING_IN_PROGRESS", message: "Уже есть сессия", existing_training_id: trainingId },
  ));
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.existing_training_id, trainingId);
});

test("unavailable or malformed RPC replies fail closed", async () => {
  const upstream = await getSupabaseTraining(request(), env, trainingId, async (url) => {
    if (new URL(String(url)).pathname === "/auth/v1/user") return okJson({ id: userId });
    return new Response("database secret diagnostic", { status: 500 });
  });
  assert.equal(upstream.ok, false);
  assert.equal(upstream.status, 503);
  assert.doesNotMatch(upstream.message, /database secret diagnostic/i);
});
