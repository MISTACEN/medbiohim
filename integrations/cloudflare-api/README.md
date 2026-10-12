# MEDBIOHIM Cloudflare API migration scaffold

## Status: shadow-only, not production

The existing PHP API on SpaceWeb remains the current backend. This Worker is an isolated scaffold for a gradual migration; it is not deployed or wired into the frontend by this change.

- Worker name: `medbiohim-api-shadow`
- Runtime: Cloudflare Workers JavaScript modules
- Contract-matched public PHP routes in the shadow Worker: `GET /api/v1` and `GET /api/v1/ping`; `POST /api/v1/auth/logout` is now implemented against Supabase Auth.
- `GET /health` and `GET /api/v1/health` are shadow diagnostics, not yet contract-compatible ports of the PHP `HealthChecker`.
- Unmigrated `/api/v1/*` routes return `501 ROUTE_NOT_MIGRATED`
- No proxy/fallback to SpaceWeb is implemented. This is intentional because the currently checked SpaceWeb HTTPS endpoint fails certificate verification and redirects to HTTP.
- No secrets, service-role keys, database credentials, or user tokens belong in this directory or in `wrangler.toml`.

## Migration progress — Pass 1

- `GET /api/v1` and `GET /api/v1/ping` mirror the current PHP success-envelope fields and are covered by contract tests.
- The ping clock is emitted as an ISO-8601 UTC timestamp; the `env` value deliberately identifies the shadow environment.
- These routes have not been deployed and are not receiving application traffic. No frontend API base URL or production route was changed.

## Authentication groundwork — Pass 2

- Added a shared Supabase Auth validator for future protected routes. It accepts Bearer tokens only from the Authorization header, calls `/auth/v1/user` over HTTPS with the anon key, applies a timeout, blocks redirects, and returns only the verified user ID/email.
- The helper does not trust `user_id` sent by a client and does not treat `user_metadata` as authorization. It is not connected to any route yet; route-by-route policy parity is required before use.
- Do not configure a Supabase service-role key in the Worker for this helper. Runtime credentials are not stored in source or `wrangler.toml`.

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

## Route inventory

See [`docs/CLOUDFLARE-API-ROUTE-INVENTORY-2026-10-12.md`](../../docs/CLOUDFLARE-API-ROUTE-INVENTORY-2026-10-12.md) for route families, risk ordering, per-route worksheet, and cutover gates. This is a family-level inventory; exact methods, handlers, and contracts must be confirmed route-by-route before implementation.


## Auth route migration — Pass 3

- Added `POST /api/v1/auth/logout`, using the caller's Bearer access token and Supabase Auth `/auth/v1/logout` over HTTPS.
- Requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Cloudflare Worker secrets/vars; fails closed if missing, rejects non-HTTPS URLs and redirects, applies a timeout, and does not use the service-role key.
- Regression tests cover missing bearer token, wrong method, missing config, upstream status handling and secret-safe errors. The route has not been deployed; configure bindings only in the Cloudflare dashboard when staging deployment is approved.

## Auth route migration — Pass 4

- Added `POST /api/v1/auth/refresh`, exchanging the supplied `refresh_token` through Supabase Auth over HTTPS.
- The route requires JSON, limits the body to 16 KiB, rejects missing/oversized refresh tokens, refuses non-HTTPS origins and redirects, and fails closed when configuration is absent.
- Session response fields follow the PHP `SupabaseAuth::normalizeSession()` contract; role comes only from server-controlled `app_metadata`, never `user_metadata`.
- Added helper and route regression tests. The newest test suite still needs a successful Node/GitHub Actions run; no Worker deployment has occurred.

## Auth route migration — Pass 5

- Added `POST /api/v1/auth/recover` using Supabase Auth recovery over HTTPS.
- Uses a fixed callback path, `/auth/callback`, on the configured HTTPS app origin; callers cannot supply an arbitrary redirect URL.
- Normalizes Supabase 4xx responses to `{ sent: true }` to avoid exposing whether an email exists. Upstream throttling remains a 429; network/5xx failures are generic.
- Request JSON is bounded to 16 KiB. Supabase's built-in recovery throttling is relied on for now; configure a Cloudflare rate-limiting binding before production deployment for an additional edge limit.
- Tests are authored but require a successful Node/GitHub Actions run. The Worker remains undeployed.

## Auth route migration — Pass 6 (partial login)

