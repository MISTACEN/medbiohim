import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseTrainerCard, listSupabaseTrainerFeed, submitSupabaseTrainerAnswer } from "../src/trainer-feed.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
function request(path = "/api/v1/trainers/feed", token = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test" + path, {
    headers: token ? { authorization: token } : {},
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function card(overrides = {}) {
  return {
    id: "card-1",
    subject_id: "subject-1",
    subject_slug: "histology",
    specialty_slug: "mbh",
    mode_set: "preparation",
    preparation: { name: "Не удаляемое поле карточки", organ: "Лимфатический узел", captions: ["label"] },
    hotspots: [],
    question: {
      prompt: "What is shown?",
      explanation: "secret explanation",
      answer: "secret answer",
      options: [
        { id: "a", label: "A", correct: true, is_correct: true },
        { id: "b", label: "B", correct: false },
      ],
    },
    tags: ["histology"],
    difficulty: 1,
    source_key: "source-1",
    source_file_id: null,
    is_published: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    plan_module_id: null,
    plan_topic_id: null,
    plan_module_title: null,
    plan_topic_title: null,
    ...overrides,
  };
}
function membership(specialty = "mbh", active = true) {
  return { group_id: "group-1", groups: { specialty_slug: specialty, is_active: active } };
}

test("trainer feed reads only the sanitized published view and strips correctness data defensively", async () => {
  const calls = [];
  const result = await listSupabaseTrainerFeed(request(), env, {
    subject: "histology", specialty: "mbh", limit: "700", offset: "-5",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, authorization: init.headers.authorization, apikey: init.headers.apikey });
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/group_memberships") return response([membership()]);
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      assert.equal(parsed.searchParams.get("subject_slug"), "eq.histology");
      assert.equal(parsed.searchParams.get("specialty_slug"), "eq.mbh");
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      assert.equal(parsed.searchParams.get("limit"), "500");
      assert.equal(parsed.searchParams.get("offset"), "0");
      assert.equal(parsed.searchParams.get("order"), "id.asc");
      return response([card()]);
    }
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.source, "supabase_rest");
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].question.answer, undefined);
  assert.equal(result.data.items[0].question.explanation, undefined);
  assert.equal(result.data.items[0].question.options[0].correct, undefined);
  assert.equal(result.data.items[0].question.options[0].is_correct, undefined);
  assert.equal(result.data.items[0].preparation.name, "Не удаляемое поле карточки");
  assert.equal(calls.every((call) => call.authorization === "Bearer valid-user-token"), true);
  assert.equal(calls.every((call) => call.apikey === env.SUPABASE_ANON_KEY), true);
  assert.equal(calls.every((call) => call.parsed.pathname !== "/rest/v1/trainer_feed_cards"), true);
});

test("explicit Histology feed is denied without an active MBH membership before card reads", async () => {
  const paths = [];
  const result = await listSupabaseTrainerFeed(request(), env, { subject: "histology" }, async (url) => {
    const parsed = new URL(String(url));
    paths.push(parsed.pathname);
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/group_memberships") return response([
      membership("chemistry", true),
      membership("mbh", false),
    ]);
    assert.fail("card endpoint must not be queried: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(paths.includes("/rest/v1/trainer_feed_cards_public"), false);
});

test("default feed explicitly excludes Histology and MBH rows for non-MBH callers", async () => {
  let feedQuery;
  const result = await listSupabaseTrainerFeed(request(), env, {}, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-2" });
    if (parsed.pathname === "/rest/v1/group_memberships") return response([]);
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      feedQuery = parsed.searchParams;
      return response([card({ id: "card-chem", subject_slug: "chemistry", specialty_slug: null })]);
    }
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.match(feedQuery.get("and"), /neq\.histology/);
  assert.match(feedQuery.get("and"), /neq\.mbh/);
  assert.equal(result.data.items[0].subject_slug, "chemistry");
});

test("invalid specialty filters are rejected before trainer view reads", async () => {
  let reads = 0;
  const result = await listSupabaseTrainerFeed(request(), env, { subject: "histology;select=*" }, async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    reads += 1;
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(reads, 0);
});

test("trainer card detail is read from the safe view and returns no answer keys", async () => {
  const result = await getSupabaseTrainerCard(request("/api/v1/trainers/feed/card-1"), env, "card-1", async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      assert.equal(parsed.searchParams.get("id"), "eq.card-1");
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      return response([card()]);
    }
    if (parsed.pathname === "/rest/v1/group_memberships") return response([membership("mbh", true)]);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.item.id, "card-1");
  assert.equal(result.data.item.question.answer, undefined);
  assert.equal(result.data.item.question.explanation, undefined);
  assert.equal(result.data.item.question.options[0].correct, undefined);
});

test("trainer card detail returns 404 for hidden or unpublished cards", async () => {
  const result = await getSupabaseTrainerCard(request("/api/v1/trainers/feed/missing"), env, "missing", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.code, "NOT_FOUND");
});

test("trainer card detail rejects invalid bearer credentials before reading the view", async () => {
  let reads = 0;
  const result = await getSupabaseTrainerCard(request("/api/v1/trainers/feed/card-1", "Bearer invalid"), env, "card-1", async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ message: "invalid token" }, 401);
    reads += 1;
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(reads, 0);
});


