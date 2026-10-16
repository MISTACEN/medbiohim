# Unified API merge register

**Target:** one production Cloudflare Worker, `workers/api/src/index.ts`, exposed through the frontend's `/api/v1` proxy. The source is modular; “one API” means one public origin and one deployed Worker, not one giant source file.

## Archives inventoried

- `medbiohim-cf-push.zip`: older single-file Worker entrypoint and Supabase/domain helpers.
- `medbiohim-cloudflare-api 2.zip`: 40+ modular legacy Worker modules, tests, SQL migrations, admin/planner/files/training/AI/storage implementations.
- `medbiohim-migration-audit 2.zip`: route matrix, PHP-vs-Worker comparisons, missing/partial status, security gates.
- `public_html-31(1).zip`: legacy PHP API, repositories, services, support utilities, and 1,000+ application files. PHP code is reference material for porting; it cannot execute directly inside a Cloudflare Worker.

## Current canonical Worker modules

The current Hono Worker mounts auth/profile, dashboard, subjects/groups, schedule/curriculum, homework, lectures/materials, tests/tickets/questions, search, trainings/trainers, progress/SRS/sessions, settings/presence, community, calculators/AI/chemistry, plans, and Upstash storage.

## Compatibility work committed

- `GET /api/v1/auth/me` delegates to the canonical authenticated `/api/v1/me` handler.
- `POST /api/v1/files/upload` delegates to the authenticated Upstash Blob upload handler at `/api/v1/storage/upload`.
- The Hono Worker now has a typed `MEDBIOHIM_UPSTREAM` service binding to `medbiohim-api-shadow`. Unmatched methods/routes and explicit `501` responses are passed to that compatibility Worker through the same public API origin. A cloned request is used so a handler can inspect the body without consuming the fallback request.
- Ordinary validation/auth/database errors (400/401/403/404/409/422/503 etc.) are not silently retried against the legacy Worker. This avoids masking real errors or duplicating writes.
- Wrangler config declares the service binding for both default and production environments. The target Worker must exist and its binding must be present in the deployed environment.

## Still to port/verify before calling the merge complete

| Legacy family | Current status | Required work |
|---|---|---|
| Academic planner / personal planner | Partial | Port archived planner CRUD and map schedule/homework/attendance semantics to existing tables/RPCs |
| File metadata / file download by legacy ID | Partial | Resolve legacy file IDs to trusted storage keys; do not equate IDs with Blob keys |
| Homework create/submit/grading | Partial | Port legacy mutations and ownership/role checks |
| Test preparation lifecycle | Partial | Match old `/tests/preparation/*` contract to secure training/test RPCs |
| Admin CMS, question bank, lectures, users, DB import, Telegram operations | Partial | Port routes with explicit server-side admin authorization and audit logging |
| Attendance and presence | Partial | Keep attendance records distinct from online presence heartbeat |
| AI tutor/chat and calculators | Partial | Compare request/response schemas and provider fallbacks against archived implementations |
| Content/media downloads | Partial | Use private Blob/B2 streaming or signed URLs; preserve authorization and content type |
| PHP-only long-tail endpoints | Not yet ported | Add endpoint-by-endpoint from the route audit; do not proxy arbitrary PHP paths as a permanent solution |

## Live deployment blockers observed during merge

- Cloudflare's current `medbiohim-api` live settings now list the service binding `MEDBIOHIM_UPSTREAM → medbiohim-api-shadow`.
- The binding configuration is present, but this alone does not prove that the latest GitHub source is the active Worker bundle or that every legacy route works. Route-contract smoke tests through the public API are still required.
- Vercel reported a build-rate-limit failure while these commits were being made. Do not treat source commits as proof of a healthy production deployment.
- No secrets were read or changed as part of this merge.

## Acceptance gates

1. Typecheck and tests pass for the unified Worker.
2. Route-contract tests cover every legacy route/method and response shape.
3. Authenticated smoke tests pass for login/me, dashboard, schedule CRUD, homework create/submit, tests/attempts, training lifecycle, materials/files, SRS, attendance, admin, AI and Telegram.
4. No secret/service-role key is returned to clients; all writes check user ownership or server-side admin role.
5. No route is marked “complete” based only on compilation or a 200 health response.

**Status:** unified public API routing is implemented in source; full source consolidation and PHP/legacy parity remain in progress. The current design uses the canonical Hono Worker first and the archived Worker as a compatibility service for uncovered routes. Do not call the migration complete until deployment config and authenticated route-contract smoke tests pass.
