# MEDBIOHIM Cloudflare API migration scaffold

## Status: deployed shadow Worker; not production

The existing PHP API on SpaceWeb remains the current backend. The Worker is deployed in isolation for gradual migration and is not wired into the frontend or production custom domain.

### Current verification gate — 2026-10-13 (supersedes older pass notes below)

- Full Worker unit suite: **124/124 passing** in the current local test run.
- The active shadow Worker includes all six source modules, the safe Supabase Auth diagnostics, the request-body reader fix, and the fail-closed test-attempt write gate.
- **Login and registration are intentionally disabled** unless `AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED="true"`. A live probe of 18 sequential synthetic login attempts did not produce HTTP 429, so the configured native limiter cannot yet be considered verified. The committed Wrangler default is `"false"`; do not change it until enforcement is reproducibly demonstrated.
- Shadow health returns HTTP 200. Login and registration currently return HTTP 503 `RATE_LIMIT_ENFORCEMENT_UNVERIFIED`; test-attempt start/save/finish return HTTP 503 `TEST_ATTEMPT_SECURITY_NOT_READY`.
- The Vercel homepage returns HTTP 200, but production `/api/v1/health` returns HTTP 503 `INSECURE_BACKEND_ORIGIN` because the legacy SpaceWeb API origin is HTTP. Production has **not** been switched to this incomplete Worker.
- Cloudflare Workers Builds is connected to GitHub `main` at `integrations/cloudflare-api`; recent builds completed successfully. The Vercel connector currently cannot access the known project scope, so no production environment variables have been changed.


- Worker name: `medbiohim-api-shadow`
- Runtime: Cloudflare Workers JavaScript modules
- Implemented shadow routes include `GET /api/v1`, `GET /api/v1/ping`, dashboard/schedule/homework/test catalogs, subject catalog/detail, search and profile. Auth handlers exist but login/registration are currently disabled by the explicit rate-limit verification gate; see the current verification block above.
- `GET /health` and `GET /api/v1/health` are shadow diagnostics, not yet contract-compatible ports of the PHP `HealthChecker`.
- Unmigrated `/api/v1/*` routes return `501 ROUTE_NOT_MIGRATED`
- The Worker itself does not proxy/fallback to SpaceWeb. A separate, opt-in Vercel same-origin proxy mode (`MEDBIOHIM_CF_FIRST=true`) can try this Worker first and use SpaceWeb only for explicitly safe fallback cases. It is disabled unless configured and requires an HTTPS `SPACEWEB_API_ORIGIN`; generic failed writes are not retried.
- The active Worker bundle has been verified to include all six expected source modules. Keep production routing disabled until live RLS/contract parity, write gates, rate-limit enforcement, and Vercel configuration access are resolved.
- No secrets, service-role keys, database credentials, or user tokens belong in this directory or in `wrangler.toml`.

## Migration progress — Pass 1

- `GET /api/v1` and `GET /api/v1/ping` mirror the current PHP success-envelope fields and are covered by contract tests.
- The ping clock is emitted as an ISO-8601 UTC timestamp; the `env` value deliberately identifies the shadow environment.
- The Worker has been smoke-tested externally but is not receiving production application traffic. No frontend API base URL or production route was changed.

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


## Deployment record — 2026-10-12

- Deployed the current Worker source to the isolated Cloudflare Worker `medbiohim-api-shadow` in the account's `workers.dev` namespace. This is a shadow/staging deployment; no production custom domain or frontend cutover was configured.
- Worker deployment ID: `58191d671d7c4717a563af08726d1812`; entry point `index.js`; module upload included `src/index.js` and `src/supabase-auth.js`.
- Configured Worker secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the connected Supabase project. The service-role key is not configured or used.
- Health and API routes were deployed, but an external HTTP smoke test could not be completed from the connected tool runtime because outbound requests to the `workers.dev` host were blocked by that runtime. Treat endpoint reachability and live authenticated Supabase reads as **not yet verified**.
- Login and registration remain fail-closed unless real Cloudflare rate-limiting bindings are configured. This is intentional, not a deployment failure.
- Do not switch production traffic until smoke tests, Node tests, RLS relationship checks, and the remaining PHP route migration are verified.


## Full dashboard and schedule migration — Pass 14

