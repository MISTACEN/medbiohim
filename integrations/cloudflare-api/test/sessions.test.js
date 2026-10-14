import test from "node:test";
import assert from "node:assert/strict";
import {
  listSupabaseLearningSessions,
  getSupabaseLearningSession,
  createSupabaseLearningSession,
  patchSupabaseLearningSession,
} from "../src/sessions.js";
import worker from "../src/index.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const ENV = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};

function authRequest(path, options = {}) {
  return new Request(`https://api-shadow.example.test${path}`, {
    ...options,
    headers: {
      authorization: "Bearer test-token",
      ...(options.headers || {}),
    },
  });
}

function mockAuthOk(url) {
  if (url.pathname === "/auth/v1/user") {
    return new Response(JSON.stringify({ id: USER_ID, email: "student@example.com" }), { status: 200 });
  }
  return null;
}

test("list sessions requires bearer token", async () => {
  const result = await listSupabaseLearningSessions(
    new Request("https://example.test/api/v1/sessions"),
    ENV,
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("list sessions filters by user_id and optional status via REST", async () => {
  let seen;
  const result = await listSupabaseLearningSessions(
    authRequest("/api/v1/sessions?status=in_progress"),
    ENV,
    { status: "in_progress" },
    async (input) => {
      const url = new URL(input);
      const auth = mockAuthOk(url);
      if (auth) return auth;
      if (url.pathname === "/rest/v1/learning_sessions") {
        seen = url;
        assert.equal(url.searchParams.get("user_id"), "eq." + USER_ID);
        assert.equal(url.searchParams.get("status"), "eq.in_progress");
        assert.equal(url.searchParams.get("order"), "updated_at.desc");
        return new Response(JSON.stringify([{
          id: SESSION_ID,
          user_id: USER_ID,
          type: "practice",
          title: "Сессия",
          status: "in_progress",
          current_index: 0,
          answers: {},
          payload: {},
        }]), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].id, SESSION_ID);
  assert.ok(seen);
});

test("create session inserts ownership-scoped row", async () => {
  const result = await createSupabaseLearningSession(
    authRequest("/api/v1/sessions", { method: "POST" }),
    ENV,
    { type: "practice", title: "Микропрепараты", ref_id: "card-1", current_index: 2 },
    async (input, init = {}) => {
      const url = new URL(input);
      const auth = mockAuthOk(url);
      if (auth) return auth;
      if (url.pathname === "/rest/v1/learning_sessions" && init.method === "POST") {
        const body = JSON.parse(init.body);
        assert.equal(body.user_id, USER_ID);
        assert.equal(body.type, "practice");
        assert.equal(body.title, "Микропрепараты");
        assert.equal(body.status, "in_progress");
        assert.equal(body.current_index, 2);
        assert.equal(body.ref_id, "card-1");
        return new Response(JSON.stringify([{ id: SESSION_ID, ...body }]), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.data.session.id, SESSION_ID);
});

test("get session 404 when not owned", async () => {
  const result = await getSupabaseLearningSession(
    authRequest("/api/v1/sessions/" + SESSION_ID),
    ENV,
    SESSION_ID,
    async (input) => {
      const url = new URL(input);
      const auth = mockAuthOk(url);
      if (auth) return auth;
      if (url.pathname === "/rest/v1/learning_sessions") {
        assert.equal(url.searchParams.get("user_id"), "eq." + USER_ID);
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.code, "NOT_FOUND");
});

test("patch session sets finished_at when status becomes finished", async () => {
  const result = await patchSupabaseLearningSession(
    authRequest("/api/v1/sessions/" + SESSION_ID, { method: "PATCH" }),
    ENV,
    SESSION_ID,
    { status: "finished", current_index: 5, score: 80 },
    async (input, init = {}) => {
      const url = new URL(input);
      const auth = mockAuthOk(url);
      if (auth) return auth;
      if (url.pathname === "/rest/v1/learning_sessions" && (!init.method || init.method === "GET")) {
        return new Response(JSON.stringify([{ id: SESSION_ID }]), { status: 200 });
      }
      if (url.pathname === "/rest/v1/learning_sessions" && init.method === "PATCH") {
        const body = JSON.parse(init.body);
        assert.equal(body.status, "finished");
        assert.equal(body.current_index, 5);
        assert.equal(body.score, 80);
        assert.equal(typeof body.finished_at, "string");
        assert.equal(typeof body.updated_at, "string");
        assert.equal(body.user_id, undefined);
        return new Response(JSON.stringify([{
          id: SESSION_ID,
          user_id: USER_ID,
          status: "finished",
          current_index: 5,
          score: 80,
          finished_at: body.finished_at,
        }]), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.session.status, "finished");
});

test("worker routes: sessions require auth and reject wrong methods", async () => {
  const get = await worker.fetch(new Request("https://api-shadow.example.test/api/v1/sessions"), ENV);
  assert.equal(get.status, 401);

  const del = await worker.fetch(new Request("https://api-shadow.example.test/api/v1/sessions", {
    method: "DELETE",
  }), ENV);
  assert.equal(del.status, 405);
  assert.equal(del.headers.get("allow"), "GET, POST, OPTIONS");

  const postOnId = await worker.fetch(new Request(
    "https://api-shadow.example.test/api/v1/sessions/" + SESSION_ID,
    { method: "POST" },
  ), ENV);
  assert.equal(postOnId.status, 405);
  assert.equal(postOnId.headers.get("allow"), "GET, PATCH, OPTIONS");
});

test("worker POST /sessions validates JSON before auth upstream", async () => {
  const response = await worker.fetch(new Request("https://api-shadow.example.test/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-token" },
    body: "{",
  }), ENV);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
});
