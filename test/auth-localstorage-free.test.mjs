import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSrc = async (rel) => await fs.readFile(new URL(`../src/${rel}`, import.meta.url), "utf8");

// Контракт этапа 3 (RFC docs/COOKIES-RFC-E1.md §3.3, §5, DoD E3):
// клиент больше не хранит токены в localStorage — только HttpOnly куки
// (mb_at/mb_rt, ставит сервер) + in-memory Bearer для кросс-доменных вызовов.

const authProvider = await readSrc("components/auth/AuthProvider.tsx");
const apiClient = await readSrc("lib/api/client.ts");
const apiAuth = await readSrc("lib/api/auth.ts");
const session = await readSrc("lib/auth/session.ts");
const refreshRoute = await readSrc("app/api/auth/refresh/route.ts");
const proxyRoute = await readSrc("app/api/v1/[...path]/route.ts");

const TOKEN_KEY_NAMES = ["mb_access_token", "mb_refresh_token"];

test("client entry files contain no token keys at all (no reads, no writes, no storage)", () => {
  for (const [name, src] of [["AuthProvider.tsx", authProvider], ["client.ts", apiClient], ["auth.ts", apiAuth]]) {
    for (const key of TOKEN_KEY_NAMES) {
      assert.ok(!src.includes(key), `${name}: строка "${key}" не должна встречаться нигде`);
    }
  }
});

test("session module only removes legacy token keys and writes the transport flag", () => {
  // Ключи встречаются только как константы для удаления.
  assert.match(session, /LEGACY_ACCESS_KEY = "mb_access_token"/);
  assert.match(session, /LEGACY_REFRESH_KEY = "mb_refresh_token"/);
  assert.match(session, /store\.removeItem\(LEGACY_ACCESS_KEY\)/);
  assert.match(session, /store\.removeItem\(LEGACY_REFRESH_KEY\)/);
  // Ни getItem, ни setItem с legacy-ключами не существует.
  assert.doesNotMatch(session, /getItem\([^)]*LEGACY_/);
  assert.doesNotMatch(session, /setItem\([^)]*LEGACY_/);
  // Единственная запись в localStorage — флаг транспорта.
  assert.match(session, /TRANSPORT_FLAG_KEY = "mb_auth_transport"/);
  assert.match(session, /TRANSPORT_FLAG_VALUE = "cookie"/);
  assert.match(session, /store\.setItem\(TRANSPORT_FLAG_KEY, TRANSPORT_FLAG_VALUE\)/);
  const setItemCalls = session.match(/\.setItem\(/g) || [];
  assert.equal(setItemCalls.length, 1, "в session.ts единственная запись в localStorage — флаг транспорта");
});

test("AuthProvider bootstraps from cookies: legacy cleanup + me() + server refresh", () => {
  // Одноразовая чистка legacy-ключей при первом заходе новой версии.
  assert.match(authProvider, /clearLegacyTokenStorage\(\)/);
  // Сессию подтверждает лёгкий same-origin /auth/me по кукам; 401 → серверный refresh.
  assert.match(authProvider, /await me\(\)/);
  assert.match(authProvider, /refreshSession\(\)/);
  assert.match(authProvider, /markSessionAlive\(\)/);
  // Выход: серверный logout + локальная очистка.
  assert.match(authProvider, /logoutSession\(\)/);
  assert.match(authProvider, /clearTokens\(\)/);
});

test("login/register/Google-callback exchange tokens for cookies instead of localStorage", () => {
  assert.match(session, /AUTH_SESSION_URL = "\/api\/auth\/session"/);
  assert.match(session, /fetch\(AUTH_SESSION_URL/);
  // setSessionTokens теперь асинхронный обмен; ожидающие его вызовы — await.
  assert.doesNotMatch(authProvider, /^\s*setTokens\(/m);
  assert.match(authProvider, /await setTokens\(/);
});

test("same-origin API calls ride on cookies (credentials: same-origin), Bearer only from memory", () => {
  assert.match(apiClient, /credentials: "same-origin"/);
  // Токен берётся из модуля сессии (in-memory), а не из localStorage.
  assert.match(apiClient, /tokenOverride \?\? getAccessToken\(\)/);
  assert.ok(!/localStorage\s*[.[]/.test(apiClient), "client.ts не обращается к localStorage");
  // Обновление — серверный эндпоинт, не Supabase с клиента.
  assert.match(session, /AUTH_REFRESH_URL = "\/api\/auth\/refresh"/);
  assert.ok(!session.includes("/auth/v1/token"), "клиент больше не ходит в Supabase за refresh");
});

test("POST /api/auth/refresh returns {access_token} in a 200 JSON body", () => {
  assert.match(refreshRoute, /NextResponse\.json\(\s*\{\s*ok: true, access_token: outcome\.accessToken\s*\},\s*\{\s*status: 200/s);
});

test("/api/v1 proxy dual-read is intact (Authorization first, then mb_at cookie)", () => {
  assert.match(proxyRoute, /req\.headers\.get\("authorization"\)/);
  assert.match(proxyRoute, /req\.cookies\.get\("mb_at"\)/);
  const bearerFn = proxyRoute.match(/function bearer\(req: NextRequest\) \{[\s\S]*?\n\}/);
  assert.ok(bearerFn, "bearer() present");
  assert.ok(bearerFn[0].indexOf("authorization") < bearerFn[0].indexOf('cookies.get("mb_at")'), "Authorization checked before cookie");
});
