import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseTrainerCard, listSupabaseTrainerFeed } from "../src/trainer-feed.js";

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
    assert.equal(parsed.pathname, "/rest/v1/trainer_feed_cards_public");
    assert.equal(parsed.searchParams.get("id"), "eq.card-1");
    assert.equal(parsed.searchParams.get("is_published"), "eq.true");
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    return response([card()]);
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
