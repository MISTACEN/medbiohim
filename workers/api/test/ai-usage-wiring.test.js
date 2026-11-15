import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

const MIGRATION = "../../../database/migrations/20261115_ai_call_log.sql";

test("миграция: таблица журнала с маршрутом, провайдером, моделью, задержкой и результатом", async () => {
  const sql = await source(MIGRATION);
  assert.match(sql, /create table if not exists public\.ai_call_log/);
  for (const column of [
    "route", "feature", "provider", "model", "latency_ms", "outcome",
    "error_code", "user_id", "subject_slug", "request_id", "attempts",
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `в журнале нет колонки ${column}`);
  }
  assert.match(sql, /outcome text not null check \(outcome in \('ok', 'error', 'rate_limited'\)\)/);
  assert.match(sql, /create index if not exists ai_call_log_created_idx/);
  assert.match(sql, /create index if not exists ai_call_log_feature_created_idx/);
});

test("миграция: журнал закрыт RLS без политик, читает и пишет только service_role", async () => {
  const sql = await source(MIGRATION);
  assert.match(sql, /alter table public\.ai_call_log enable row level security/);
  assert.doesNotMatch(sql, /create policy/i, "у журнала не должно быть RLS-политик для браузерных ролей");
  assert.match(sql, /revoke all on public\.ai_call_log from anon, authenticated/);
  assert.match(sql, /grant select, insert on public\.ai_call_log to service_role/);
});

test("миграция: сводка по дням и провайдерам доступна только service_role", async () => {
  const sql = await source(MIGRATION);
  assert.match(sql, /create or replace function public\.medbiohim_ai_call_stats\(p_days integer default 7\)/);
  for (const block of ["by_day", "by_feature", "by_provider", "by_model", "by_route"]) {
    assert.match(sql, new RegExp(`\\b${block}\\b`), `в сводке нет разреза ${block}`);
  }
  assert.match(sql, /percentile_disc\(0\.95\)/);
  assert.match(sql, /revoke all on function public\.medbiohim_ai_call_stats\(integer\) from anon, authenticated/);
  assert.match(sql, /grant execute on function public\.medbiohim_ai_call_stats\(integer\) to service_role/);
});

test("каждая точка вызова ИИ пишет строку в журнал", async () => {
  const files = {
    "src/routes/ai.ts": await source("../src/routes/ai.ts"),
    "src/routes/card-packs.ts": await source("../src/routes/card-packs.ts"),
    "src/routes/lectures.ts": await source("../src/routes/lectures.ts"),
    "src/lib/telegram-classify.ts": await source("../src/lib/telegram-classify.ts"),
    "src/routes/admin.ts": await source("../src/routes/admin.ts"),
  };
  for (const [file, text] of Object.entries(files)) {
    assert.match(text, /ai-usage/, `${file} не импортирует журнал`);
    assert.match(text, /withAiCall(?:<[^>]*>)?\(|logAiCall\(/, `${file} не пишет вызов ИИ`);
  }
  // Обёртка стоит именно вокруг вызовов провайдера, а не импортирована зря.
  assert.match(files["src/routes/card-packs.ts"], /withAiCall(?:<[^>]*>)?\([\s\S]{0,600}generateAiCompletion\(/);
  assert.match(files["src/routes/lectures.ts"], /withAiCall\([\s\S]{0,500}generateClozeDraft\(/);
  assert.match(files["src/lib/telegram-classify.ts"], /withAiCall\([\s\S]{0,400}completeWithAi\(/);
  assert.match(files["src/routes/admin.ts"], /logAiCall\(c\.env, \{ \.\.\.aiUsage, outcome: "ok"/);
});

test("ответ тьютора журналируется и в /ai/chat, и в истории чата", async () => {
  const ai = await source("../src/routes/ai.ts");
  assert.equal((ai.match(/trackedGeneration\(\s*c\.env/g) || []).length, 2, "оба маршрута тьютора");
  assert.match(ai, /route: "POST \/ai\/chat"/);
  assert.match(ai, /route: "POST \/ai\/conversations\/:id\/messages"/);
  // Диагностика провайдеров тоже видна в журнале.
  assert.match(ai, /feature: "diagnostics"/);
  assert.match(ai, /withAiCall(?:<[^>]*>)?\(\s*c\.env,/);
});

test("дорогие генерации ограничены суточной квотой", async () => {
  const ai = await source("../src/routes/ai.ts");
  assert.equal(
    (ai.match(/aiDailyQuota\(c\.env, "tutor_chat", user\.id\)/g) || []).length,
    2,
    "квота проверяется в обоих маршрутах тьютора",
  );
  assert.match(await source("../src/routes/card-packs.ts"), /aiDailyQuota\(c\.env, "card_pack", userId\)/);
  assert.match(await source("../src/routes/lectures.ts"), /aiDailyQuota\(c\.env, "lecture_cloze", user\.id\)/);
  assert.match(await source("../src/routes/admin.ts"), /aiDailyQuota\(c\.env, "lecture_generate", user\.id\)/);
  // Отказ возвращается как 429 и попадает в журнал.
  for (const text of [ai, await source("../src/routes/card-packs.ts")]) {
    assert.match(text, /logAiQuotaRejection\(/);
    assert.match(text, /AI_DAILY_LIMIT/);
  }
});

test("админская сводка закрыта ролью admin и читает журнал сервисным клиентом", async () => {
  const route = await source("../src/routes/admin-ai-usage.ts");
  assert.match(route, /requireAdmin/);
  assert.match(route, /createServiceClient\(c\.env\)/);
  assert.match(route, /rpc\("medbiohim_ai_call_stats", \{ p_days: days \}\)/);
  assert.match(route, /limits: AI_DAILY_LIMITS/);
  const index = await source("../src/index.ts");
  assert.match(index, /v1\.route\("\/admin", adminAiUsage\)/);
});
