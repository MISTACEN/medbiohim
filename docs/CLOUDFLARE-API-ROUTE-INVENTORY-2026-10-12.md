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
