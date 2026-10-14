import test from "node:test";
import assert from "node:assert/strict";
import {
  askSupabaseTutor,
  getSupabaseTutorMeta,
  listSupabaseTutorSubjects,
} from "../src/tutor.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const userId = "11111111-1111-4111-8111-111111111111";
const subjectId = "22222222-2222-4222-8222-222222222222";
const questionId = "33333333-3333-4333-8333-333333333333";
const ticketId = "44444444-4444-4444-8444-444444444444";

function request(path = "/api/v1/tutor/ask", token = "valid-user-token", body = undefined) {
  const headers = new Headers();
  if (token) headers.set("authorization", "Bearer " + token);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request("https://api-shadow.example.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function authenticated(url) {
  return url.pathname === "/auth/v1/user";
}
function createFetcher(options = {}) {
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (authenticated(url)) {
      if (options.invalidSession) return response({ message: "expired" }, 401);
      return response({ id: userId });
    }
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
    if (url.pathname === "/rest/v1/subjects") {
      return response([
        { id: subjectId, name: "Гистология", slug: "histology", description: "Клетки и ткани", is_active: true },
      ]);
    }
    if (url.pathname === "/rest/v1/questions") {
      assert.equal(url.searchParams.get("is_published"), "eq.true");
      assert.equal(url.searchParams.get("archived_at"), "is.null");
      return response([
        {
          id: questionId,
          subject_id: subjectId,
          topic: "Эритроциты",
          text: "Какова основная функция эритроцитов?",
          answer: "Перенос кислорода и части углекислого газа.",
        },
      ]);
    }
    if (url.pathname === "/rest/v1/exam_questions") {
      return response([
        {
          id: ticketId,
          subject_id: subjectId,
          subject_name: "Гистология",
          subject_slug: "histology",
          topic: "Кровь",
          text: "Что такое ретикулоцит?",
          answer: "Молодая форма эритроцита.",
        },
      ]);
    }
    if (url.pathname === "/rest/v1/group_memberships") {
      if (options.mbhMembership) {
        return response([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]);
      }
      return response([]);
    }
    if (url.pathname === "/rest/v1/trainer_feed_cards_public") {
      return response(options.trainerRows || []);
    }
    if (url.pathname === "/rest/v1/site_content") {
      return response([{
        key: "subject_plan:histology",
        payload: {
          subject: "Гистология",
          subject_slug: "histology",
          weeks: [{ week: 1, lecture: "Кровь и лимфа", study: ["Эритроциты", "Лейкоциты"] }],
        },
      }]);
    }
    throw new Error("Unexpected Supabase request: " + url.pathname);
  };
  return { fetcher, calls };
}

test("Tutor performs ranked grounded retrieval and preserves the legacy fallback result shape", async () => {
  const { fetcher } = createFetcher();
  const result = await askSupabaseTutor(request("/api/v1/tutor/ask", "valid-user-token", {
    question: "Какая функция эритроцитов?",
    subject_slug: "histology",
    top_k: 4,
    history: [{ role: "assistant", content: "Предыдущий ответ" }, { role: "user", content: "Продолжи" }],
  }), env, {
    question: "Какая функция эритроцитов?",
    subject_slug: "histology",
    top_k: 4,
    history: [{ role: "assistant", content: "Предыдущий ответ" }, { role: "user", content: "Продолжи" }],
  }, fetcher);

  assert.equal(result.ok, false, "histology without active MBH membership must be denied");
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
});

test("Tutor retrieves published questions and tickets and falls back locally when no provider is configured", async () => {
  const { fetcher } = createFetcher({ mbhMembership: true });
  const result = await askSupabaseTutor(request("/api/v1/tutor/ask", "valid-user-token", {
    question: "функция эритроцитов",
    subject_slug: "histology",
    top_k: 4,
  }), env, {
    question: "функция эритроцитов",
    subject_slug: "histology",
    top_k: 4,
  }, fetcher);

  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "rag-local-fallback");
  assert.equal(result.data.provider, "spaceweb-local");
  assert.equal(result.data.model, null);
  assert.ok(result.data.retrieved >= 1);
  assert.ok(result.data.sources.some((source) => source.id === "q:" + questionId));
  assert.match(result.data.answer, /Перенос кислорода/);
  assert.match(result.data.answer, /ИИ временно недоступен/);
});