- Added authenticated read routes for the dashboard aggregate, schedule range, group homeworks, and published test catalog. Reads use the caller JWT and Supabase anon key; RLS remains in force.
- Schedule queries are restricted to active memberships and selected date ranges; a requested group outside the user's memberships returns 403.
- Homework completion and submission status are fetched only for the current user. Published test catalog excludes archived/unpublished rows and does not expose answer keys or attempts.
- Dashboard returns an explicit degraded-source list when any underlying RLS-protected data source is unavailable; site settings and announcements now read from `site_content` under the caller JWT.
- Deployed these routes to the isolated shadow Worker. External HTTP smoke testing is still blocked from the current tool runtime; GitHub Actions execution and live authenticated responses are not yet confirmed.
- Next: verify route tests and live RLS/PostgREST query behavior; then migrate CMS announcements/site data, schedule writes and attendance, homework create/update/submission/attachments, and the remaining PHP routes in contract-tested passes.


## Schedule metadata + CMS follow-up — Pass 15

- Added `GET /api/v1/schedule/meta?course=&semester=` backed by `academic_calendar_periods` and `subject_schedule_rules`.
- Dashboard now requests `site_content` keys `site` and `announcements` through the caller JWT. Existing RLS may return unavailable for users who do not satisfy the database's student policy; the dashboard surfaces this as degraded rather than bypassing RLS.
- Schedule reads select the latest active schedule version per group/semester and preserve PHP's explicit group selection rule when a student belongs to multiple groups.
- Deployed as Worker deployment `5d9195d3f9494e3997541699795269d9`; external HTTP smoke tests and Actions remain unverified.


## Published question bank — Pass 16

- Added `GET /api/v1/questions` with subject/slug/kind/type/topic/text filters, bounded pagination, and optional full answers. By default, long answers are returned as a short preview; the caller must explicitly request `include_answer=true` to receive the full answer.
- Added `GET /api/v1/questions/subjects` for subject/kind counts.
- Reads are limited to published `exam_questions` rows by existing RLS. No service-role key, unpublished rows, or write operations were introduced.
- Deployed as Worker deployment `a9bee33805dc4e4da75d729c96f90b93`. Node tests were added, but GitHub Actions continues to fail before exposing any job steps/logs, so test success is not yet confirmed.


## Published lectures — Pass 17

- Added `GET /api/v1/lectures?subject=` and `GET /api/v1/lectures/{id}` using the existing `site_content(key=lectures)` document and published `histology_lectures` rows.
- Only published lectures are exposed. The list response matches the PHP public projection; detail returns the full published lecture document.
- Deployment ID: `a9bee33805dc4e4da75d729c96f90b93`. Actual authenticated HTTP smoke tests and Node CI remain pending.


## Subject catalog and study plans — Pass 18

- Added `GET /api/v1/subjects-catalog`, `GET /api/v1/subject-plans`, and `GET /api/v1/subject-plans/{slug}`.
- Catalog and plan JSON use the existing Supabase `subjects` and `site_content` sources. Subject visibility is filtered by active group specialty; CMS reads continue to rely on the caller's JWT/RLS.
- Plan schedule samples are queried only through the user's active group memberships. They do not reproduce the PHP legacy service-role read that could return global schedule rows.
- Deployed as Worker deployment `8b8dc6a79d0b4ea294fba7f799d24c66`; live HTTP tests and CI remain unverified.


## API route migration — Pass 14 (homework progress write; source only)

- Added `POST /api/v1/homeworks/{id}/progress` to the Worker source.
- The route verifies the Supabase access token, verifies the homework is visible through the caller JWT, confirms active group membership, and upserts only the authenticated user's progress. The request must contain a boolean `done`; JSON is capped at 8 KiB.
- Regression tests cover the permitted write path and the out-of-group denial.
- **Source-only, not deployed.** GitHub Actions still fails before any visible step execution, and the current code change has not passed a runnable test suite. The active PHP/SpaceWeb API remains unchanged.


## Dashboard + schedule writes — Pass 19 (source-only, 2026-10-12)

- Dashboard fixes in `src/app/page.tsx`: don't show only already-ended classes as the nearest event; include an in-progress lesson; treat returned/completed homework as non-pending.
- Dashboard aggregate requests up to 200 published tests and returns explicit summary counts. These are additive response fields; the existing UI still derives its visible counts from its payload.
- Schedule read fix: date weekday labels now parse ISO dates correctly.
- Added `src/admin-schedule.js`: manager-protected schedule editor read and versioned full-schedule save. New version starts inactive, receives entries, activates after successful entry inserts, then prior active version is deactivated. If entry insertion fails, the incomplete version is kept inactive.
- Added `src/schedule-mutations.js`: guarded create/update/soft-cancel routes for individual entries. The database's existing RLS manager policies remain the authorization boundary.
- Routes authored: `GET/PUT /api/v1/admin/schedule`, `POST /api/v1/schedule/entries`, `PATCH/DELETE /api/v1/schedule/entries/{id}`.
- Regression tests authored in `test/admin-schedule.test.js`, `test/schedule-mutations.test.js`, and `test/index.test.js`.
- **Not deployed or runtime-verified.** Node tests could not be executed because the repository could not be cloned in the current network-isolated shell; GitHub Actions were left untouched as requested. The current PHP/SpaceWeb API remains active and frontend traffic has not been switched.
- Before deploy, validate test syntax locally, compare admin payloads against the PHP editor, test real manager/student JWTs against live RLS, inspect partial-failure recovery, and upload all modules together to the shadow Worker.