- Added a Supabase password-login helper and `POST /api/v1/auth/login` route in Worker source.
- The route **fails closed with 503** unless a Cloudflare Rate Limiting binding named `AUTH_LOGIN_LIMITER` exists. This is deliberate: an in-memory per-isolate counter is not an adequate production control.
- When configured, the route limits attempts by Cloudflare's `cf-connecting-ip`, validates bounded JSON, exchanges credentials over HTTPS, and normalizes invalid credentials to a generic 401.
- **Not contract-complete:** the PHP handler also attempts DB-backed profile synchronization and returns `profile` and `roles` when available. This Worker pass does not yet implement that database/RLS behavior. Do not route production login traffic here until profile/role parity is migrated and tested.
- Added unit and route tests for login normalization, invalid credentials, upstream failures, and the required limiter. The suite has not yet been confirmed by a successful Node/GitHub Actions run.

## Auth route migration — Pass 7 (partial registration)

- Added `POST /api/v1/auth/register` and a Supabase signup helper with email/name/password validation, bounded request bodies, HTTPS-only upstream, generic signup errors and `needs_email_confirm` handling.
- The route fails closed with 503 unless Cloudflare Rate Limiting binding `AUTH_REGISTER_LIMITER` is configured.
- **Not contract-complete:** the PHP handler attempts DB-backed profile creation and default student-role assignment after Supabase signup. The Worker does not yet do that. Do not switch registration traffic until profile creation, default role assignment, RLS and email-confirmation behavior are migrated and tested.
- Unit and route tests are authored; full execution remains unverified until CI or a reproducible local run succeeds.

## Auth route migration — Pass 8 (read-only profile bundle)

- Added `GET /api/v1/auth/me` using Supabase Auth to validate the caller's bearer token, then querying `users`, `user_roles` and active `group_memberships` with the caller JWT plus the public anon key.
- The helper does not use a service-role key. Each REST query remains subject to Supabase grants/RLS, filters by the authenticated user ID, and falls back to a minimal identity bundle if optional profile queries are unavailable.
- Response shape mirrors the PHP `UserRepository::profileBundle()` keys: `user`, `roles`, `groups`, `current_group`, `course`, `semester`.
- Added helper and route tests for own-user filtering, role/group normalization, missing token and method handling. Full execution remains unverified until a CI/local run succeeds.
- Follow-up: validate actual live RLS behavior and embedded PostgREST relationship names before production cutover. Existing PHP login/register still performs DB-backed profile creation/default student-role assignment; that write path remains intentionally blocked until its safe strategy is migrated.

## API route migration — Pass 10 (authenticated search)

- Added `GET /api/v1/search` with `q`/ `query`, `limit`, `subject_slug`, `subject_id`, and `type` filters.
- Search validates the Supabase bearer token, then uses the caller's JWT and anon key for REST queries. It does not use a service-role key and does not proxy to SpaceWeb.
- Supports published questions, exam questions, trainer cards, subjects, and optional subject-plan content. Results include snippets, scoring, answer availability, and facets to match the PHP `SearchService` response shape.
- Search returns a generic 503 if required Supabase reads are denied or unavailable; plan content is optional. Live RLS/table/column compatibility still needs staging verification.
- Tests have been added but are not yet confirmed by a successful full Node/GitHub Actions run.

## API route migration — Pass 11

- Added the PHP-compatible `GET /api/v1/me` alias, routed through the same bearer-authenticated profile bundle as `GET /api/v1/auth/me`.
- Added a regression test proving the alias does not bypass authentication.
- This is a compatibility alias only; live RLS and profile relationship behavior still need staging verification.

## API route migration — Pass 12

- Added authenticated `GET /api/v1/subjects/{id}` using the caller's Supabase JWT and public anon key; no service-role key or SpaceWeb proxy is used.
- Queries `subjects` and `modules` under the caller's grants/RLS. It supports both known module ordering columns (`sort_order` and `order_index`) because the PHP repository and REST fallback currently differ.
- Missing subjects return 404; denied/unavailable reads return a generic 503. The helper and route regression tests are authored; full execution and actual Supabase RLS/table compatibility still need confirmation.

## API route migration — Pass 13 (authenticated subject catalog)

- Added `GET /api/v1/subjects?course=&semester=` using the caller's verified Supabase Bearer token and public anon key; no service-role key is used.
- The Worker reads active group memberships first and filters specialty-scoped subjects against group `specialty_slug`; `histology` is included for MBH groups to match the PHP `SpecialtyAccess` rule. General subjects without a specialty remain visible.
- Course and semester filters are validated and bounded to the schema's expected ranges. If membership/RLS checks fail, the route returns a generic 503 instead of falling back to an unrestricted catalog.
- Added route auth/method tests and helper tests for specialty filtering, filter validation, caller-JWT forwarding, and fail-closed membership errors.
- **Not yet accepted for cutover:** GitHub Actions has been triggering but the latest runs are failing with job metadata showing no steps and no downloadable logs. A real successful Node test run is still required. Live RLS relationship behavior must also be verified before switching frontend traffic.
