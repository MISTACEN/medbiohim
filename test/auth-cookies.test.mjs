import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSrc = async (rel) => await fs.readFile(new URL(`../src/${rel}`, import.meta.url), "utf8");

const sessionRoute = await readSrc("app/api/auth/session/route.ts");
const refreshRoute = await readSrc("app/api/auth/refresh/route.ts");
const logoutRoute = await readSrc("app/api/auth/logout/route.ts");
const authCookies = await readSrc("app/api/auth/_auth-cookies.ts");
const proxyRoute = await readSrc("app/api/v1/[...path]/route.ts");

test("cookie auth endpoints exist as route handlers with force-dynamic nodejs runtime", () => {
  for (const [name, src] of [["session", sessionRoute], ["refresh", refreshRoute], ["logout", logoutRoute]]) {
    assert.match(src, /export const dynamic = "force-dynamic"/, `${name}: force-dynamic`);
    assert.match(src, /export const runtime = "nodejs"/, `${name}: nodejs runtime`);
    assert.match(src, /export async function POST/, `${name}: POST handler`);
  }
});

test("auth cookies are HttpOnly, Secure, SameSite=Lax with correct paths", () => {
  assert.match(authCookies, /ACCESS_COOKIE = "mb_at"/);
  assert.match(authCookies, /REFRESH_COOKIE = "mb_rt"/);
  assert.match(authCookies, /ACCESS_COOKIE_PATH = "\/"/);
  assert.match(authCookies, /REFRESH_COOKIE_PATH = "\/api\/auth"/);
  const optionsBlock = authCookies.match(/COOKIE_OPTIONS_BASE = \{[\s\S]*?\};/);
  assert.ok(optionsBlock, "shared cookie options block present");
  assert.match(optionsBlock[0], /httpOnly: true/);
  assert.match(optionsBlock[0], /secure: true/);
  assert.match(optionsBlock[0], /sameSite: "lax"/);
  // Both setters share the options and only vary path/maxAge.
  assert.match(authCookies, /setAuthCookies[\s\S]*path: ACCESS_COOKIE_PATH[\s\S]*maxAge: accessTtl/);
  assert.match(authCookies, /path: REFRESH_COOKIE_PATH[\s\S]*maxAge: REFRESH_TTL_SECONDS/);
});

test("refresh cookie TTL defaults to ~30 days, access TTL defaults to ~1h from expires_in", () => {
  assert.match(authCookies, /REFRESH_TTL_SECONDS = 30 \* 24 \* 60 \* 60/);
  assert.match(authCookies, /DEFAULT_ACCESS_TTL_SECONDS = 3600/);
  assert.match(authCookies, /normalizeAccessTtl/);
  assert.match(sessionRoute, /normalizeAccessTtl\(payload\.expires_in\)/);
  assert.match(refreshRoute, /normalizeAccessTtl\(data\.expires_in\)/);
});

test("auth responses never cached (Cache-Control: no-store)", () => {
  for (const [name, src] of [["session", sessionRoute], ["refresh", refreshRoute], ["logout", logoutRoute]]) {
    assert.match(src, /"Cache-Control": "no-store"/, `${name}: no-store`);
  }
  for (const src of [sessionRoute, refreshRoute, logoutRoute]) {
    assert.match(src, /status: 204/);
  }
});

test("session endpoint validates both tokens (non-empty strings <= 4096) with 422", () => {
  assert.match(authCookies, /MAX_TOKEN_LENGTH = 4096/);
  assert.match(authCookies, /value\.length <= MAX_TOKEN_LENGTH/);
  assert.match(sessionRoute, /!isNonEmptyToken\(accessToken\) \|\| !isNonEmptyToken\(refreshToken\)/);
  assert.match(sessionRoute, /422/);
  assert.doesNotMatch(sessionRoute, /\b401\b/);
});

test("refresh endpoint reads mb_rt cookie and rotates both cookies atomically", () => {
  assert.match(refreshRoute, /req\.cookies\.get\(REFRESH_COOKIE\)/);
  assert.match(refreshRoute, /grant_type.*refresh_token|refresh_token.*grant_type/s);
  assert.match(refreshRoute, /\/auth\/v1\/token/);
  assert.match(refreshRoute, /SUPABASE_ANON_KEY/);
  assert.match(refreshRoute, /setAuthCookies\(res, outcome\.accessToken, outcome\.refreshToken/);
  assert.match(refreshRoute, /clearAuthCookies/);
  assert.match(refreshRoute, /status: 401/);
  assert.match(refreshRoute, /422/);
});

test("refresh endpoint uses single-flight per refresh token (shared promise Map)", () => {
  assert.match(refreshRoute, /new Map<string, Promise<RefreshOutcome>>\(\)/);
  assert.match(refreshRoute, /inFlightRefreshes\.get\(refreshToken\)/);
  assert.match(refreshRoute, /inFlightRefreshes\.set\(refreshToken, promise\)/);
  assert.match(refreshRoute, /\.finally\(\(\) => \{[\s\S]*inFlightRefreshes\.delete\(refreshToken\)/);
});

test("logout endpoint revokes via Supabase with Bearer from mb_at and clears cookies unconditionally", () => {
  assert.match(logoutRoute, /req\.cookies\.get\(REFRESH_COOKIE\)/);
  assert.match(logoutRoute, /req\.cookies\.get\(ACCESS_COOKIE\)/);
  assert.match(logoutRoute, /\/auth\/v1\/logout/);
  assert.match(logoutRoute, /Bearer \$\{accessToken\}/);
  assert.match(logoutRoute, /clearAuthCookies\(new NextResponse\(null, \{ status: 204/);
  assert.match(logoutRoute, /422/);
});

test("CSRF defense-in-depth: Sec-Fetch-Site and Origin host checks on all auth endpoints", () => {
  assert.match(authCookies, /sec-fetch-site/);
  assert.match(authCookies, /secFetchSite !== "same-origin"/);
  assert.match(authCookies, /new URL\(origin\)\.host !== new URL\(req\.url\)\.host/);
  for (const [name, src] of [["session", sessionRoute], ["refresh", refreshRoute], ["logout", logoutRoute]]) {
    assert.match(src, /if \(csrfRejected\(req\)\)/, `${name}: CSRF gate`);
    assert.match(src, /CSRF_REJECTED/, `${name}: CSRF_REJECTED code`);
    assert.match(src, /403/, `${name}: 403 on CSRF rejection`);
  }
});

test("API proxy dual-reads bearer token: Authorization header OR mb_at cookie", () => {
  assert.match(proxyRoute, /req\.headers\.get\("authorization"\)/);
  assert.match(proxyRoute, /req\.cookies\.get\("mb_at"\)/);
  // Header still takes precedence over the cookie.
  const bearerFn = proxyRoute.match(/function bearer\(req: NextRequest\) \{[\s\S]*?\n\}/);
  assert.ok(bearerFn, "bearer() present");
  assert.ok(bearerFn[0].indexOf("authorization") < bearerFn[0].indexOf('cookies.get("mb_at")'), "Authorization checked before cookie");
});
