## API route migration — Pass 18 (2026-10-12; deployed to isolated shadow Worker)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/plans_rest.php` | `GET /api/v1/subjects-catalog` | Active subject catalog filtered by group-derived specialty; curriculum document read under caller RLS | Implemented and uploaded; live role-specific RLS test pending |
| `backend/config/routes/plans_rest.php` | `GET /api/v1/subject-plans` | Reads only `site_content` keys matching `subject_plan:*` | Implemented and uploaded; live RLS test pending |
| `backend/config/routes/plans_rest.php` | `GET /api/v1/subject-plans/{slug}` | Missing plan returns `available:false`; schedule sample is scoped to active group membership rather than global service-role reads | Implemented and uploaded; live schedule/plan parity pending |

Worker deployment ID: `8b8dc6a79d0b4ea294fba7f799d24c66`. Subject-plan schedule sampling deliberately avoids the PHP legacy global schedule read; it uses the caller JWT and only returns data visible to the user's active groups.

## API route migration — Pass 17 (2026-10-12; deployed to isolated shadow Worker)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/lectures_rest.php` + `LectureService.php` | `GET /api/v1/lectures?subject=` | Published lecture list; public fields only, media count; includes published legacy histology lectures | Implemented and uploaded; live RLS/response parity pending |
| `backend/config/routes/lectures_rest.php` + `LectureService.php` | `GET /api/v1/lectures/{id}` | Published lecture detail only; draft/rejected content is not returned | Implemented and uploaded; live HTTP smoke test pending |

Worker deployment ID: `a9bee33805dc4e4da75d729c96f90b93`. Lecture reads use the caller JWT and anon key. Legacy histology rows are filtered to `is_published=true`.

## API route migration — Pass 16 (2026-10-12; deployed to isolated shadow Worker)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/questions_rest.php` + `ExamQuestionStore.php` | `GET /api/v1/questions?subject_id=&subject_slug=&kind=&q=&limit=&offset=&include_answer=` | Published exam-question bank, filters and pagination; full answers only when explicitly requested; long answers previewed by default | Implemented and uploaded; table RLS permits published rows; live HTTP and full-count parity remain to verify |
| `backend/config/routes/questions_rest.php` | `GET /api/v1/questions/subjects` | Summary by subject and question kind from all published rows | Implemented and uploaded; live HTTP smoke test pending |

Worker deployment ID: `94a6ffc92a0741e1a7c1a7e559d989bd`. No question mutations or answer-key access to unpublished rows were added. These are read-only routes and use the caller JWT + anon key.

## API route migration — Pass 15 (2026-10-12; deployed to isolated shadow Worker)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/src/Support/ContentStore.php` | Dashboard site + announcements via `GET /api/v1/dashboard` | Reads `site_content` keys `site` and `announcements` using caller JWT; uses the student-visible RLS policy; default site fields only when a document is absent | Implemented; actual role-specific RLS response still needs live authenticated smoke test |
| `backend/src/Repositories/ScheduleRepository.php::calendarMeta` | `GET /api/v1/schedule/meta?course=&semester=` | Bounded course/semester filters; calendar periods and subject duration rules | Implemented and uploaded; schema/RLS contract test added |

Worker deployment ID: `5d9195d3f9494e3997541699795269d9`. The deployed source includes schedule latest-version selection, PHP-compatible group-selection errors, schedule calendar metadata, and dashboard site/announcement reads. External HTTP smoke tests and Actions execution remain unverified.

## API route migration — Pass 14 (2026-10-12; deployed to isolated shadow Worker)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/platform.php` | `GET /api/v1/dashboard` | Authenticated aggregate of profile, upcoming schedule, group homework and published test catalog; partial-data indicator is explicit | Implemented and uploaded to `medbiohim-api-shadow`; HTTP smoke test and CI tests still pending |
| `backend/config/routes/platform.php` / schedule services | `GET /api/v1/schedule?from=&to=&group_id=` | Caller JWT; active group membership checked before schedules; schedule entries and subject metadata read through RLS | Implemented and uploaded; verify PostgREST filters/embedding and real-user response |
| `backend/config/routes/homework.php` | `GET /api/v1/homeworks?group_id=` | Active group membership required; reads own completion/submission state only | Implemented and uploaded; live RLS/response parity still pending |
| `backend/config/routes/tests.php` | `GET /api/v1/tests?subject_id=&limit=` | Published, non-archived catalog only; does not return answer keys or user attempts | Implemented and uploaded; live schema and contract comparison still pending |

