# MEDBIOHIM Telegram bot — isolated MVP

This is an **optional, separately deployable** Node.js webhook. It does not modify the main website API and does not read Supabase or student data.

## Current functionality

- `/start`, `/help`, `/site`, `/schedule`, `/tests`, `/subjects`, `/materials`, `/privacy`.
- Only private-chat messages are handled; groups/channels are ignored.
- Replies contain public links to the official website.
- Webhook requests require Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- No bot token, account token, or database key is stored in source.

## Deploy separately

Create a separate Vercel project with Root Directory set to `integrations/telegram-bot`. Do not change the root directory of the existing MEDBIOHIM production project.

Set server-side environment variables in that separate project:

- `TELEGRAM_BOT_TOKEN` — token from BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — random secret consisting of Telegram-supported letters, digits, underscore or hyphen.
- `MEDBIOHIM_APP_URL` — optional; defaults to `https://medbiohim.vercel.app`.
- `TELEGRAM_BOT_USERNAME` — optional; used to ignore commands addressed to another bot.

After deployment, register the webhook using Telegram's `setWebhook` API with the deployed `/api/webhook` URL and the same `secret_token` value. Execute that request in a private terminal/password manager; never commit the bot token or paste it into GitHub issues.

## Local tests

```bash
npm test
```

## Explicit limitations

- No account linking, private schedule, grades, assignments, or personal notifications yet.
- No durable update-idempotency store is configured; current commands are read-only/public, but duplicate public replies may occur on webhook retries.
- Before private features are added, implement one-time account linking, expiry/replay protection, durable update idempotency, group/specialty authorization, consent/preferences, unlinking, and audit-safe logging.
- Do not add Supabase service-role credentials to the main frontend project for bot convenience. Any database integration must be narrowly scoped and separately reviewed.
