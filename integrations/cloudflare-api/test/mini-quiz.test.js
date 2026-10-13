import test from "node:test";
import assert from "node:assert/strict";
import {
  checkSupabaseLectureMiniQuizAnswer,
  listSupabaseLectureMiniQuiz,
} from "../src/mini-quiz.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const subjectId = "subject-1";
const questionId = "question-1";
function request(path = "/api/v1/questions/mini-quiz", token = "Bearer valid-user-token") {
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
function subject(slug = "chemistry", specialty = "chemistry") {
  return { id: subjectId, slug, specialty_slug: specialty, is_active: true };
}
function membership(specialty = "chemistry", active = true) {
  return { group_id: "group-1", groups: { specialty_slug: specialty, is_active: active } };
}
function quizQuestion(overrides = {}) {
  return {
    id: questionId,
    subject_id: subjectId,
    module_id: "module-1",
    topic_id: "topic-1",
    type: "mcq",
    text: "Which answer is correct?",
    answer: "",
    options: [
      { label: "Wrong answer", correct: false },
      { label: "Correct answer", correct: true },
    ],
    ...overrides,
  };
}

test("GET lecture mini-quiz returns only safe fields and preserves requested question order", async () => {
  const queryPaths = [];
  const result = await listSupabaseLectureMiniQuiz(request(), env, {
    subject_id: subjectId,
    ids: "question-2,question-1,question-2",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    queryPaths.push(parsed.pathname);
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/subjects") {
      assert.equal(parsed.searchParams.get("id"), "eq." + subjectId);
      assert.equal(parsed.searchParams.get("is_active"), "eq.true");
      return response([subject()]);
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
      return response([membership()]);
    }
    if (parsed.pathname === "/rest/v1/questions") {
      assert.match(parsed.searchParams.get("id"), /question-2/);
      assert.equal(parsed.searchParams.get("subject_id"), "eq." + subjectId);
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      assert.equal(parsed.searchParams.get("archived_at"), "is.null");
      return response([
        quizQuestion({ id: "question-1" }),
        quizQuestion({ id: "question-2", options: '[{"label":"A","correct":true},{"label":"B"}]' }),
        quizQuestion({ id: "unrequested" }),
      ]);
    }
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((row) => row.id), ["question-2", "question-1"]);
  assert.deepEqual(result.data.items[0].options, [{ index: 0, label: "A" }, { index: 1, label: "B" }]);
  assert.equal(JSON.stringify(result.data).includes('"correct":true'), false);
  assert.equal(queryPaths.includes("/rest/v1/group_memberships"), true);
});

test("GET mini-quiz caps ids to 12 and rejects invalid id syntax before question reads", async () => {
  let questionReads = 0;
  const tooMany = await listSupabaseLectureMiniQuiz(request(), env, {
    subject_id: subjectId,
    ids: Array.from({ length: 13 }, (_, i) => "q" + i).join(","),
  }, async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    questionReads += 1;
    return response([]);
  });
  const invalid = await listSupabaseLectureMiniQuiz(request(), env, {
    subject_id: subjectId,
    ids: "q1,../private",
  }, async (url) => {
    if (new URL(String(url)).pathname === "/auth/v1/user") return response({ id: "user-1" });
    questionReads += 1;
    return response([]);
  });
  assert.equal(tooMany.status, 422);
  assert.equal(invalid.status, 422);
  assert.equal(questionReads, 0);
});

test("Histology mini-quiz requires an explicitly active MBH membership", async () => {
  let questionReads = 0;
  const result = await listSupabaseLectureMiniQuiz(request(), env, {
    subject_id: subjectId,
    ids: questionId,
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/subjects") return response([subject("histology", null)]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([
      membership("mbh", false),
      membership("chemistry", true),
    ]);
    if (parsed.pathname === "/rest/v1/questions") questionReads += 1;
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(questionReads, 0);
});

test("mini-quiz returns not found for inactive subjects and fails closed when specialty membership cannot be verified", async () => {
  const inactive = await listSupabaseLectureMiniQuiz(request(), env, {
    subject_id: subjectId, ids: questionId,
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/subjects") return response([]);
    assert.fail("inactive subject must stop reads");
  });
  const noMembership = await listSupabaseLectureMiniQuiz(request(), env, {
    subject_id: subjectId, ids: questionId,
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/subjects") return response([subject()]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response({ message: "RLS denied" }, 403);
    assert.fail("membership failure must stop reads");
  });
  assert.equal(inactive.status, 404);
  assert.equal(noMembership.status, 503);
});

test("POST mini-quiz check returns only score metadata, not correct options or answer text", async () => {
  const result = await checkSupabaseLectureMiniQuizAnswer(request("/api/v1/questions/mini-quiz/check"), env, {
    question_id: questionId, subject_id: subjectId, selected_indexes: [1, 0, 1],
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    if (parsed.pathname === "/rest/v1/subjects") return response([subject()]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([membership()]);
    if (parsed.pathname === "/rest/v1/questions") {
      assert.equal(parsed.searchParams.get("id"), "eq." + questionId);
      assert.equal(parsed.searchParams.get("subject_id"), "eq." + subjectId);
      return response([quizQuestion()]);
    }
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    correct: true,
    selected_count: 2,
    required_count: 1,
    question_type: "mcq",
  });
  assert.equal(JSON.stringify(result.data).includes("Correct answer"), false);
  assert.equal(JSON.stringify(result.data).includes("options"), false);
});

test("POST mini-quiz supports numeric answer indexes and answer text fallback", async (t) => {
  await t.test("comma-separated numeric indexes", async () => {
    const result = await checkSupabaseLectureMiniQuizAnswer(request(), env, {
      question_id: questionId, subject_id: subjectId, selected_indexes: [0, 2],
    }, async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
      if (parsed.pathname === "/rest/v1/subjects") return response([subject(null, null)]);
      if (parsed.pathname === "/rest/v1/questions") return response([
        quizQuestion({ options: [{ label: "A" }, { label: "B" }, { label: "C" }], answer: "0,2" }),
      ]);
      assert.fail("unexpected REST endpoint: " + parsed.pathname);
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.correct, true);
    assert.equal(result.data.required_count, 2);
  });
  await t.test("answer label fallback", async () => {
    const result = await checkSupabaseLectureMiniQuizAnswer(request(), env, {
      question_id: questionId, subject_id: subjectId, selected_indexes: [1],
    }, async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
      if (parsed.pathname === "/rest/v1/subjects") return response([subject(null, null)]);
      if (parsed.pathname === "/rest/v1/questions") return response([
        quizQuestion({ options: [{ label: "Choice A" }, { label: "Exact label" }], answer: "exact label" }),
      ]);
      assert.fail("unexpected REST endpoint: " + parsed.pathname);
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.correct, true);
  });
});

test("POST mini-quiz rejects malformed answers and returns 404 for hidden questions", async () => {
  let questionReads = 0;
  const invalid = await checkSupabaseLectureMiniQuizAnswer(request(), env, {
    question_id: questionId, subject_id: subjectId, selected_indexes: ["1"],
  }, async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    questionReads += 1;
    return response([]);
  });
  const hidden = await checkSupabaseLectureMiniQuizAnswer(request(), env, {
    question_id: questionId, subject_id: subjectId, selected_indexes: [],
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/subjects") return response([subject(null, null)]);
    if (parsed.pathname === "/rest/v1/questions") return response([]);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(invalid.status, 422);
  assert.equal(questionReads, 0);
  assert.equal(hidden.status, 404);
});
