import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_DAILY_LIMITS,
  aiDailyQuota,
  aiQuotaMessage,
  logAiCall,
  withAiCall,
} from "../src/lib/ai-usage.ts";

/** Фейковый сервисный клиент Supabase: пишет строки в память. */
function fakeClient(result = { error: null }) {
  const rows = [];
  return {
    rows,
    from(table) {
      return {
        insert: async (row) => {
          rows.push({ table, row });
          return result;
        },
      };
    },
  };
}

// Без сервисного ключа журнал не ведётся, но вызов не ломается.
const env = {};

const usage = { route: "POST /ai/chat", feature: "tutor_chat", outcome: "ok" };

test("журнал пишет маршрут, провайдера, модель, задержку и результат", async () => {
  const client = fakeClient();
  const ok = await logAiCall(env, {
    route: "POST /ai/chat",
    feature: "tutor_chat",
    outcome: "ok",
    provider: "groq",
    model: "llama-3.1-70b",
    latencyMs: 812,
    userId: "11111111-1111-4111-8111-111111111111",
    subjectSlug: "physiology",
    requestId: "req-1",
    attempts: [{ id: "groq", outcome: "ok", ms: 812 }],
    metadata: { mode: "precise" },
  }, client);
  assert.equal(ok, true);
  assert.equal(client.rows.length, 1);
  const { table, row } = client.rows[0];
  assert.equal(table, "ai_call_log");
  assert.equal(row.route, "POST /ai/chat");
  assert.equal(row.feature, "tutor_chat");
  assert.equal(row.provider, "groq");
  assert.equal(row.model, "llama-3.1-70b");
  assert.equal(row.latency_ms, 812);
  assert.equal(row.outcome, "ok");
  assert.equal(row.subject_slug, "physiology");
  assert.equal(row.request_id, "req-1");
  assert.deepEqual(row.attempts, [{ id: "groq", outcome: "ok", ms: 812 }]);
  assert.deepEqual(row.metadata, { mode: "precise" });
});

test("сбой журнала не ломает ответ и не бросает", async () => {
  const failing = { from: () => ({ insert: async () => ({ error: { message: "boom" } }) }) };
  assert.equal(await logAiCall(env, usage, failing), false);
  const throwing = { from: () => { throw new Error("no db"); } };
  assert.equal(await logAiCall(env, usage, throwing), false);
  assert.equal(await logAiCall(env, usage), false);
});

test("неизвестная функция и пустой маршрут не пишутся", async () => {
  const client = fakeClient();
  assert.equal(await logAiCall(env, { route: "x", feature: "unknown", outcome: "ok" }, client), false);
  assert.equal(client.rows.length, 0);
  // Маршрут обязателен в таблице: без него подставляется заглушка, а не null.
  await logAiCall(env, { route: "", feature: "tutor_chat", outcome: "ok" }, client);
  assert.equal(client.rows[0].row.route, "unknown");
});

test("обёртка пишет успех с провайдером, моделью и задержкой", async () => {
  const client = fakeClient();
  let clock = 1000;
  const now = () => {
    const value = clock;
    clock += 250;
    return value;
  };
  const result = await withAiCall(
    env,
    { route: "POST /card-packs/ai-generate", feature: "card_pack" },
    async () => ({ provider: "mistral", model: "mistral-small", content: "[]" }),
    { client, now },
  );
  assert.equal(result.provider, "mistral");
  const row = client.rows[0].row;
  assert.equal(row.outcome, "ok");
  assert.equal(row.provider, "mistral");
  assert.equal(row.model, "mistral-small");
  assert.equal(row.latency_ms, 250);
});

test("обёртка пишет ошибку с кодом и пробрасывает её дальше", async () => {
  const client = fakeClient();
  const failure = Object.assign(new Error("all providers down"), { code: "AI_UPSTREAM_UNAVAILABLE" });
  await assert.rejects(
    () => withAiCall(env, { route: "POST /ai/chat", feature: "tutor_chat" }, async () => { throw failure; }, { client }),
    /all providers down/,
  );
  const row = client.rows[0].row;
  assert.equal(row.outcome, "error");
  assert.equal(row.error_code, "AI_UPSTREAM_UNAVAILABLE");
  assert.equal(row.provider, null);
});

test("описание результата для нестандартного провайдера", async () => {
  const client = fakeClient();
  await withAiCall(
    env,
    { route: "POST /admin/lectures/generate", feature: "lecture_generate" },
    async () => ({ choices: [] }),
    { client, describe: () => ({ provider: "openai", model: "gpt-4o-mini" }) },
  );
  assert.equal(client.rows[0].row.provider, "openai");
  assert.equal(client.rows[0].row.model, "gpt-4o-mini");
});

test("у дорогих генераций есть суточный лимит, у служебных — нет", () => {
  assert.equal(AI_DAILY_LIMITS.tutor_chat, 150);
  assert.equal(AI_DAILY_LIMITS.lecture_cloze, 20);
  assert.equal(AI_DAILY_LIMITS.card_pack, 25);
  assert.equal(AI_DAILY_LIMITS.lecture_generate, 30);
  assert.equal(AI_DAILY_LIMITS.telegram_sort, null);
  assert.equal(AI_DAILY_LIMITS.diagnostics, null);
});

test("квота считает суточный ключ и отказывает после лимита", async () => {
  const calls = [];
  const stub = async (_env, key, limit, ttl) => {
    calls.push({ key, limit, ttl });
    return { allowed: false, remaining: 0 };
  };
  const quota = await aiDailyQuota(env, "lecture_cloze", "user-1", { limit: stub });
  assert.equal(quota.allowed, false);
  assert.equal(quota.limit, AI_DAILY_LIMITS.lecture_cloze);
  assert.equal(quota.used, AI_DAILY_LIMITS.lecture_cloze);
  assert.match(calls[0].key, /^ai:day:lecture_cloze:user-1:\d{4}-\d{2}-\d{2}$/);
  assert.equal(calls[0].limit, AI_DAILY_LIMITS.lecture_cloze);
  assert.ok(calls[0].ttl >= 60, "ключ живёт дольше остатка суток");
});

test("квота не трогает хранилище без лимита и без пользователя", async () => {
  const mustNotRun = async () => { throw new Error("redis must not be called"); };
  assert.equal((await aiDailyQuota(env, "telegram_sort", "user-1", { limit: mustNotRun })).allowed, true);
  assert.equal((await aiDailyQuota(env, "diagnostics", "user-1", { limit: mustNotRun })).allowed, true);
  assert.equal((await aiDailyQuota(env, "tutor_chat", null, { limit: mustNotRun })).allowed, true);
});

test("без Redis квота не блокирует вызов (fail open)", async () => {
  const quota = await aiDailyQuota({}, "tutor_chat", "user-1");
  assert.equal(quota.allowed, true);
});

test("сообщение об отказе называет лимит и функцию", () => {
  const message = aiQuotaMessage({ allowed: false, limit: 20, used: 20, remaining: 0 }, "lecture_cloze");
  assert.match(message, /20/);
  assert.match(message, /конспект/);
  assert.match(message, /завтра/);
});
