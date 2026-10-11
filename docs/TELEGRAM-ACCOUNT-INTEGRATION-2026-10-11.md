# Telegram account integration — implementation checkpoint (2026-10-11)

## Implemented in source on `main`

- Added `database/migrations/20261011120000_telegram_account_linking.sql` with server-only tables for Telegram identities and short-lived one-time link tokens. Raw tokens are not stored; browser roles have no direct table privileges.
- Added authenticated PHP endpoints:
  - `POST /api/v1/settings/telegram/link-start` — creates a 10-minute link token and returns a deep link to `@MEDBIOCHIM_bot`.
  - `GET /api/v1/settings/telegram/status` — reports link status for the currently authenticated MEDBIOHIM user.
  - `POST /api/v1/settings/telegram/unlink` — removes the current user's Telegram link.
- Added `POST /api/v1/telegram/account-link/confirm`. It checks the existing server-side Telegram webhook secret, validates the token and Telegram ID, locks and consumes the token transactionally, and refuses to transfer an already-linked Telegram identity between accounts.
- Updated Cloudflare Worker to recognize private-chat `/start link_<token>`, relay confirmation over HTTPS to the PHP API, and give the user a confirmation message.
- Added Telegram link/unlink/status controls in Settings and client API methods.
- Token is 48 hexadecimal characters so the complete Telegram `start` parameter remains within Telegram's deep-link length limit.

## Not yet production-ready / required next steps

1. **Apply the SQL migration to the actual Supabase project** after reviewing it and confirming a backup. The new endpoints will return an error until the tables exist.
2. Identify and confirm the real public SpaceWeb PHP API origin. Do not guess the host.
3. Set the Cloudflare Worker variable `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL` to that origin plus `/api/v1/telegram/account-link/confirm`. The PHP environment must have the same `TELEGRAM_WEBHOOK_SECRET` value as the Worker. Never commit or share the secret.
4. Deploy the updated Worker source and PHP API through the normal verified deployment process.
5. Run Worker tests, PHP syntax/regression tests and end-to-end tests: valid link, expired/replayed token, another user's token, already-linked Telegram ID, unlink, and account status refresh.
6. GitHub Actions has previously failed before executing steps because runner provisioning was unavailable/unverified. Do not report tests as passed until they actually execute.

## Authentication scope

This checkpoint implements **linking an existing signed-in MEDBIOHIM account to Telegram**, not yet passwordless login using Telegram alone. The existing website session is a Supabase Auth session; a Telegram identity record by itself must not be treated as a valid site session. The next authentication pass must design and test a secure one-time login exchange that issues a real supported Supabase session (or a deliberately reviewed alternative compatible with the current AuthProvider). Do not enable a fake `custom:telegram` OAuth button or trust browser-supplied Telegram IDs.

## Deployment status

Source changes are committed to `main`; database migration application, SpaceWeb API origin, Worker relay variable, deployment, and end-to-end verification are still pending. Therefore the feature must be considered **implemented in source, not yet live/verified**.


## Telegram onboarding/menu and Cloudflare GitHub CI — 2026-10-11
- Worker onboarding now directs new users to sign in/register on the site, then open Settings → Telegram; private account data is not shown before linking.
- `/start` and `/help` register the Telegram native command menu with `setMyCommands` and show inline buttons for the site, login/registration, and linking settings.
- Added `.github/workflows/telegram-worker-checks.yml` to run `npm test` under `integrations/telegram-bot-cloudflare` on relevant pushes/PRs. The run result must be inspected before claiming tests pass.
- Wrangler target aligned to existing Worker name `medbiohim-telegram` to avoid creating a second Worker when GitHub auto-deploy is enabled.
- Deployment guide: `docs/CLOUDFLARE-GITHUB-TELEGRAM-DEPLOYMENT.md`.
- The user-provided PHP health URL is HTTP. Cloudflare Worker relays require HTTPS, and the HTTPS endpoint has not yet been confirmed reachable. Do not set a plain-HTTP relay variable.
- Telegram-only website login is NOT implemented/verified yet. The former `custom:telegram` Supabase OAuth link was removed from the login page because it is not a real login flow without a configured, verified OIDC provider. Existing Google/email login remains; after signing in, Telegram linking is the supported current flow.
