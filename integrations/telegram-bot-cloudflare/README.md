# MEDBIOHIM Telegram bot — Cloudflare Workers adapter

This is a separate Cloudflare Workers implementation of the existing public-command Telegram webhook. It does **not** replace the current `integrations/telegram-bot` Node/Vercel MVP and does not change the website, PHP API, Supabase, or production Telegram webhook automatically.

## Current scope

- `GET /health` — minimal health/configuration status, no secrets returned.
- `POST /api/webhook` — validates Telegram's `X-Telegram-Bot-Api-Secret-Token`, bounds request body size, and handles the existing public commands: `/start`, `/help`, `/app`, `/site`, `/schedule`, `/tests`, `/subjects`, `/materials`, `/privacy`.
- Private chat commands use Telegram `sendMessage`; group/supergroup updates can optionally relay to the existing PHP endpoint over HTTPS.
- Unknown updates and non-command private messages are ignored.
- No account linking, private schedule/grades, AI/OCR homework parsing, database writes, or persistent update-idempotency store is implemented here.

## Configuration

Do not put secrets in `wrangler.toml`, source files, browser extension code, issue comments, logs, or GitHub commits. If a bot token has been pasted into a chat, issue, or commit, treat it as compromised and revoke it with BotFather (`/revoke`) before testing; use the newly issued token only as a secret.

For local handler tests, a real Telegram token is not needed. Run `npm test`; tests use fake credentials and stub outbound requests. For an isolated live test, create a dedicated test bot with BotFather and use its token only in the local environment or Cloudflare Worker secret store.

From this directory, install Wrangler in your local development environment (or use an approved Cloudflare dashboard workflow), then configure secrets:

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Optional non-secret variables are in `wrangler.toml`. Configure them in the Cloudflare dashboard or via Wrangler vars:
- `MEDBIOHIM_APP_URL` — defaults to `https://medbiohim.vercel.app`.
- `TELEGRAM_BOT_USERNAME` — username without `@`, used to ignore commands addressed to another bot.
- `TELEGRAM_HOMEWORK_WEBHOOK_URL` — optional HTTPS endpoint for the current PHP homework relay. Only configure after confirming the real endpoint and matching secret on the PHP side.

## Test and deploy

```sh
npm test
npx wrangler deploy
```

First authenticate Wrangler with the intended Cloudflare account and inspect the deployment target. Do not run `wrangler deploy` until the preview/tests pass and the user explicitly approves production deployment.

After a test deployment:
1. Check `GET https://<worker-host>/health`.
2. In BotFather, register exactly one webhook for the bot using `https://<worker-host>/api/webhook` and the same secret via Telegram's `setWebhook` API.
3. Verify `/start`, `/help`, `/schedule`, wrong-secret rejection and group relay (only if configured).
4. Switch the existing bot webhook only after the Cloudflare endpoint has passed testing. Telegram permits one active webhook per bot token; switching means the prior Node/Vercel endpoint will stop receiving updates.
5. Keep the old endpoint and configuration documented for rollback, but never register the same token on both endpoints at once.

## Security and operational notes

- Worker secrets stay server-side. Never put bot token in `vars` or frontend code.
- The webhook checks a shared secret, limits request body size, uses HTTPS for relay, times out external requests, and does not log request payloads/chat IDs/secrets.
- `/health` reveals only whether required secrets exist, not their values.
- Group relay is off unless explicitly configured.
- This first pass has no durable idempotency ledger: Telegram retries after timeouts may cause a public reply or relay to be attempted more than once. Before private data or homework writes are enabled, implement durable update deduplication/idempotency in a suitable persistent store and test failure/retry behavior.
- Workers Free limits include 100,000 requests/day and a 10 ms CPU limit per invocation; network waits are not CPU time, but large synchronous processing is unsuitable. Check current Cloudflare pricing/limits before production use.
- This adapter has not yet been deployed to Cloudflare or connected to the production bot token.
