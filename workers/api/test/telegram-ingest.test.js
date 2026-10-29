import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Telegram ingest is mounted and protected by a shared secret", async () => {
  const index = await source("../src/index.ts");
  const route = await source("../src/routes/telegram-ingest.ts");
  assert.match(index, /v1\.route\("\/telegram", telegramIngest\)/);
  assert.match(route, /telegramIngest\.post\("\/ingest"/);
  assert.match(route, /env\.TELEGRAM_INGEST_SECRET \|\| env\.TELEGRAM_WEBHOOK_SECRET/);
  assert.match(route, /x-telegram-bot-api-secret-token/);
  assert.match(route, /constantTimeEqual/);
  assert.doesNotMatch(route, /console\.log\([^)]*secret/i);
});

test("ingest classifies every text message and creates homework only above threshold", async () => {
  const route = await source("../src/routes/telegram-ingest.ts");
  assert.match(route, /classifyMessage\(c\.env/);
  assert.match(route, /HOMEWORK_THRESHOLD = 0\.65/);
  assert.match(route, /classification\.category !== "homework" \|\| classification\.confidence < HOMEWORK_THRESHOLD/);
  assert.match(route, /publishTelegramHomework/);
  assert.match(route, /material_candidate/);
});

test("ordinary chatter never triggers a bot reply", async () => {
  const route = await source("../src/routes/telegram-ingest.ts");
  assert.match(route, /classification\.category === "homework" \|\| classification\.category === "material_candidate"/);
  assert.doesNotMatch(route, /category === "other" && classification\.confidence <= 0\.6/);
});

test("admin can see AI status, messages and publish a missed homework", async () => {
  const admin = await source("../src/routes/admin.ts");
  for (const contract of [
    'admin.get("/telegram/ai-status"',
    'admin.get("/telegram/messages"',
    'admin.post("/telegram/messages/:id/publish"',
    'admin.post("/telegram/set-webhook"',
  ]) assert.ok(admin.includes(contract), "missing admin contract: " + contract);
  assert.match(admin, /workersAiConfigured\(c\.env\)/);
  assert.match(admin, /publishTelegramHomework\(db, message, chat, classification\)/);
});

test("Workers AI is bound without API keys; GigaChat is optional", async () => {
  const wrangler = await source("../wrangler.toml");
  const env = await source("../src/env.ts");
  assert.match(wrangler, /\[ai\]\r?\nbinding = "AI"/);
  assert.match(wrangler, /AI_SORT_PROVIDER = "cloudflare"/);
  assert.match(wrangler, /@cf\/meta\/llama-3\.1-8b-instruct-fp8/);
  assert.doesNotMatch(wrangler, /GIGACHAT_RELAY_URL/);
  assert.match(env, /AI\?: Ai/);
  assert.match(env, /AI_SORT_PROVIDER\?: string/);
});
