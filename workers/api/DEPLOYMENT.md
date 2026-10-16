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
- `SUPABASE_SERVICE_ROLE_KEY` — only if server-side admin operations require it.
- `OPENAI_API_KEY` and optionally `OPENAI_MODEL` — AI chat integration.
- `CORS_ORIGINS` and `APP_ORIGIN` — public origin configuration (non-secret values may live in `wrangler.toml`).

## Upstash Blob routes

- `POST /api/v1/storage/upload`: authenticated multipart upload, form field `file`, maximum 12 MiB. Uploads are stored under `users/<authenticated-user-id>/...`; only JPEG, PNG, WebP, GIF, PDF, DOC/DOCX, and plain text are accepted.
- `GET /api/v1/storage/signed-url?key=...`: returns a signed read URL only for the authenticated user's own uploads or keys under `histology/`.
- `DELETE /api/v1/storage/object?key=...`: deletes only the authenticated user's own uploads. Shared `histology/` objects cannot be deleted through this endpoint.

Send the Supabase access token as `Authorization: Bearer <access-token>`. Configure `UPSTASH_BLOB_TOKEN` as a Cloudflare secret; do not put the token in frontend code, `wrangler.toml`, or Git history.

Production traffic must not be switched to a new implementation until the Worker build, deployment, and endpoint smoke tests pass.
