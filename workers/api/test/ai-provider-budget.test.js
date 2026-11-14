import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provider = await readFile(new URL("../../../integrations/cloudflare-api/src/ai-chat.js", import.meta.url), "utf8");
const route = await readFile(new URL("../src/routes/ai.ts", import.meta.url), "utf8");

test("внешнему провайдеру даётся больше семи секунд", () => {
  // 7 с не хватало 70B-модели на ответ в 500–800 токенов: запрос обрывался,
  // и тьютор молча уходил на 8B Workers AI.
  assert.match(provider, /const EXTERNAL_CALL_TIMEOUT_MS = 15_000;/);
  assert.match(provider, /const EXTERNAL_TOTAL_BUDGET_MS = 20_000;/);
  assert.match(provider, /Math\.min\(EXTERNAL_CALL_TIMEOUT_MS, remaining \|\| EXTERNAL_CALL_TIMEOUT_MS\)/);
  assert.match(provider, /const deadline = Date\.now\(\) \+ EXTERNAL_TOTAL_BUDGET_MS;/);
  // В жёстком виде 7 с и 16 с больше не зашиты.
  assert.doesNotMatch(provider, /Math\.min\(7000,/);
  assert.doesNotMatch(provider, /Date\.now\(\) \+ 16_000/);
});

test("ошибки провайдеров различают сеть, HTTP-статус и успех", () => {
  assert.match(provider, /outcome: "network", status: 0/);
  assert.match(provider, /outcome: "http", status: response\.status/);
  assert.match(provider, /outcome: "ok", status: response\.status/);
  // GigaChat сначала идёт за токеном — этап виден отдельно.
  assert.match(provider, /stage: "oauth"/);
  assert.match(provider, /stage: "chat"/);
});

test("диагностика доступна только админу и не раскрывает ключи", () => {
  assert.match(route, /ai\.get\("\/diagnostics", requireAdmin/);
  assert.match(route, /onAttempt: \(attempt: Record<string, unknown>\) => attempts\.push/);
  assert.match(route, /providers\.push\(\{ id, configured: false, model: meta\?\.model \?\? null \}\)/);
  // В ответе только статус/этап/время: ни ключей, ни тел ответов провайдера.
  assert.doesNotMatch(route, /attempts\.push\(\{ \.\.\.attempt, requested: id, key/);
});