test("trainer card detail repeats the active MBH guard even when a mocked view returns a Histology row", async () => {
  const result = await getSupabaseTrainerCard(request("/api/v1/trainers/feed/card-1"), env, "card-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-2" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") return response([card()]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([membership("mbh", false)]);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
});

test("trainer card detail fails closed when active membership cannot be verified", async () => {
  const result = await getSupabaseTrainerCard(request("/api/v1/trainers/feed/card-1"), env, "card-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-2" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") return response([card()]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response({ message: "denied" }, 403);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "DB_UNAVAILABLE");
});


test("trainer answer submission uses the existing secure RPC and the caller JWT", async () => {
  let rpcRequest;
  const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, {
    card_id: "card-1",
    option_id: "a",
    answer_text: "",
    time_ms: 4_000_000,
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    assert.equal(parsed.pathname, "/rest/v1/rpc/submit_trainer_feed_answer");
    rpcRequest = { init, payload: JSON.parse(init.body) };
    return response({
      answer: { id: "answer-1", card_id: "card-1", option_id: "a", is_correct: true },
      correct: true,
      explanation: "Correct after submission",
    });
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.data.correct, true);
  assert.equal(result.data.explanation, "Correct after submission");
  assert.equal(rpcRequest.init.method, "POST");
  assert.equal(rpcRequest.init.headers.authorization, "Bearer valid-user-token");
  assert.equal(rpcRequest.init.headers.apikey, env.SUPABASE_ANON_KEY);
  assert.deepEqual(rpcRequest.payload, {
    p_card_id: "card-1",
    p_option_id: "a",
    p_answer_text: null,
    p_is_skipped: false,
    p_time_ms: 3_600_000,
  });
});

test("skipped trainer answer clears the option and does not return an explanation", async () => {
  let rpcPayload;
  const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, {
    card_id: "card-1",
    option_id: "a",
    is_skipped: true,
    time_ms: -5,
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    assert.equal(parsed.pathname, "/rest/v1/rpc/submit_trainer_feed_answer");
    rpcPayload = JSON.parse(init.body);
    return response({
      answer: { id: "answer-2", card_id: "card-1", option_id: null, is_skipped: true },
      correct: null,
      explanation: "should not be shown",
    });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.correct, null);
  assert.equal(result.data.explanation, null);
  assert.equal(rpcPayload.p_option_id, null);
  assert.equal(rpcPayload.p_is_skipped, true);
  assert.equal(rpcPayload.p_time_ms, 0);
});

test("trainer answer submission rejects malformed fields before calling the grading RPC", async () => {
  let rpcCalls = 0;
  const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, {
    card_id: "card-1",
    is_skipped: "false",
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/rpc/submit_trainer_feed_answer") rpcCalls += 1;
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "VALIDATION_ERROR");
  assert.equal(rpcCalls, 0);
});

test("trainer answer RPC maps missing cards to 404 without exposing database errors", async () => {
  const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, {
    card_id: "missing-card", option_id: "a",
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    return response({ code: "P0002", message: "raw internal error" }, 404);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.code, "NOT_FOUND");
  assert.notEqual(result.message, "raw internal error");
});

test("trainer answer RPC maps membership denial to 403 and invalid options to 422", async (t) => {
  await t.test("membership denial", async () => {
    const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, { card_id: "card-1" }, async (url) => {
      if (new URL(String(url)).pathname === "/auth/v1/user") return response({ id: "user-1" });
      return response({ code: "42501", message: "raw internal error" }, 403);
    });
    assert.equal(result.status, 403);
    assert.equal(result.code, "FORBIDDEN");
  });
  await t.test("invalid option", async () => {
    const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, { card_id: "card-1", option_id: "bad" }, async (url) => {
      if (new URL(String(url)).pathname === "/auth/v1/user") return response({ id: "user-1" });
      return response({ code: "22023", message: "raw internal error" }, 400);
    });
    assert.equal(result.status, 422);
    assert.equal(result.code, "VALIDATION_ERROR");
  });
});

test("trainer answer submission refuses missing tokens and never calls the grading RPC", async () => {
  let nonAuthCalls = 0;
  const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer", ""), env, { card_id: "card-1" }, async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ message: "invalid token" }, 401);
    nonAuthCalls += 1;
    return response({});
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(nonAuthCalls, 0);
});


test("trainer answer submission rejects non-string identifiers and text without invoking RPC", async () => {
  let rpcCalls = 0;
  const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, {
    card_id: 123,
    answer_text: { forged: true },
  }, async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    rpcCalls += 1;
    return response({});
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(rpcCalls, 0);
});

test("trainer answer returns a service error when the secure RPC is missing from the PostgREST schema cache", async () => {
  const result = await submitSupabaseTrainerAnswer(request("/api/v1/trainers/feed/answer"), env, {
    card_id: "card-1",
  }, async (url) => {
    if (new URL(String(url)).pathname === "/auth/v1/user") return response({ id: "user-1" });
    return response({ code: "PGRST202", message: "internal schema cache details" }, 404);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "TRAINER_ERROR");
  assert.notEqual(result.message, "internal schema cache details");
});
