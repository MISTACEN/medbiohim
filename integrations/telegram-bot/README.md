# MEDBIOHIM Telegram bot — isolated MVP (DEPRECATED)

> ## ⛔ LEGACY — не использовать для новых развёртываний
>
> Канонический и единственный развиваемый бот — **`integrations/telegram-bot-cloudflare/`**
> (Cloudflare Worker `medbiohim-telegram`, деплой через `.github/workflows/deploy-telegram-worker.yml`).
>
> Этот Node/Vercel-MVP оставлен как исторический артефакт: в нём **нет** привязки аккаунта
> Telegram к MEDBIOHIM, которая уже работает в каноническом боте (одноразовая ссылка
> `/start link_<48 hex>` → `POST /api/v1/telegram/account-link/confirm`), и он не развивается.
>
> У бота может быть только один активный webhook: не регистрируйте на этот код webhook
> основного бота — иначе канонический бот перестанет получать обновления.
>
> Актуальная топология: `docs/WORKERS-TOPOLOGY.md`.

This is an **optional, separately deployable** Node.js webhook. It does not modify the main website API and does not read Supabase or student data.

## Current functionality

- `/start`, `/help`, `/app`, `/site`, `/schedule`, `/tests`, `/subjects`, `/materials`, `/homework`, `/privacy`.
- `/start` and `/app` return a Telegram Web App button opening the existing MEDBIOHIM site; **in this legacy webhook** that is only an entry point — account linking lives in the canonical Cloudflare bot, not here.
- Private-chat commands are handled by the Node webhook. Group/supergroup updates can be relayed to the existing PHP homework-ingestion endpoint when `TELEGRAM_HOMEWORK_WEBHOOK_URL` is configured; channels and other chat types are ignored.
- Replies contain public links to the MEDBIOHIM student-preparation platform.
- Webhook requests require Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- No bot token, account token, or database key is stored in source.

## Deploy separately

Create a separate Vercel project with Root Directory set to `integrations/telegram-bot`. Do not change the root directory of the existing MEDBIOHIM production project.

Set server-side environment variables in that separate project:

- `TELEGRAM_BOT_TOKEN` — token from BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — random secret consisting of Telegram-supported letters, digits, underscore or hyphen.
- `MEDBIOHIM_APP_URL` — optional; defaults to `https://medbiohim.vercel.app`.
- `TELEGRAM_BOT_USERNAME` — optional; used to ignore commands addressed to another bot.
- `TELEGRAM_HOMEWORK_WEBHOOK_URL` — optional HTTPS URL to the existing PHP endpoint, for example `https://YOUR-SPACEWEB-API/api/v1/telegram/webhook`. Set only after confirming the actual backend origin.

For homework relay, set `TELEGRAM_WEBHOOK_SECRET` to the same strong secret in both the Node/Vercel project and the PHP backend environment. Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USER_ID` on the PHP side as required by `TelegramHomeworkService`. The relay sends the original group update over HTTPS and does not expose the secret to the browser.

After deployment:

1. In BotFather, configure the Web App domain for the same HTTPS hostname as `MEDBIOHIM_APP_URL`.
2. Register exactly one webhook for this bot using Telegram's `setWebhook` API with the deployed Node `/api/webhook` URL and the same `secret_token` value. Do not register the same bot token directly to both Node and PHP; Telegram supports one active webhook per bot. When the optional relay is enabled, Node forwards group/supergroup updates to PHP.
3. Open the bot and test `/start` and `/app` on mobile Telegram. The Web App opens the current website; account linking and secure Telegram identity validation are a separate unfinished phase. Execute that request in a private terminal/password manager; never commit the bot token or paste it into GitHub issues.

## Local tests

```bash
npm test
```

## Explicit limitations

- No account linking, private schedule, grades, or personal notifications yet. The group relay is only an ingestion transport; end-to-end homework classification still requires valid PHP configuration, mapped Telegram chats, database schema and runtime tests.
- The Web App button only opens the existing site. It does not authenticate the student as a Telegram identity or silently create/link an account.
- No durable update-idempotency store is configured; current commands are read-only/public, but duplicate public replies may occur on webhook retries.
- Before private features are added, implement one-time account linking, expiry/replay protection, durable update idempotency, group/specialty authorization, consent/preferences, unlinking, and audit-safe logging.
- Do not add Supabase service-role credentials to the main frontend project for bot convenience. Any database integration must be narrowly scoped and separately reviewed.
