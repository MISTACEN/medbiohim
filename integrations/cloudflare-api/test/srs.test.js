import test from "node:test";
import assert from "node:assert/strict";
import {
  addSrsCard,
  deleteSrsCard,
  ensureSrsDeck,
  getSrsSummary,
  listSrsCards,
  listSrsDueCards,
  reviewSrsCard,
} from "../src/srs.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const cardId = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";
const newQuestionId = "55555555-5555-4555-8555-555555555555";
const subjectId = "66666666-6666-4666-8666-666666666666";

function request(path = "/api/v1/srs/cards", token = "valid-user-token") {
  return new Request("https://api-shadow.example.test" + path, {
    headers: token ? { authorization: "Bearer " + token } : {},
  });
}
function response(value, status = 200) {
  if (status === 204) return new Response(null, { status });
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function assertCaller(init, url) {
  assert.equal(init.headers.authorization, "Bearer valid-user-token");
  assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
  assert.equal(url.origin, env.SUPABASE_URL);
}
function authUser(url) {
  return url.pathname === "/auth/v1/user";
}
function userCard(id = cardId, overrides = {}) {
  return {
    id,
    user_id: userId,
    source_type: "personal",
    source_id: null,
    front: "Question",
    back: "Answer",
    subject_id: subjectId,
    subject_slug: "histology",
    topic: "Cell",
    ease: 2.5,
    interval: 0,
    reps: 0,
    due_at: "2020-01-01T00:00:00Z",
    reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("SRS summary is scoped to the verified caller and computes due/learning/new cards", async () => {
  const calls = [];
  const result = await getSrsSummary(request(), env, async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (authUser(url)) return response({ id: userId });
    assertCaller(init, url);
    if (url.pathname === "/rest/v1/srs_cards") {
      assert.equal(url.searchParams.get("user_id"), "eq." + userId);
      assert.equal(url.searchParams.get("select").includes("source_id"), true);
      return response([
        userCard(cardId, { source_type: "question", source_id: questionId, reps: 2, interval: 1 }),
        userCard("77777777-7777-4777-8777-777777777777", {
          subject_slug: "chemistry", source_type: "personal", source_id: null,
          due_at: "2999-01-01T00:00:00Z", reps: 0, interval: 0,
        }),
      ]);
    }
    if (url.pathname === "/rest/v1/subjects") {
      return response([
        { id: subjectId, name: "Гистология", slug: "histology" },
        { id: "88888888-8888-4888-8888-888888888888", name: "Химия", slug: "chemistry" },
      ]);
    }
    if (url.pathname === "/rest/v1/questions") {
      assert.equal(url.searchParams.get("is_published"), "eq.true");
      assert.equal(url.searchParams.get("archived_at"), "is.null");
      return response([{ id: questionId }, { id: newQuestionId }]);
    }
    throw new Error("Unexpected request " + url.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.total, 2);
  assert.equal(result.data.due, 1);
  assert.equal(result.data.learning, 1);
  assert.equal(result.data.new_available, 1);
  assert.deepEqual(result.data.subjects.map((item) => item.subject_slug).sort(), ["chemistry", "histology"]);
  assert.ok(calls.every(({ url, init }) => authUser(url) || init.headers.authorization === "Bearer valid-user-token"));
});

test("ensure deck skips existing source questions and inserts only the requested missing cards as the caller", async () => {
  const inserted = [];
  const result = await ensureSrsDeck(request(), env, {
    count: 1,
    subject_slug: "histology",
    user_id: otherUserId,
  }, async (input, init) => {
    const url = new URL(String(input));
    if (authUser(url)) return response({ id: userId });
    assertCaller(init, url);
    if (url.pathname === "/rest/v1/srs_cards" && init.method === "POST") {
      const body = JSON.parse(init.body);
      inserted.push(body);
      assert.equal(body.user_id, userId, "user_id is derived from authenticated Supabase identity");
      assert.equal(body.source_type, "question");
      return response([{ id: cardId, ...body }], 201);
    }
    if (url.pathname === "/rest/v1/srs_cards") {
      assert.equal(url.searchParams.get("user_id"), "eq." + userId);
      return response([userCard(cardId, { source_type: "question", source_id: questionId })]);
    }
    if (url.pathname === "/rest/v1/subjects") {
      return response([{ id: subjectId, name: "Гистология", slug: "histology" }]);
    }
    if (url.pathname === "/rest/v1/questions") {
      assert.equal(url.searchParams.get("subject_id"), "eq." + subjectId);
      return response([
        { id: questionId, text: "Already saved", answer: "A", subject_id: subjectId, topic: "T1" },
        { id: newQuestionId, text: "New question", answer: "New answer", subject_id: subjectId, topic: "T2" },
      ]);
    }
    throw new Error("Unexpected request " + url.pathname + " " + init.method);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { added: 1, total: 2 });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].source_id, newQuestionId);
  assert.equal(inserted[0].front, "New question");
});

test("listing cards filters by subject and scope while using owner-only REST reads", async () => {
  const result = await listSrsCards(request(), env, { subject_slug: "histology", scope: "personal", limit: 99 }, async (input, init) => {
    const url = new URL(String(input));
    if (authUser(url)) return response({ id: userId });
    assertCaller(init, url);
    if (url.pathname === "/rest/v1/srs_cards") {
      assert.equal(url.searchParams.get("user_id"), "eq." + userId);
      return response([
        userCard(cardId, { source_type: "personal", subject_slug: "histology" }),
        userCard("99999999-9999-4999-8999-999999999999", { source_type: "question", source_id: questionId, subject_slug: "histology" }),
        userCard("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { source_type: "personal", subject_slug: "chemistry" }),
      ]);
    }
    if (url.pathname === "/rest/v1/subjects") return response([{ id: subjectId, name: "Гистология", slug: "histology" }]);
    throw new Error("Unexpected request " + url.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].id, cardId);
  assert.equal(result.data.items[0].subject, "Гистология");
  assert.equal(result.data.items[0].source, "personal");
});

test("due-card listing uses due time, subject and shared/personal scope", async () => {
  const result = await listSrsDueCards(request(), env, { subject_slug: "histology", scope: "shared", limit: 20 }, async (input) => {
    const url = new URL(String(input));
    if (authUser(url)) return response({ id: userId });
    if (url.pathname === "/rest/v1/srs_cards") {
      assert.equal(url.searchParams.get("user_id"), "eq." + userId);
      return response([
        userCard(cardId, { source_type: "question", source_id: questionId, subject_slug: "histology", due_at: "2020-01-01T00:00:00Z" }),
        userCard("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { source_type: "personal", subject_slug: "histology", due_at: "2020-01-01T00:00:00Z" }),
        userCard("cccccccc-cccc-4ccc-8ccc-cccccccccccc", { source_type: "question", source_id: newQuestionId, subject_slug: "chemistry", due_at: "2020-01-01T00:00:00Z" }),
        userCard("dddddddd-dddd-4ddd-8ddd-dddddddddddd", { source_type: "question", source_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", subject_slug: "histology", due_at: "2999-01-01T00:00:00Z" }),
      ]);
    }
    if (url.pathname === "/rest/v1/subjects") return response([{ id: subjectId, name: "Гистология", slug: "histology" }]);
    throw new Error("Unexpected request " + url.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.count, 1);
  assert.equal(result.data.items[0].id, cardId);
});

test("personal-card creation ignores caller-supplied user_id and validates front", async () => {
  let bodySent = null;
  const result = await addSrsCard(request(), env, {
    front: "  Вопрос  ",
    back: " Ответ ",
    subject_slug: "histology",
    user_id: otherUserId,
  }, async (input, init) => {
    const url = new URL(String(input));
    if (authUser(url)) return response({ id: userId });
    assertCaller(init, url);
    if (url.pathname === "/rest/v1/subjects") return response([{ id: subjectId, name: "Гистология", slug: "histology" }]);
    if (url.pathname === "/rest/v1/srs_cards" && init.method === "POST") {
      bodySent = JSON.parse(init.body);
      return response([{ id: cardId, ...bodySent, created_at: "2026-01-01T00:00:00Z" }], 201);
    }
    throw new Error("Unexpected request " + url.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(bodySent.user_id, userId);
  assert.equal(bodySent.front, "Вопрос");
  assert.equal(bodySent.back, "Ответ");
  assert.equal(result.data.card.subject, "Гистология");

  const invalid = await addSrsCard(request(), env, { front: " " }, async (input) => {
    const url = new URL(String(input));
    if (authUser(url)) return response({ id: userId });
    throw new Error("invalid card must not reach database");
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 422);
});

test("review rating four updates only the caller's card with the legacy ease/interval formula", async () => {
  const patches = [];
  const result = await reviewSrsCard(request(), env, { card_id: cardId, rating: 4 }, async (input, init) => {
    const url = new URL(String(input));
    if (authUser(url)) return response({ id: userId });
    assertCaller(init, url);
    if (url.pathname === "/rest/v1/srs_cards" && init.method === "PATCH") {
      assert.equal(url.searchParams.get("id"), "eq." + cardId);
      assert.equal(url.searchParams.get("user_id"), "eq." + userId);
      const patch = JSON.parse(init.body);
      patches.push(patch);
      return response([{ ...userCard(cardId), ...patch }]);
    }
    if (url.pathname === "/rest/v1/srs_cards") {
      return response([userCard(cardId, { ease: 2.5, interval: 2, reps: 3 })]);
    }
    if (url.pathname === "/rest/v1/subjects") return response([{ id: subjectId, name: "Гистология", slug: "histology" }]);
    if (url.pathname === "/rest/v1/questions") return response([{ id: questionId }]);
    throw new Error("Unexpected request " + url.pathname + " " + init.method);
  });
  assert.equal(result.ok, true);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].ease, 2.65);
  assert.equal(patches[0].interval, 7);
  assert.equal(patches[0].reps, 4);
  assert.equal(result.data.card.interval, 7);
  assert.ok(result.data.summary);
});

test("delete requires a valid UUID and deletes with explicit user scope", async () => {
  let deleted = false;
  const result = await deleteSrsCard(request(), env, cardId, async (input, init) => {
    const url = new URL(String(input));
    if (authUser(url)) return response({ id: userId });
    assertCaller(init, url);
    assert.equal(init.method, "DELETE");
    assert.equal(url.pathname, "/rest/v1/srs_cards");
    assert.equal(url.searchParams.get("id"), "eq." + cardId);
    assert.equal(url.searchParams.get("user_id"), "eq." + userId);
    deleted = true;
    return response([{ id: cardId }]);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { deleted: true });
  assert.equal(deleted, true);

  const invalid = await deleteSrsCard(request(), env, "not-a-uuid", async () => {
    throw new Error("invalid id must not reach database");
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 422);
});

test("invalid bearer is rejected before any SRS table access", async () => {
  let calls = 0;
  const result = await getSrsSummary(request("/api/v1/srs/summary", ""), env, async () => {
    calls += 1;
    return response({ id: userId });
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});