## Progress + test/question catalog — Pass 20 (source-only, 2026-10-12)

- Added authenticated `GET /api/v1/progress`, aggregating homework progress and the current user's test attempts under the supplied group/subject scope. Failures are explicit and not silently converted into a successful zero.
- Published tests now include `subject_name` and `questions_count`, computed from `test_questions` without reading question answer keys or attempt snapshots.
- Existing question-bank routes expose published `exam_questions` with filters and pagination; full answer data requires explicit `include_answer=1`.
- Read-only Supabase audit: 33 tests / 32 published; 855 questions / 660 published and active; 854 test-question links; 876 exam questions / 776 published. All test links point to published active questions; no published active question was found without a test link. One unpublished test with 67 linked questions remains unpublished intentionally.
- Regression tests authored but not run. No schema/data edits, Worker deployment, frontend cutover or GitHub Actions changes.
- The test-taking lifecycle remains a blocker for full cutover: test detail, start attempt, answer writes/grading, finish, history and grading retry routes still need migration.


## Progress + test/question bank — Pass 20 (source-only, 2026-10-12)

- Added authenticated `GET /api/v1/progress` with selected-group attempt history and homework completion, plus a UI correction to avoid displaying missing averages/no activity as real zeroes.
- Published test catalog restores frontend fields for subject/module/topic, linked-question count and optional source files, and filters subject-bound tests by subjects visible to the active group/specialty.
- Added safe read routes `GET /api/v1/tests/{uuid}` and `GET /api/v1/my/attempts`. Test detail strips answer text and per-option correct flags from its response; attempt history excludes `question_snapshot`.
- **Test attempt write routes are intentionally disabled.** A live privilege check confirmed authenticated clients can select `test_attempts.question_snapshot` and `questions.answer/options` directly. A private answer store / guarded database RPC design must be implemented before start/save/finish can be migrated safely. AI semantic grading/regrade is also not migrated.
- Regression tests were authored but not executed; GitHub Actions were left untouched and the connected shell could not clone GitHub due unavailable network.
- No Supabase grants/policies were modified, no Worker deployment occurred and the frontend remains on PHP/SpaceWeb.


## Test catalog completeness — Pass 21 (source-only, 2026-10-12)

- Added `GET /api/v1/tests/curriculum-map` returning the selected group’s visible subjects, modules, topics, scheduled topic dates, published question/test counts and unclassified question totals.
- Added `GET /api/v1/tests/chemistry-master`, reading the existing authenticated-only chemistry JSON document and preserving the frontend's `items` + `pagination` response contract. Live content contains 436 items for version `2026-10-07-v1`.
- Added `GET /api/v1/tests/{id}/bank-progress`, limited to the selected active group and the caller's own sequential session/results, without selecting a snapshot.
- Helper and route tests were authored. Static parse checks succeeded for 12 changed JS source/test files; the Node test runner was not executed.
- Attempt start/save/finish remain explicitly disabled until database-owned RPCs and grants prevent clients from writing authoritative attempt scores/status. No live schema/grant changes, Worker deployment, frontend switch or GitHub Actions modifications were made.


## Question bank projection and group scope — Pass 22 (source-only, 2026-10-12)

- The regular `GET /api/v1/tests/{uuid}` route removes correct-choice flags and answer text from each question, appropriate for a solve/exam flow.
- The full student bank uses `getTestBank()` → `GET /api/v1/tests/{uuid}?view=bank&group_id=...`; only this explicitly requested view includes answers/correct flags. The legacy PHP-compatible path remains unchanged on the frontend, and the Worker also exposes `GET /api/v1/tests/{uuid}/bank` as an alias.
- Test catalog requests pass the selected group to subject visibility. Only an active group membership is accepted; subject-bound tests are filtered by specialty/course where available, and global tests remain visible.
- The latest static parse check passed for 12 Worker/test JavaScript files. Node tests and live HTTP checks remain unexecuted; GitHub Actions were not touched and no Worker deployment occurred.
