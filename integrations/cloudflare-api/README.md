# MEDBIOHIM Cloudflare API migration scaffold

## Status: shadow-only, not production

The existing PHP API on SpaceWeb remains the current backend. This Worker is an isolated scaffold for a gradual migration; it is not deployed or wired into the frontend by this change.

- Worker name: `medbiohim-api-shadow`
- Runtime: Cloudflare Workers JavaScript modules
- Current implemented route: `GET /health` and `GET /api/v1/health`
- Unmigrated `/api/v1/*` routes return `501 ROUTE_NOT_MIGRATED`
- No proxy/fallback to SpaceWeb is implemented. This is intentional because the currently checked SpaceWeb HTTPS endpoint fails certificate verification and redirects to HTTP.
- No secrets, service-role keys, database credentials, or user tokens belong in this directory or in `wrangler.toml`.

## Local checks

Use Node.js 20 or later:

```sh
npm test
npx wrangler dev
```

Do not deploy this Worker as the production API or change the frontend API base URL yet.

## Migration contract

Each route should be migrated one at a time, preserving:
1. HTTP method, path, request/response JSON shape and status semantics.
2. Authentication: validate Supabase access tokens server-side; never trust a client-supplied user ID or role.
3. Authorization: enforce ownership and role checks on every protected operation.
4. Input validation, bounded request sizes, timeouts, and consistent error responses.
5. SQL/RLS expectations and transactional behavior where applicable.
6. Private file access and signed URL behavior without exposing service credentials.
7. Regression tests against documented PHP behavior before any frontend routing switch.

Prefer direct, narrowly scoped Supabase access from the Worker using a dedicated server-side secret only where required, or use the user's JWT when RLS should enforce access. Never put Supabase service-role credentials in browser code.

## Planned migration waves

1. Inventory and freeze the API contract; classify routes as public, authenticated, admin-only, file/media, or webhook.
2. Establish automated tests and fixture-based contract comparisons.
3. Migrate low-risk read-only/public routes first.
4. Migrate authenticated reads with JWT verification and RLS/ownership checks.
5. Migrate writes only after idempotency, authorization, validation, and transaction semantics are tested.
6. Migrate webhooks and file operations separately; validate secrets and replay protection.
7. Switch frontend traffic gradually only after HTTPS, CI, and end-to-end checks are green. Keep PHP rollback available until a stability window is complete.

## Deployment gate

Before connecting production deployment to GitHub:
- GitHub Actions must actually allocate a runner and execute test steps.
- `npm test` and static checks must pass.
- Cloudflare account, Worker name, secrets, routes, and environments must be reviewed.
- Production routing and rollback must be explicit.
- No authenticated requests may be sent to an HTTP origin or use disabled TLS verification.