The Worker was redeployed on 2026-10-12 with deployment ID `13a6d8bf91f94f10b546b8eff139ae5e`. Supabase URL and anon key secrets were confirmed present after upload. No production frontend switch was made. The dashboard reads `site` and `announcements` from `site_content` under the caller JWT and marks them degraded if the student-visible RLS query fails; it does not fabricate that content.

## API route migration — Pass 13 (2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/domain.php` | `GET /api/v1/subjects?course=&semester=` | Bearer-authenticated catalog; caller JWT + anon key; active group membership determines specialty access; MBH membership also grants histology; bounded course/semester filters | Worker helper/route and regression tests added; not deployed; live RLS relationship and specialty-policy parity remain to be verified |

The route fails closed with a generic 503 if membership access cannot be checked. It does not use a service-role key. CI acceptance is blocked until GitHub Actions executes actual test steps and produces a successful run.

## API route migration — Pass 12 (2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/domain_rest.php` | `GET /api/v1/subjects/{id}` | Bearer-authenticated subject detail and modules; uses caller JWT + anon key; handles known `sort_order` / `order_index` schema variation; no service-role key | Worker implementation and helper/route tests added; not deployed; live RLS/schema compatibility unverified |

## API route migration — Pass 11 (2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/domain_rest.php` | `GET /api/v1/me` | Alias of the authenticated profile bundle; bearer auth is enforced before profile queries | Implemented as alias to `/api/v1/auth/me`; regression test added; not deployed |

## Migrated API route — Pass 10 (2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/search_rest.php` + `SearchService.php` | `GET /api/v1/search` | Requires authenticated bearer token; searches published questions, exam questions, trainer cards, subjects and optional plans; query/type/subject filters; response includes items and facets | Worker helper/route/tests added; not deployed |

The Worker sends the caller JWT plus anon key to Supabase REST and relies on database grants/RLS. Verify the live policies permit the intended student's published question-bank search while preventing access to private or unpublished content. Compare results against PHP fixtures before cutover.
## Migrated auth route — Pass 8 (read-only profile bundle; 2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/auth.php` + `UserRepository::profileBundle()` | `GET /api/v1/auth/me` | Validates bearer token with Supabase Auth; reads caller-scoped profile, role and active group memberships through PostgREST using anon key + caller JWT; no service-role key | Helper/route/tests added; live RLS/relationship behavior still needs validation |

The Worker returns the PHP bundle keys `user`, `roles`, `groups`, `current_group`, `course`, and `semester`. Optional profile queries fail back to a minimal identity bundle, matching the PHP route's final fallback shape. Before cutover, confirm actual grants/RLS and PostgREST relationship embedding against staging/live schema. Do not use service-role credentials to make this route pass.

## Migrated auth route — Pass 7 (partial; 2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/auth.php` | `POST /api/v1/auth/register` | Supabase signup over HTTPS; validates email, name and password; bounded body; generic signup errors; email-confirmation field | Helper/route/tests added; deliberately returns 503 until limiter binding exists; profile creation/default role assignment not migrated |

**Cutover blockers:** configure/test `AUTH_REGISTER_LIMITER`; port the PHP `ensureProfile()` and default student-role behavior only after database/RLS permissions and a safe server-side write strategy are confirmed. Avoid service-role shortcuts and never let signup metadata assign privileged roles.

## Migrated auth route — Pass 6 (partial; 2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/auth.php` | `POST /api/v1/auth/login` | Supabase password token exchange over HTTPS; generic invalid-credential response; bounded body; requires Cloudflare Rate Limiting binding | Helper/route/tests added; deliberately returns 503 until binding exists; DB profile/role sync not migrated |

**Cutover blockers:** configure and test `AUTH_LOGIN_LIMITER`; migrate `UserRepository::ensureProfile()` and `roleCodesForUser()` only after confirming database-side ownership/RLS and the minimum required server-side DB credential strategy. Do not use the service-role key as a shortcut or trust client-supplied roles. The PHP login response includes `profile` and `roles` when profile synchronization succeeds; the Worker response currently lacks these fields and is therefore only a partial migration.

## Migrated auth route — Pass 5 (2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/auth.php` | `POST /api/v1/auth/recover` | Requires email; sends recovery via Supabase Auth over HTTPS; fixed callback on configured HTTPS app origin; normalizes Supabase 4xx to avoid email enumeration | Implemented in Worker source; tests added; not deployed |

