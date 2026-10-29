import test from "node:test";
import assert from "node:assert/strict";

import {
  classificationProviderLabel,
  classifyMessage,
  parseAiClassification,
  parseDueAt,
  ruleClassification,
  verifiedDueHint,
} from "../src/lib/telegram-classify.ts";
import { workersAiComplete, workersAiConfigured } from "../src/lib/workers-ai.ts";

const AI_JSON = JSON.stringify({
  category: "homework",
  confidence: 0.92,
  title: "Конспект по биохимии",
  summary: "Написать конспект по теме углеводного обмена.",
  subject: "Биохимия",
  due_hint: "до пятницы",
  tasks: ["Конспект", "Задачи 1–5"],
  reason: "явное задание",
});

function aiEnv(response = AI_JSON, calls = []) {
  return {
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response, model };
      },
    },
  };
}

test("Cloudflare AI is the default sorter and receives ordinary chatter", async () => {
  const calls = [];
  const env = aiEnv(JSON.stringify({ category: "other", confidence: 0.88, title: "", summary: "", subject: "", due_hint: "", tasks: [], reason: "обсуждение" }), calls);
  const result = await classifyMessage(env, { text: "Кто-нибудь скинет конспект по биохимии?" });
  assert.equal(calls.length, 1, "модель должна получать не только сообщения со словом «дз»");
  assert.match(calls[0].model, /^@cf\//);
  assert.equal(result.provider, "cloudflare");
  assert.equal(result.category, "other");
  assert.equal(result.confidence, 0.88);
});

test("AI forms the homework fields and keeps explicit subject and tasks", async () => {
  const calls = [];
  const result = await classifyMessage(aiEnv(AI_JSON, calls), {
    text: "К пятнице напишите конспект по биохимии, задачи 1–5",
    chatTitle: "МБХ-201",
  });
  assert.equal(result.provider, "cloudflare");
  assert.equal(result.category, "homework");
  assert.equal(result.subjectHint, "Биохимия");
  assert.deepEqual(result.tasks, ["Конспект", "Задачи 1–5"]);
  assert.equal(result.reason, "явное задание");
  assert.equal(JSON.parse(calls[0].input.messages[1].content).message, "К пятнице напишите конспект по биохимии, задачи 1–5");
});

test("invented deadline is dropped, explicit weekday is still parsed", async () => {
  assert.equal(verifiedDueHint("до пятницы", "К пятнице напишите конспект"), null);
  assert.equal(verifiedDueHint("к пятнице", "К пятнице напишите конспект"), "к пятнице");
  assert.ok(parseDueAt("К пятнице напишите конспект", new Date("2026-10-26T10:00:00Z")));
  assert.ok(parseDueAt("до 25.09", new Date("2026-10-26T10:00:00Z")));
  assert.equal(parseDueAt("сделайте что-нибудь", new Date("2026-10-26T10:00:00Z")), null);
});

test("invalid AI JSON falls back to rules without losing the message", async () => {
  const result = await classifyMessage(aiEnv("это не JSON"), {
    text: "Сделать задание к следующему занятию",
  });
  assert.equal(result.provider, "rules");
  assert.match(result.reason, /invalid_json/);
  assert.equal(result.category, "homework");
  assert.ok(result.confidence >= 0.6);
});

test("AI outage falls back to rules and reports the provider", async () => {
  const env = { AI: { async run() { throw new Error("model unavailable"); } } };
  const result = await classifyMessage(env, { text: "Выучить параграф 12" });
  assert.equal(result.provider, "rules");
  assert.match(result.reason, /rules_cloudflare_not_available/);
  assert.equal(result.category, "homework");
});

test("Explicit GigaChat mode still works with a static access token", async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      model: "GigaChat",
      choices: [{ message: { content: AI_JSON } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await classifyMessage({
      AI_SORT_PROVIDER: "gigachat",
      GIGACHAT_ACCESS_TOKEN: "static-token",
    }, { text: "Конспект к пятнице" });
    assert.equal(result.provider, "gigachat");
    assert.equal(result.model, "GigaChat");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /chat\/completions$/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("Workers AI client rejects empty content and missing binding", async () => {
  assert.equal(workersAiConfigured({}), false);
  await assert.rejects(
    () => workersAiComplete({}, [{ role: "user", content: "test" }]),
    /not configured/i,
  );
  await assert.rejects(
    () => workersAiComplete({ AI: { async run() { return { response: "  " }; } } }, [{ role: "user", content: "test" }]),
    /empty content/i,
  );
});

test("classification labels are user-facing, not provider codes", () => {
  assert.equal(classificationProviderLabel("cloudflare"), "Cloudflare AI");
  assert.equal(classificationProviderLabel("gigachat"), "GigaChat");
  assert.equal(classificationProviderLabel("rules"), "правилами");
  assert.equal(parseAiClassification(AI_JSON, "cloudflare")?.provider, "cloudflare");
  assert.equal(ruleClassification("привет", false).category, "other");
});
