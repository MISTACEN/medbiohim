# Cloudflare Workers + GitHub deployment for MEDBIOHIM Telegram

## Target

- Repository: `MISTACEN/medbiohim`
- Production branch: `main`
- Worker directory: `integrations/telegram-bot-cloudflare`
- Wrangler target: `medbiohim-telegram` (the existing production Worker)
- Worker source: `src/worker.js`

## Before enabling automatic deploys

1. Confirm the `Telegram Worker checks` GitHub Actions run is green. It runs `npm test` under the Worker directory.
2. Confirm the existing production Worker is named exactly `medbiohim-telegram` and has its current `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` secrets. Never put either secret in Git.
3. Confirm the PHP API is reachable through HTTPS. The user-provided health URL currently uses HTTP; Cloudflare Worker-to-API relays must use HTTPS. Do not configure the HTTP URL as the relay.
4. Only after HTTPS is verified, configure the Worker variables:
   - `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL=https://<verified-api-origin>/api/v1/telegram/account-link/confirm`
   - `TELEGRAM_HOMEWORK_WEBHOOK_URL=https://<verified-api-origin>/api/v1/telegram/webhook` (only when the existing homework relay is ready)
   Do not guess `<verified-api-origin>`; check the deployed PHP routing and document root first.
5. Apply the reviewed Supabase migration `database/migrations/20261011120000_telegram_account_linking.sql` before testing account linking.

## Cloudflare dashboard setup

1. Open **Workers & Pages → medbiohim-telegram → Settings → Builds** (the exact label may vary by dashboard version).
2. Connect the GitHub account and select `MISTACEN/medbiohim`.
3. Select branch `main`.
4. Set the project/root directory to `integrations/telegram-bot-cloudflare`.
5. Build/test command: `npm test`.
6. Deploy command: `npx wrangler deploy`.
7. Keep `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` as Worker secrets. Keep all secrets out of repository files and build logs.
8. Check the first build log and verify the deployed script URL/Worker name before relying on the new build.

## Important behavior

Connecting GitHub can cause each commit to `main` to deploy the Worker. The current Wrangler name was aligned with the existing production Worker to avoid creating a second Worker. Do not enable automatic production deploys until the test workflow passes and the Cloudflare build configuration is reviewed.

## Current limitations

- Source contains account linking, onboarding buttons, and a native Telegram command menu registration on `/start` and `/help`.
- Telegram-only website login is not yet implemented as a verified session exchange. Do not treat the old Supabase `custom:telegram` OAuth URL as functional unless a real, tested OIDC provider is configured.
- The API health URL supplied for SpaceWeb is HTTP and has not been verified as HTTPS in this session. The Worker relay cannot use plain HTTP.
