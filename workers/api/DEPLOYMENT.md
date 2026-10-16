# Cloudflare API deployment

The production Worker is built from `workers/api` on the `main` branch.

## Build checks

1. Install dependencies with npm.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Keep the deployment command in dry-run mode until runtime secrets are configured and smoke tests pass.

## Runtime configuration

Set values in Cloudflare Dashboard → Workers & Pages → `medbiohim-api` → Settings → Variables and Secrets. Never commit real values to Git.

Required for database-backed API routes:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Storage and optional integrations:
- `UPSTASH_BLOB_TOKEN` — Upstash Blob SDK token, used by authenticated `/api/v1/storage/upload`, `/api/v1/storage/signed-url`, and `/api/v1/storage/object` delete routes.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — rate limiting/cache.
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, or `SUPABASE_SECRET_KEY` — server-only key for the webhook confirmation RPC; never expose it to the browser.\n- `TELEGRAM_WEBHOOK_SECRET` — must exactly match the secret configured on the `medbiohim-telegram` Worker; required for `/api/v1/telegram/account-link/confirm`.\n- `TELEGRAM_BOT_USERNAME` — optional, defaults to `MEDBIOCHIM_bot`.
- `OPENAI_API_KEY` and optionally `OPENAI_MODEL` — AI chat integration.
- `CORS_ORIGINS` and `APP_ORIGIN` — public origin configuration (non-secret values may live in `wrangler.toml`).

## Upstash Blob routes

- `POST /api/v1/storage/upload`: authenticated multipart upload, form field `file`, maximum 12 MiB. Uploads are stored under `users/<authenticated-user-id>/...`; only JPEG, PNG, WebP, GIF, PDF, DOC/DOCX, and plain text are accepted.
- `GET /api/v1/storage/signed-url?key=...`: returns a signed read URL only for the authenticated user's own uploads or keys under `histology/`.
- `GET /api/v1/storage/object?key=...`: authenticated binary read for the same allowed key scope.
- `DELETE /api/v1/storage/object?key=...`: deletes only the authenticated user's own uploads. Shared `histology/` objects cannot be deleted through this endpoint.

Send the Supabase access token as `Authorization: Bearer <access-token>`. Configure `UPSTASH_BLOB_TOKEN` as a Cloudflare secret; do not put the token in frontend code, `wrangler.toml`, or Git history.

Production traffic must not be switched to a new implementation until the Worker build, deployment, and endpoint smoke tests pass.

## Deploy synchronization

- `Deploy MEDBIOHIM API to Cloudflare` publishes `workers/api`.
- `Deploy MEDBIOHIM Cloudflare migration Worker` publishes `integrations/cloudflare-api` as `medbiohim-api-shadow`.
- `Deploy MEDBIOHIM Telegram Worker` publishes `integrations/telegram-bot-cloudflare`.
- All three workflows require the GitHub Actions repository secret `CLOUDFLARE_API_TOKEN` and the Cloudflare account ID. The current account is `a7556b4deb0cc2bad2c6d6b1a7381601`. Use a least-privilege token that can edit Workers. Do not paste the token into chat, source files, or frontend environment variables.
- Telegram account linking also requires `TELEGRAM_WEBHOOK_SECRET` on the canonical API Worker to match the existing Telegram Worker secret. Cloudflare does not reveal the current secret value; copy the same value in the Dashboard secret editor.
- Before calling the migration complete, confirm that each Worker modified timestamp updates, health checks pass, and authenticated read-after-write smoke tests pass. A successful dry run is not a deploy.