Recovery currently relies on Supabase's built-in throttling, as the PHP handler has no app-level limiter. Before production, add a Cloudflare edge rate-limit binding and verify its per-IP behavior. Never accept a caller-supplied redirect URL for recovery.

# MEDBIOHIM API migration inventory — Cloudflare Workers

Date: 2026-10-12

## Decision and scope

SpaceWeb remains the active PHP API host during this preparation phase. This document is a migration inventory and sequencing plan, not permission to change production traffic. The shadow Worker in \`integrations/cloudflare-api/\` is not deployed and is not connected to the frontend.

The PHP bootstrap \`backend/config/routes.php\` registers the route modules listed below. A static module list does not prove every route is reachable in production; the router, bootstrap, deployed document root, and current SpaceWeb source must still be compared before cutover.

## Route modules to inventory

| Area | PHP route modules | Migration risk / order |
|---|---|---|
| Health and API metadata | \`health.php\` | First; public, read-only; avoid exposing configuration/secrets |
| Authentication | \`auth.php\` | High; preserve Supabase Auth/session behavior; do not replace casually |
| Core domain | \`domain.php\`, \`domain_rest.php\`, \`platform.php\` | Medium/high; subjects, groups, dashboard and platform data need access-policy parity |
| Tests and questions | \`tests.php\`, \`questions_rest.php\`, \`preparation.php\`, \`sessions_rest.php\`, \`trainings.php\`, \`plans_rest.php\` | High; protect answer keys, attempts, progress, and per-user state |
| Homework and academic planning | \`homework.php\`, \`student_planner.php\`, \`academic_planning.php\` | High; enforce group membership, ownership, schedule semantics and attachment access |
| Learning and progress | \`progress_rest.php\`, \`srs_rest.php\`, \`calculators_rest.php\`, \`lectures_rest.php\` | Medium/high; user-scoped reads and writes need contract tests |
| Search and AI | \`search_rest.php\`, \`ai_chat.php\` | Medium/high; preserve authenticated filtering, usage limits and provider-secret isolation |
| Files and learning media | \`files.php\`, \`material_viewer.php\`, \`histology_sources.php\`, \`content_integration.php\` | High; private media, path normalization, caching and storage credentials |
| Account settings and community | \`settings_rest.php\`, \`community_rest.php\`, \`presence.php\` | Medium/high; identity, privacy and rate limits |
| Telegram | \`telegram.php\`, \`admin_telegram.php\` | High; webhook secrets, replay/idempotency, account linking and trusted HTTPS |
| Administration | \`admin.php\`, \`admin_rest.php\`, \`admin_content_package.php\`, \`admin_questions.php\`, \`admin_database.php\`, \`00_admin_import_atomic.php\` | Last; strict canonical roles, audit trail, minimal privileges and transaction parity |
| Other integrations / imports | \`import_rest.php\`, \`calculators_rest.php\`, \`content_integration.php\` | Classify each handler individually before selecting a migration wave |

Other modules in the bootstrap that also require route-level review: \`presence.php\`, \`sessions_rest.php\`, \`student_planner.php\`, \`plans_rest.php\`, \`domain_rest.php\`, \`lectures_rest.php\`, \`admin_database.php\`, \`admin_content_package.php\`, \`admin_questions.php\`, \`00_admin_import_atomic.php\`. This list intentionally groups modules by domain; it is not a substitute for the exact method/path inventory.

## Implemented in shadow — Pass 1 (2026-10-12)

| PHP source | Route | Auth/data | Shadow status | Remaining gate |
|---|---|---|---|---|
| **backend/config/routes/health.php** | **GET /api/v1** | Public metadata only; no DB access | Implemented with PHP-compatible **ok/data/requestId** success envelope | Tests authored and locally pass; GitHub runner + Wrangler deploy compatibility still unverified |
| **backend/config/routes/health.php** | **GET /api/v1/ping** | Public ping only; no DB access | Implemented with **pong/build/env/time** fields | Time is UTC ISO-8601; **env** intentionally reports the shadow environment |
| **backend/config/routes/health.php** | **GET /api/v1/health** | PHP health checks inspect runtime, database and configuration | Shadow diagnostic only; **not contract-compatible** with PHP HealthChecker yet | Port checks deliberately only after deciding what configuration detail must remain private |

Method/path requests outside those exact GET contracts are not treated as migrated. Other API routes continue to return **501 ROUTE_NOT_MIGRATED** in the shadow Worker and are never proxied to SpaceWeb.

## Migrated auth route — Pass 4 (2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/auth.php` | `POST /api/v1/auth/refresh` | Requires `refresh_token`; uses Supabase Auth token exchange over HTTPS with anon key; normalizes session/user fields; never trusts `user_metadata.role` | Implemented in Worker source; tests added; not deployed |

