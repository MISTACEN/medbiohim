/**
 * Офлайн-ответы: происхождение записи и идемпотентный повтор.
 *
 * Тесты читают исходники и фиксируют решения, которые легко потерять:
 * клиент не может объявить чужое происхождение, повтор не создаёт второй ответ,
 * а сервис-воркер не кэширует API.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

const ANSWER_ROUTE = "workers/api/src/routes/trainers/02-answer.ts";
const IDEMPOTENCY = "workers/api/src/lib/idempotency.ts";
const QUEUE = "src/lib/offline/queue.ts";

test("сервер принимает только origin=user и не даёт выдать ответ за импорт", async () => {
  const source = await read(ANSWER_ROUTE);
  assert.ok(source.includes('payload.origin && payload.origin !== "user"'), "нужна проверка origin");
  assert.ok(source.includes('"origin может быть только user"'));
});

test("повтор с client_id возвращает прежний результат", async () => {
  const route = await read(ANSWER_ROUTE);
  assert.ok(route.includes("normalizeClientId(payload.client_id)"));
  assert.ok(route.includes("readIdempotent<Record<string, unknown>>"));
  assert.ok(route.includes("replayed: true"));

  // Оба пути сохранения (RPC и резервный) обязаны запомнить результат.
  const writes = route.match(/writeIdempotent\(c\.env, IDEMPOTENCY_SCOPE, user\.id, clientId/g) || [];
  assert.equal(writes.length, 2, "результат должен запоминаться на обоих путях");

  const lib = await read(IDEMPOTENCY);
  assert.ok(lib.includes("export const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60"));
  assert.ok(lib.includes("CLIENT_ID_PATTERN"));
  assert.ok(lib.includes("idem:${scope}:${userId}:${clientId}"));
});

test("очередь клиента помечает записи origin=user и хранит client_id", async () => {
  const queue = await read(QUEUE);
  assert.ok(queue.includes('export const OUTBOX_ORIGIN = "user"'));
  assert.ok(queue.includes("origin: OUTBOX_ORIGIN"));
  assert.ok(queue.includes("client_id: payload.client_id ?? newClientId()"));
  assert.ok(queue.includes("export const OUTBOX_LIMIT = 200"));
  assert.ok(queue.includes("if (outcome.retryable) break;"), "сеть останавливает очередь");
});

test("ответ тренажёра уходит через очередь, а UI понимает отложенный ответ", async () => {
  const content = await read("src/lib/api/content.ts");
  assert.ok(content.includes("submitOrQueue<any>(endpoints.content.trainerFeedAnswer()"));

  const hook = await read("src/components/trainers/useTrainerFeedPage.ts");
  assert.ok(hook.includes("data?.queued"), "компонент должен различать отложенный ответ");
  assert.ok(hook.includes("ответ сохранён на устройстве"));

  const layout = await read("src/app/layout.tsx");
  assert.ok(layout.includes("<OfflineIndicator />"), "индикатор очереди монтируется в layout");
});

test("service worker не кэширует API и авторизацию", async () => {
  const sw = await read("public/sw.js");
  assert.ok(sw.includes('url.pathname.startsWith("/api/")'));
  assert.ok(sw.includes('url.pathname.startsWith("/auth/")'));
  assert.ok(sw.includes("/offline.html"));
});
