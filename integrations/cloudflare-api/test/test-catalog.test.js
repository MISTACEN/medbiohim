import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseChemistryMaster, getSupabaseTestCurriculumMap } from "../src/test-catalog.js";

const env = { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "public-anon-key-for-test-only" };
const groupId = "11111111-1111-4111-8111-111111111111";
const subjectId = "22222222-2222-4222-8222-222222222222";
const moduleId = "33333333-3333-4333-8333-333333333333";
const topicId = "44444444-4444-4444-8444-444444444444";

function request(path) {
  return new Request("https://worker.example/api/v1" + path, { headers: { authorization: "Bearer user-token" } });
}
function mock(handler) {
  return async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    assert.equal(init.headers.authorization, "Bearer user-token");
    assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
    return handler(parsed, init);
  };
}

test("curriculum map returns topic counts and planned dates for the selected group", async () => {
  const result = await getSupabaseTestCurriculumMap(request("/tests/curriculum-map?group_id=" + groupId), env, { group_id: groupId }, mock((url) => {
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify([{
      group_id: groupId,
      groups: { id: groupId, name: "МБХ-201", code: "MBH-201", course_number: 2, specialty_slug: "mbh", is_active: true },
    }]), { status: 200 });
    if (url.pathname === "/rest/v1/subjects") {
      assert.equal(url.searchParams.get("or"), "(course_number.is.null,course_number.eq.2)");
      return new Response(JSON.stringify([{ id: subjectId, name: "Гистология", course_number: 2, specialty_slug: "histology", is_active: true }]), { status: 200 });
    }
    if (url.pathname === "/rest/v1/modules") return new Response(JSON.stringify([{ id: moduleId, subject_id: subjectId, title: "Общая гистология", order_index: 1, is_published: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/topics") return new Response(JSON.stringify([{ id: topicId, module_id: moduleId, title: "Кровь", order_index: 1, is_published: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/curriculum_items") return new Response(JSON.stringify([{ topic_id: topicId, planned_date: "2026-10-15", item_type: "lecture", order_index: 1 }]), { status: 200 });
    if (url.pathname === "/rest/v1/questions" && url.searchParams.get("topic_id") === "in.(" + topicId + ")") return new Response(JSON.stringify([{ id: "q-1", topic_id: topicId, subject_id: subjectId }, { id: "q-2", topic_id: topicId, subject_id: subjectId }]), { status: 200 });
    if (url.pathname === "/rest/v1/tests") return new Response(JSON.stringify([{ id: "t-1", topic_id: topicId, subject_id: subjectId }]), { status: 200 });
    if (url.pathname === "/rest/v1/questions" && url.searchParams.get("topic_id") === "is.null") return new Response(JSON.stringify([{ id: "q-3", subject_id: subjectId }]), { status: 200 });
    throw new Error("unexpected request " + url.pathname + " " + url.search);
  }));
  assert.equal(result.ok, true);
  const subject = result.data.items[0];
  assert.equal(subject.subject_id, subjectId);
  assert.equal(subject.unclassified_questions, 1);
  assert.equal(subject.modules[0].topics[0].title, "Кровь");
  assert.equal(subject.modules[0].topics[0].question_count, 2);
  assert.equal(subject.modules[0].topics[0].test_count, 1);
  assert.equal(subject.modules[0].topics[0].planned_date, "2026-10-15");
});

test("curriculum map rejects a group that is not an active membership", async () => {
  const result = await getSupabaseTestCurriculumMap(request("/tests/curriculum-map?group_id=" + groupId), env, { group_id: groupId }, mock((url) => {
    if (url.pathname === "/rest/v1/group_memberships") return new Response("[]", { status: 200 });
    throw new Error("database should not be queried after membership denial");
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "NO_GROUP");
});

test("chemistry master filters by kind, formula and search then paginates", async () => {
  const content = [
    { id: "1", kind: "mcq", topic: "Связь", question: "Структурная формула спирта", answer: "A", source: "source", answer_status: "verified", source_number: 1, formula_preserved: true, plan_topic_id: topicId },
    { id: "2", kind: "mcq", topic: "Реакции", question: "Реакция алкена", answer: "B", source: "source", answer_status: "verified", source_number: 2, formula_preserved: true, plan_topic_id: topicId },
    { id: "3", kind: "open", topic: "Связь", question: "Объясните связь", answer: "Ответ", source: "source", answer_status: "pending", source_number: 3, formula_preserved: false, plan_topic_id: topicId },
  ];
  const result = await getSupabaseChemistryMaster(request("/tests/chemistry-master?page=1&limit=1&kind=mcq&formula=1&q=формула"), env, {
    page: "1", limit: "1", kind: "mcq", formula: "1", q: "формула",
  }, mock((url) => {
    assert.equal(url.pathname, "/rest/v1/chemistry_master_documents");
    assert.equal(url.searchParams.get("subject_slug"), "eq.chemistry_organic_physical");
    assert.equal(url.searchParams.get("version"), "eq.2026-10-07-v1");
    return new Response(JSON.stringify([{
      subject_slug: "chemistry_organic_physical",
      version: "2026-10-07-v1",
      title: "Органическая и физическая химия",
      item_count: content.length,
      content,
    }]), { status: 200 });
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.pagination.total, 1);
  assert.equal(result.data.pagination.pages, 1);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].item_id, "1");
  assert.equal(result.data.items[0].formula_preserved, true);
  assert.equal(result.data.items[0].answer, "A");
});

test("chemistry master rejects invalid formulas and caps page size", async () => {
  const invalid = await getSupabaseChemistryMaster(request("/tests/chemistry-master?formula=maybe"), env, { formula: "maybe" }, mock(() => {
    throw new Error("invalid filter should fail before data access");
  }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 422);

  const result = await getSupabaseChemistryMaster(request("/tests/chemistry-master?page=0&limit=900"), env, { page: "0", limit: "900" }, mock((url) => {
    assert.equal(url.pathname, "/rest/v1/chemistry_master_documents");
    return new Response(JSON.stringify([{ subject_slug: "chemistry_organic_physical", version: "2026-10-07-v1", title: "Chemistry", content: [] }]), { status: 200 });
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.pagination.page, 1);
  assert.equal(result.data.pagination.limit, 50);
});