The Worker bounds JSON request size to 16 KiB and refresh token length to 8 KiB. Missing tokens are 422, invalid/expired refresh tokens are 401, missing configuration is 503, and upstream/network failures are returned as generic 502. This improves failure distinction compared with the current PHP implementation, which maps all refresh failures to 401; verify frontend expectations before production cutover.

## Migrated auth route — Pass 3 (2026-10-12)

| PHP source | Route | Contract / safety | Shadow status |
|---|---|---|---|
| `backend/config/routes/auth.php` | `POST /api/v1/auth/logout` | Accepts Bearer token; calls Supabase Auth logout over HTTPS using only anon key plus caller token; invalid/expired token maps to 401; upstream/network failures are generic 502; no service-role key | Implemented in isolated Worker; route and helper regression tests added; no deployment yet |

The route prefers the Bearer header and preserves the PHP handler's JSON `access_token` fallback for compatibility. JSON is size-capped; malformed JSON is rejected. Frontend compatibility must be confirmed before any production cutover. The route has no persistent DB writes.

## Authentication foundation — Pass 2 (2026-10-12)

A shared helper now validates a Bearer token by asking Supabase Auth for `/auth/v1/user` over HTTPS. It requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`, blocks redirects, has a bounded timeout, returns 401 for invalid/expired tokens, and masks upstream exceptions behind a generic 502. Its output contains only user ID and email; roles, group membership, specialty access, and resource ownership are not inferred. The helper is deliberately not wired into existing API routes until each handler's authorization and response contract is confirmed.

## Route-by-route migration worksheet

Before implementing a route in Workers, add a row to this worksheet (or an equivalent machine-readable fixture):

| Field | Required detail |
|---|---|
| PHP source | File + handler name and exact HTTP method/path |
| Callers | Frontend service/hook, bot, extension, scheduled job or admin UI |
| Contract | Request body/query, response JSON, status codes and error codes |
| Auth | Public or verified JWT; identity derived from verified claims |
| Authorization | Canonical role, ownership, group membership and fail-closed behavior |
| Data | Tables/RPCs, RLS, grants, transaction and idempotency behavior |
| Secrets | Exact server-side secret required; never frontend-exposed |
| Media/cache | Public/private classification, signed URL, cache headers and retention |
| Limits | Payload bounds, rate limits, timeout/retry and abuse controls |
| Tests | Happy path + unauthenticated + unauthorized + invalid input + upstream failure |
| Rollback | How to route the caller back to the PHP endpoint |

## Migration sequence

1. **Stabilize CI first.** The known GitHub Actions runner issue must be resolved by verifying that a runner is allocated and actual steps execute. A workflow trigger alone is not a test result.
2. **Inventory exact routes and consumers.** Read each registered PHP module and its service classes; record methods, paths, middleware, SQL/RPC calls, status codes, and frontend callers.
3. **Capture contract fixtures.** Use safe representative responses with sensitive fields removed. Do not copy production secrets or personal data into fixtures.
4. **Implement public read-only routes.** Start with health and truly public metadata only. Keep the shadow Worker separate.
5. **Implement authenticated reads.** Verify Supabase JWTs server-side and preserve RLS or explicit resource ownership. Never trust client-supplied user IDs or role names.
6. **Implement writes and stateful flows.** Add idempotency and transactional checks; preserve homework, attempts, schedule, attendance and progress semantics.
7. **Migrate admin, Telegram, and media last.** These have the largest authorization, secret, privacy, and cache risks.
8. **Staging acceptance.** Run contract and negative authorization tests, check latency/errors, and verify HTTPS, CORS, rate limits, logs, and rollback.
9. **Cutover only with explicit approval.** Keep the frontend on SpaceWeb until the replacement covers the required route set and end-to-end behavior. Retain SpaceWeb as rollback until the agreed stability period ends.

## Non-negotiable safety rules

- No authenticated request or one-time link token may be sent to the currently observed HTTP SpaceWeb origin.
- Do not disable TLS verification or use Cloudflare Flexible TLS as a workaround for a plaintext origin.
- Do not put Supabase service-role keys, Telegram tokens, webhook secrets, or B2 credentials in browser code, repository source, test fixtures, or logs.
- Do not expose answer keys or private trainer data while migrating search/media endpoints.
- Do not apply database migrations or change live Supabase policies as a side effect of creating the Worker scaffold.
- No production DNS, webhook, frontend API URL, or Worker route changes during the preparation phase.


## Latest deployment + auth parsing correction — 2026-10-12 04:51 UTC

- The shadow Worker is deployed (it is not production traffic): latest active deployment `c056a5cf-1214-4967-ae1f-45cea21a792c`, version `24482903-49ad-423a-8688-93a8702ea267`.
- The uploaded source includes the fix in `getSupabaseSubjectDetail()` and `listSupabaseSubjects()`: both malformed Bearer regexes now correctly extract the caller JWT before PostgREST calls. See `docs/CLOUDFLARE-SUBJECT-BEARER-FIX-2026-10-12.md`.
- Cloudflare settings were re-read after upload and both Supabase secrets remained configured. No service-role key, frontend base URL, DNS, or Telegram webhook was changed.
- Some earlier rows above saying “not deployed” are historical snapshots from before this upload; the current deployment state is recorded here. The route-level live RLS/schema behavior and authenticated HTTP smoke tests are still **unverified**. GitHub Actions remains blocked before steps.


## Write migration — homework progress (2026-10-12)

- Added a shadow-only handler for `POST /api/v1/homeworks/{id}/progress` in `integrations/cloudflare-api/src/index.js`.
- The helper validates the caller with Supabase Auth, loads the homework under the caller JWT/RLS, checks active membership in that homework's group, then upserts only the caller's `homework_progress` row. It does not accept a client-supplied user ID and does not use a service-role key.
- Request body: JSON object with boolean `done`. The body is capped at 8 KiB. Invalid methods and malformed bodies fail closed.
- Added regression cases for successful own-user write and rejection when the caller is not an active member of the homework's group.
- Commits: `ff6f9b8` helper, `10e1c71` route, `30dd5a7` tests, `c696600` Bearer parsing correction.
- **Not deployed to Cloudflare yet.** GitHub Actions runs for commit `30dd5a7` failed in about four seconds with no steps/logs; the current CI allocation issue remains unresolved. The latest Bearer parsing correction is newer than those runs, so it has not been validated by CI. Do not route production traffic to this endpoint until CI executes and Supabase staging verifies the `homework_progress` upsert/RLS behavior.


## Dashboard + schedule write routes — source-only pass (2026-10-12)

| Method / route | Source handler | Auth / authorization | Status |
|---|---|---|---|
| `GET /api/v1/dashboard` | `src/index.js` aggregate | Authenticated caller JWT; profile, group homework, schedule, published tests and CMS remain RLS-scoped | Summary counts added; live role-specific responses not smoke-tested |
| `GET /api/v1/admin/schedule?group_id=&semester=` | `src/admin-schedule.js` | Supabase Auth + RLS; manager roles can read schedule versions; student must not be granted editor access | Source-only, tests authored |
| `PUT /api/v1/admin/schedule` | `src/admin-schedule.js` | Caller JWT; schedule/schedule_entries RLS remains authoritative | Creates a new inactive version, writes entries, activates after insert, then deactivates prior active version; source-only |
| `POST /api/v1/schedule/entries` | `src/schedule-mutations.js` | Caller JWT + RLS manager policy | Source-only; validated entry insert |
| `PATCH /api/v1/schedule/entries/{id}` | `src/schedule-mutations.js` | Caller JWT + RLS manager policy | Source-only; validated allowlisted field updates |
| `DELETE /api/v1/schedule/entries/{id}` | `src/schedule-mutations.js` | Caller JWT + RLS manager policy | Source-only; sets `is_cancelled=true` to retain linked homework/history |

Important gate: the versioned admin save path matches the existing PHP contract more closely than direct row mutation. Granular entry routes are auxiliary and should not be wired into the UI until the product decides whether an individual edit must always create a new immutable schedule version. No Supabase policy was broadened. No Worker deployment, production API switch or Actions workflow change was made. Tests are authored but not executed.
