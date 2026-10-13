import test from "node:test";
import assert from "node:assert/strict";
import {
  AiChatApiError,
  createAiConversation,
  deleteAiConversation,
  getAiConversation,
  getAiProviderStatus,
  listAiConversations,
} from "../src/ai-chat.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";

function request(path = "/api/v1/ai/conversations", token = "valid-user-token") {
  return new Request(`https://api-shadow.example.test${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("provider status mirrors configured flags without exposing secret values", () => {
  const status = getAiProviderStatus({
    AI_BACKEND_REGION: "ru",
    AI_CHAT_PRIMARY_PROVIDER: "groq",
    GROQ_API_KEY: "secret-groq-value",
    GROQ_MODEL: "test-model",
    GEMINI_API_KEY: "secret-gemini-value",
    OPENROUTER_API_KEY: "secret-openrouter-value",
  });
  assert.equal(status.region, "ru");
  assert.equal(status.default, "groq");
  assert.equal(status.providers.groq.configured, true);
  assert.equal(status.providers.groq.available, true);
  assert.equal(status.providers.groq.model, "test-model");
  assert.equal(status.providers.gemini.configured, true);
  assert.equal(status.providers.gemini.available, false);
  assert.match(status.providers.gemini.reason, /регион backend/);
  assert.equal(status.providers.openrouter.configured, false, "OpenRouter needs a model as well as a key");
  assert.equal(JSON.stringify(status).includes("secret-groq-value"), false);
});

test("Gemini is reported available only when the backend region or proxy permits it", () => {
  const outsideRu = getAiProviderStatus({ AI_BACKEND_REGION: "us", GEMINI_API_KEY: "secret" });
  assert.equal(outsideRu.providers.gemini.available, true);
  const proxy = getAiProviderStatus({
    AI_BACKEND_REGION: "ru",
    GEMINI_API_KEY: "secret",
    GEMINI_VERCEL_PROXY_URL: "https://proxy.example.test/api/gemini",
    GEMINI_VERCEL_PROXY_SECRET: "secret-proxy",
  });
  assert.equal(proxy.providers.gemini.available, true);
});

test("conversation listing uses only the caller JWT and explicit owner filtering", async () => {
  let called = false;
  const result = await listAiConversations(request(), env, userId, async (url, init) => {
    called = true;
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://project-id.supabase.co");
    assert.equal(parsed.pathname, "/rest/v1/ai_conversations");
    assert.equal(parsed.searchParams.get("user_id"), `eq.${userId}`);
    assert.equal(parsed.searchParams.get("order"), "updated_at.desc");
    assert.equal(parsed.searchParams.get("limit"), "100");
    assert.equal(init.headers.get("authorization"), "Bearer valid-user-token");
    assert.equal(init.headers.get("apikey"), env.SUPABASE_ANON_KEY);
    assert.notEqual(init.headers.get("authorization"), "Bearer service_role");
    return response([{ id: conversationId, user_id: userId, title: "Test", provider: "auto" }]);
  });
  assert.equal(called, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, conversationId);
});

test("creating a conversation passes caller identity, normalized provider and sanitized title", async () => {
  let called = false;
  const result = await createAiConversation(request(), env, userId, {
    title: "  Гистология\n  кровь  ",
    provider: "groq",
    subject_slug: "histology",
  }, async (url, init) => {
    called = true;
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/rest/v1/ai_conversations");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("authorization"), "Bearer valid-user-token");
    assert.match(init.headers.get("prefer"), /return=representation/);
    const row = JSON.parse(init.body);
    assert.deepEqual(row, {
      user_id: userId,
      title: "Гистология кровь",
      provider: "groq",
      subject_slug: "histology",
    });
    return response([{
      id: conversationId,
      title: row.title,
      provider: row.provider,
      subject_slug: row.subject_slug,
      created_at: "2026-10-14T00:00:00Z",
      updated_at: "2026-10-14T00:00:00Z",
    }], 201);
  });
  assert.equal(called, true);
  assert.equal(result.conversation.id, conversationId);
  assert.equal(result.conversation.provider, "groq");
});

test("unknown provider normalizes to auto and malformed subject/title fail validation", async () => {
  const normalized = await createAiConversation(request(), env, userId, { provider: "untrusted-provider" }, async (_url, init) => {
    const row = JSON.parse(init.body);
    assert.equal(row.provider, "auto");
    assert.equal(row.title, "Новый чат");
    return response([{ id: conversationId, ...row }], 201);
  });
  assert.equal(normalized.conversation.provider, "auto");

  await assert.rejects(
    createAiConversation(request(), env, userId, { title: 42 }, async () => { throw new Error("must not fetch"); }),
    (error) => error instanceof AiChatApiError && error.status === 422,
  );
  await assert.rejects(
    createAiConversation(request(), env, userId, { subject_slug: "../private" }, async () => { throw new Error("must not fetch"); }),
    (error) => error instanceof AiChatApiError && error.status === 422,
  );
});

test("conversation detail is filtered by user and messages are not fetched for an unowned conversation", async () => {
  let calls = 0;
  const result = await getAiConversation(request(), env, userId, conversationId, async (url, init) => {
    calls += 1;
    assert.equal(init.headers.get("authorization"), "Bearer valid-user-token");
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("user_id"), `eq.${userId}`);
    if (parsed.pathname.endsWith("/ai_conversations")) {
      assert.equal(parsed.searchParams.get("id"), `eq.${conversationId}`);
      return response([{ id: conversationId, user_id: userId, title: "Mine" }]);
    }
    assert.equal(parsed.pathname, "/rest/v1/ai_messages");
    assert.equal(parsed.searchParams.get("conversation_id"), `eq.${conversationId}`);
    assert.equal(parsed.searchParams.get("user_id"), `eq.${userId}`);
    return response([{ id: "message-1", conversation_id: conversationId, user_id: userId, role: "user", content: "Hi" }]);
  });
  assert.equal(calls, 2);
  assert.equal(result.conversation.id, conversationId);
  assert.equal(result.messages.length, 1);

  let foreignMessageQuery = false;
  await assert.rejects(
    getAiConversation(request(), env, userId, otherId, async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/ai_conversations")) return response([]);
      foreignMessageQuery = true;
      return response([]);
    }),
    (error) => error instanceof AiChatApiError && error.status === 404,
  );
  assert.equal(foreignMessageQuery, false);
});

test("conversation deletion is owner-filtered and fails closed on redirects", async () => {
  const deleted = await deleteAiConversation(request(), env, userId, conversationId, async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(init.method, "DELETE");
    assert.equal(parsed.pathname, "/rest/v1/ai_conversations");
    assert.equal(parsed.searchParams.get("id"), `eq.${conversationId}`);
    assert.equal(parsed.searchParams.get("user_id"), `eq.${userId}`);
    assert.equal(init.headers.get("authorization"), "Bearer valid-user-token");
    assert.match(init.headers.get("prefer"), /return=minimal/);
    return new Response(null, { status: 204 });
  });
  assert.deepEqual(deleted, { deleted: true });

  await assert.rejects(
    listAiConversations(request(), env, userId, async () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } })),
    (error) => error instanceof AiChatApiError && error.status === 503,
  );
});

test("AI REST operations reject missing caller tokens and insecure/unconfigured project URLs", async () => {
  await assert.rejects(
    listAiConversations(request("/api/v1/ai/conversations", ""), env, userId, async () => { throw new Error("must not fetch"); }),
    (error) => error instanceof AiChatApiError && error.status === 401,
  );
  await assert.rejects(
    listAiConversations(request(), { ...env, SUPABASE_URL: "http://project-id.supabase.co" }, userId, async () => { throw new Error("must not fetch"); }),
    (error) => error instanceof AiChatApiError && error.status === 503,
  );
});
