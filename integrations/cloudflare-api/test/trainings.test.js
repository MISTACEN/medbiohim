import test from "node:test";
import assert from "node:assert/strict";
import {
  answerSupabaseTrainingQuestion, cancelSupabaseTraining, completeSupabaseTraining,
  createSupabaseTraining, getSupabaseTraining, listSupabaseTrainings,
} from "../src/trainings.js";

const userId = "11111111-1111-4111-8111-111111111111";
const trainingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "test-publishable-key" };
const request = (authorization = "Bearer student-jwt") => new Request("https://worker.test/api/v1/trainings", {
  headers: authorization ? { authorization } : {},
});
const rpc = (name, data, status = 200) => new Response(JSON.stringify({ ok: true, data, ...(name ? { rpc: name } : {}) }), {
  status, headers: { "content-type": "application/json" },
});
const callName = (calls) => calls[0] && calls[0].url.pathname.split("/").pop();

test("training history uses the owner-scoped RPC instead of querying protected tables", async () => {
  const calls = [];
  const result = await listSupabaseTrainings(request(), env, { status: "completed" }, async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return rpc("list_histology_trainings", { items: [{ id: trainingId, status: "completed", answered_count: 2 }] });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items[0].answered_count, 2);
  assert.equal(callName(calls), "list_histology_trainings");
  assert.equal(calls[0].url.pathname, "/rest/v1/rpc/list_histology_trainings");
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_status: "completed" });
  assert.equal(calls[0].init.headers.authorization, "Bearer student-jwt");
  assert.equal(calls[0].init.headers.apikey, env.SUPABASE_ANON_KEY);
});

test("training RPC refuses missing bearer before network access", async () => {
  let calls = 0;
  const result = await listSupabaseTrainings(request(""), env, {}, async () => { calls++; return rpc("", {}); });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test("create training validates and sends only requested filter/config to secure RPC", async () => {
  const calls = [];
  const result = await createSupabaseTraining(request(), env, {
    topics: ["Эпителий"], content_type: "preparation", question_count: 9999,
    all_questions: false, label_mode: "manual", layout_mode: "sidebar",
    card_ids: ["card-1", "card-2"], force: true,
  }, async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return rpc("create_histology_training", { training: { id: trainingId }, questions: [] });
  });
  assert.equal(result.ok, true);
  assert.equal(callName(calls), "create_histology_training");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_topics: ["Эпителий"], p_content_type: "preparation", p_question_count: 500,
    p_all_questions: false, p_label_mode: "manual", p_layout_mode: "sidebar",
    p_card_ids: ["card-1", "card-2"], p_force: true,
  });
});

test("create training rejects invalid filters before any upstream call", async () => {
  let calls = 0;
  const result = await createSupabaseTraining(request(), env, {
    topics: ["x"], content_type: "all", label_mode: "answer-key", layout_mode: "top", question_count: 1,
  }, async () => { calls++; return rpc("", {}); });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(calls, 0);
});

test("an unanswered question snapshot has no correct answer material", async () => {
  const calls = [];
  const safeData = {
    training: { id: trainingId, status: "in_progress", total_questions: 1 },
    answers: [{
      id: "row-1", question_id: "card-1", order: 0, user_answer: null, is_correct: null, is_skipped: false,
      options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      question_snapshot: { question: { prompt: "Что изображено?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] } },
      review_snapshot: {},
    }],
  };
  const result = await getSupabaseTraining(request(), env, trainingId, async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return rpc("get_histology_training", safeData);
  });
  assert.equal(result.ok, true);
  assert.equal(callName(calls), "get_histology_training");
  assert.equal(JSON.stringify(result.data).includes('"correct":true'), false);
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_training_id: trainingId });
});

test("answer writes are routed to secure scoring RPC with bounded arguments", async () => {
  const calls = [];
  const result = await answerSupabaseTrainingQuestion(request(), env, trainingId, {
    order: 0, user_answer: "option-b", is_skipped: false,
  }, async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return rpc("save_histology_training_answer", { answer: { question_id: "card-1" }, correct: false, explanation: null });
  });
  assert.equal(result.ok, true);
  assert.equal(callName(calls), "save_histology_training_answer");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_training_id: trainingId, p_order: 0, p_user_answer: "option-b", p_is_skipped: false,
  });
});

test("answer rejects malformed order and empty non-skip answer without network access", async () => {
  let calls = 0;
  const result = await answerSupabaseTrainingQuestion(request(), env, trainingId, {
    order: -1, user_answer: "", is_skipped: false,
  }, async () => { calls++; return rpc("", {}); });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(calls, 0);
});

test("complete and cancel use separate server-side state-transition RPCs", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    const name = new URL(String(url)).pathname.split("/").pop();
    return rpc(name, name === "complete_histology_training"
      ? { training: { id: trainingId, status: "completed" }, stats: { total: 1, correct: 1, percent: 100, grade: 5 } }
      : { training: { id: trainingId, status: "cancelled" } });
  };
  const completed = await completeSupabaseTraining(request(), env, trainingId, fetcher);
  const cancelled = await cancelSupabaseTraining(request(), env, trainingId, fetcher);
  assert.equal(completed.ok, true);
  assert.equal(completed.data.stats.grade, 5);
  assert.equal(cancelled.ok, true);
  assert.deepEqual(calls.map((x) => x.url.pathname.split("/").pop()), [
    "complete_histology_training", "cancel_histology_training",
  ]);
});

test("owner-scoped RPC conflicts preserve HTTP status and resume identifier", async () => {
  const response = new Response(JSON.stringify({
    ok: false, status: 409, code: "TRAINING_IN_PROGRESS",
    message: "Уже есть тренировка", existing_training_id: trainingId,
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await createSupabaseTraining(request(), env, {}, async () => response);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, "TRAINING_IN_PROGRESS");
  assert.equal(result.existing_training_id, trainingId);
});
