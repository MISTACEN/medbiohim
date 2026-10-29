// Полная привязка аккаунта: Google как второй способ входа и Telegram через бота.
// Тест держит контракт, который нельзя увидеть в UI-тестах: метод GoTrue,
// одноразовость токена, коды ответов и отсутствие обходов авторизации.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("Google-привязка: GET authorize, дефолтный возврат в /settings, честные коды", async () => {
  const settings = await source("../src/routes/settings.ts");
  const start = settings.indexOf("async function startIdentityLink");
  assert.ok(start > 0, "startIdentityLink существует");
  const block = settings.slice(start, settings.indexOf("async function unlinkIdentity"));

  assert.match(block, /identityAuthorizeUrl\(c\.env\.SUPABASE_URL, provider, redirectTo\)/);
  assert.match(block, /method: "GET"/);
  assert.doesNotMatch(block, /method: "POST"/, "POST отвечал 404 — привязка не начиналась");
  assert.doesNotMatch(block, /body: JSON\.stringify/, "у GET не должно быть JSON-тела");
  assert.doesNotMatch(block, /skip_http_redirect/, "параметры живут в identityAuthorizeUrl, а не дублируются в роуте");
  assert.match(block, /IDENTITY_LINK_DISABLED/);
  assert.match(block, /manual linking/);
  assert.match(block, /IDENTITY_ALREADY_LINKED/);
  assert.match(block, /status as 409/);
  assert.match(block, /resolveLinkRedirect\(input\.redirect_to\.trim\(\)/, "чужой redirect_to отвергается");
  assert.match(block, /defaultLinkRedirect\(fallbackOrigin\)/);

  const unlink = settings.slice(settings.indexOf("async function unlinkIdentity"));
  assert.match(unlink, /DELETE/);
  assert.match(unlink, /LAST_IDENTITY/);
  assert.match(unlink, /identities\.length <= 1/, "последний способ входа не отвязывается");
});

test("клиент Google: возврат проверяется по identities, отмена показывается текстом", async () => {
  const page = await source("../../../src/app/settings/page.tsx");
  assert.match(page, /oauthError/);
  assert.match(page, /error_description/);
  assert.match(page, /Привязка Google не завершена/);
  assert.match(page, /some\(\(item\) => item\.provider === "google"\)/);
  assert.match(page, /IDENTITY_ALREADY_LINKED/);
  assert.match(page, /\/auth\/callback\?linked=google/, "возврат идёт через разрешённый callback, а не произвольный query");

  const callback = await source("../../../src/app/auth/callback/page.tsx");
  assert.match(callback, /resolveLinkReturn\(currentUrl\.search\)/);
  assert.match(callback, /linkReturn\.target/);
  assert.match(callback, /linkReturn\.kind === "linked"/);
});

test("Telegram: одноразовая ссылка, автоподтверждение и честный таймер", async () => {
  const settings = await source("../src/routes/settings.ts");
  const link = settings.slice(settings.indexOf("async function startTelegramLink"), settings.indexOf("async function unlinkTelegramAccount"));
  assert.match(link, /requireAuth|startTelegramLink/);
  assert.match(link, /crypto\.getRandomValues\(new Uint8Array\(24\)\)/, "48 hex-символов энтропии");
  assert.match(link, /SHA-256/, "в БД уходит только хеш");
  assert.match(link, /create_my_telegram_link_token/);
  assert.match(link, /rate_limited/);
  assert.match(link, /expires_in_seconds: 600/);
  assert.doesNotMatch(link, /rawToken\b.*console\./, "сырой токен не логируется");

  const page = await source("../../../src/app/settings/page.tsx");
  assert.match(page, /telegramWait/);
  assert.match(page, /setInterval\(\(\) => \{ void tick\(\); \}, 3000\)/, "статус опрашивается сам");
  assert.match(page, /formatWait\(telegramWait\.expiresAt - clock\)/);
  assert.match(page, /Ссылка на привязку истекла/);
  assert.match(page, /href=\{telegramWait\.url\}/, "ссылка открывается кнопкой, а не блокируемым popup");
  assert.match(page, /Это не значит, что Telegram отвязан/);
  assert.match(page, /setTelegramStatusError\(describeApiError\(tg\.error\)\)/);
});

test("Telegram-бот подтверждает ссылку только своему боту и с секретом", async () => {
  const bot = await source("../../../integrations/telegram-bot-cloudflare/src/worker.js");
  assert.ok(bot.includes("link_([a-f0-9]{48})"), "48 hex в /start link_");
  assert.match(bot, /isAddressedToBot\(linkStart\[1\], env\)/);
  assert.match(bot, /confirmAccountLink\(env, message, linkStart\[2\]\.toLowerCase\(\)\)/);
  assert.match(bot, /TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL/);

  const route = await source("../src/routes/telegram.ts");
  assert.match(route, /x-telegram-bot-api-secret-token/);
  assert.match(route, /constantTimeEqual/);
  assert.match(route, /confirm_telegram_account_link/);
  assert.match(route, /p_token_hash: await sha256Hex\(token\)/);
  assert.match(route, /status as 410/, "использованная ссылка — 410");
  assert.match(route, /TELEGRAM_ALREADY_LINKED/);
  assert.match(route, /status as 409/);

  const wrangler = await source("../../../integrations/telegram-bot-cloudflare/wrangler.toml");
  assert.match(wrangler, /\/api\/v1\/telegram\/account-link\/confirm/);
});

test("миграция привязки: токен одноразовый, с TTL, лимитом и без доступа anon", async () => {
  const migration = await source("../../../database/migrations/20261017120000_telegram_account_linking_rpc.sql");
  assert.match(migration, /token_hash char\(64\) NOT NULL UNIQUE/);
  assert.match(migration, /consumed_at timestamptz/);
  assert.match(migration, /interval '10 minutes'/);
  assert.match(migration, /v_count>=5/, "не больше 5 ссылок за 15 минут");
  assert.match(migration, /REVOKE ALL ON TABLE public\.telegram_accounts FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /auth\.uid\(\)/);
});