test("Tutor asks a configured AI only with retrieved context and retains citation metadata", async () => {
  let providerCall = null;
  const providerEnv = {
    ...env,
    AI_CHAT_PRIMARY_PROVIDER: "groq",
    GROQ_API_KEY: "test-only-provider-key",
    GROQ_MODEL: "test-tutor-model",
  };
  const { fetcher: sourceFetcher } = createFetcher({ mbhMembership: true });
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "api.groq.com") {
      providerCall = { url, init };
      const requestBody = JSON.parse(init.body);
      assert.ok(requestBody.messages.some((message) => message.content.includes("Эталонный ответ: Перенос кислорода")));
      assert.ok(requestBody.messages.at(-1).content.includes("функция эритроцитов"));
      return response({ choices: [{ message: { content: "Эритроциты переносят кислород." } }], model: "test-tutor-model" });
    }
    return sourceFetcher(input, init);
  };
  const question = "функция эритроцитов";
  const result = await askSupabaseTutor(request("/api/v1/tutor/ask", "valid-user-token", {
    question,
    subject_slug: "histology",
  }), providerEnv, { question, subject_slug: "histology" }, fetcher);

  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "rag+llm");
  assert.equal(result.data.answer, "Эритроциты переносят кислород.");
  assert.equal(result.data.provider, "groq");
  assert.equal(result.data.model, "test-tutor-model");
  assert.ok(result.data.sources.length > 0);
  assert.ok(providerCall);
});

test("Tutor rejects empty, long and malformed subject queries before retrieval", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; throw new Error("should not call fetch"); };
  const empty = await askSupabaseTutor(request("/api/v1/tutor/ask", "valid-user-token"), env, { question: " " }, fetcher);
  assert.equal(empty.ok, false);
  assert.equal(empty.status, 422);
  assert.equal(calls, 0);

  const long = await askSupabaseTutor(request("/api/v1/tutor/ask", "valid-user-token"), env, { question: "x".repeat(2001) }, fetcher);
  assert.equal(long.ok, false);
  assert.equal(long.status, 422);
  assert.equal(calls, 0);

  const invalidSubject = await askSupabaseTutor(request("/api/v1/tutor/ask", "valid-user-token"), env, {
    question: "Кровь",
    subject_slug: "../histology",
  }, fetcher);
  assert.equal(invalidSubject.ok, false);
  assert.equal(invalidSubject.status, 422);
  assert.equal(calls, 0);
});

test("Tutor meta and subjects reflect real available corpus instead of fabricated counts", async () => {
  const { fetcher } = createFetcher({ mbhMembership: true });
  const meta = await getSupabaseTutorMeta(request("/api/v1/tutor/meta"), env, fetcher);
  assert.equal(meta.ok, true);
  assert.equal(meta.data.index.chunks > 0, true);
  assert.equal(meta.data.index.by_source.question, 1);
  assert.equal(meta.data.index.by_source.ticket, 1);
  assert.equal(meta.data.llm_enabled, false);
  assert.equal(meta.data.subjects[0].subject_slug, "histology");

  const subjects = await listSupabaseTutorSubjects(request("/api/v1/tutor/subjects"), env, fetcher);
  assert.equal(subjects.ok, true);
  assert.equal(subjects.data.items[0].subject_slug, "histology");
});

test("Tutor fails closed before table reads when Supabase rejects the session", async () => {
  let queriedTables = false;
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (authenticated(url)) return response({ message: "expired" }, 401);
    queriedTables = true;
    throw new Error("Should never query tables");
  };
  const result = await askSupabaseTutor(request("/api/v1/tutor/ask", "bad-token"), env, { question: "Кровь" }, fetcher);
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(queriedTables, false);
});
