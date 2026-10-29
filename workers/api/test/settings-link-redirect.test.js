// Привязка второго способа входа: адрес возврата после OAuth.
// Живой баг: на dev-сервере localhost:3010 worker отвечал 400 «Недопустимый
// адрес возврата», хотя CORS-список знал только localhost:3000.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveLinkRedirect } from "../src/lib/link-redirect.ts";

const CORS = "https://medbiohim.vercel.app,http://localhost:3000";
const APP = "https://medbiohim.vercel.app";

test("разрешает любой localhost-порт для локальной разработки", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const url = `http://${host}:3010/settings?linked=1`;
    assert.equal(resolveLinkRedirect(url, CORS, APP), new URL(url).toString(), host);
  }
});

test("разрешает настроенный origin и канонический адрес приложения", () => {
  assert.equal(
    resolveLinkRedirect("https://medbiohim.vercel.app/settings?linked=1", CORS, APP),
    "https://medbiohim.vercel.app/settings?linked=1",
  );
  assert.equal(
    resolveLinkRedirect("http://localhost:3000/settings?linked=1", CORS, APP),
    "http://localhost:3000/settings?linked=1",
  );
});

test("отклоняет чужой origin, http вне localhost и мусор", () => {
  for (const url of [
    "https://evil.example/settings",
    "https://medbiohim.vercel.app.evil.example/settings",
    "http://example.com/settings",
    "javascript:alert(1)",
    "not a url",
  ]) {
    assert.equal(resolveLinkRedirect(url, CORS, APP), null, url);
  }
});

test("роут использует проверку и честно сообщает о выключенной привязке", async () => {
  const route = await readFile(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
  assert.match(route, /resolveLinkRedirect\(input\.redirect_to\.trim\(\), c\.env\.CORS_ORIGINS/);
  assert.match(route, /IDENTITY_LINK_DISABLED/);
  assert.match(route, /manual linking/);
});
