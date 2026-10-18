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
  assert.match(route, /const init = requestInit\(req, bodyBuffer, 18000\)/);
  assert.match(route, /\["content-type", "authorization", "accept", "x-request-id"\]/);
  assert.match(route, /export const maxDuration = 30/);
});
