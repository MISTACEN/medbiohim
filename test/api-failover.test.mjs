import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const route = await fs.readFile(new URL("../src/app/api/v1/[...path]/route.ts", import.meta.url), "utf8");

test("Vercel production API proxy targets the canonical Cloudflare Worker", () => {
  assert.match(route, /DEFAULT_CLOUDFLARE_API_ORIGIN = "https:\/\/medbiohim-api\.ryazansevegor\.workers\.dev\/api\/v1"/);
  assert.match(route, /process\.env\.CLOUDFLARE_API_ORIGIN \|\| DEFAULT_CLOUDFLARE_API_ORIGIN/);
  assert.match(route, /x-medbiohim-proxy", "cloudflare-only"/);
  assert.doesNotMatch(route, /SPACEWEB_API_ORIGIN|SAFE_SPACEWEB_ORIGIN|spaceweb-fallback|api-shadow/);
});

test("Cloudflare API proxy returns a clear upstream failure without legacy fallback", () => {
  assert.match(route, /if \(!upstream\)/);
  assert.match(route, /Cloudflare API недоступен/);
  assert.match(route, /source = "cloudflare-unavailable"/);
});

test("Cloudflare proxy preserves caller request context and uses a bounded timeout", () => {
  // Таймаут прокси должен покрывать худший случай воркера: до 16 с на внешних
  // провайдеров ИИ и до 24 с на три прохода Workers AI. Зашитые 18 с обрывали
  // ответ до запасного пути, поэтому проверяем не число, а границы бюджета.
  const init = route.match(/const init = requestInit\(req, bodyBuffer, (\d+)\)/);
  assert.ok(init, "прокси обязан строить init через requestInit");
  const timeoutMs = Number(init[1]);
  assert.ok(timeoutMs >= 40000 && timeoutMs <= 55000, `таймаут прокси ${timeoutMs} мс не покрывает бюджет ИИ`);

  const maxDuration = route.match(/export const maxDuration = (\d+)/);
  assert.ok(maxDuration, "maxDuration должен быть задан явно");
  const seconds = Number(maxDuration[1]);
  assert.ok(seconds * 1000 >= timeoutMs, `maxDuration ${seconds} с меньше таймаута прокси ${timeoutMs} мс`);
  assert.ok(seconds <= 60, `maxDuration ${seconds} с выходит за лимит платформы`);

  // x-bootstrap-secret пробрасывается сознательно: одноразовый маршрут
  // миграций сам проверяет секрет на воркере.
  assert.match(route, /\["content-type", "authorization", "accept", "x-request-id", "x-bootstrap-secret"\]/);
});
