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

- `GET /api/v1/auth/me` now delegates to the canonical authenticated `/api/v1/me` handler.
- `POST /api/v1/files/upload` now delegates to the authenticated Upstash Blob upload handler at `/api/v1/storage/upload`.
- These are aliases only; they do not create a second database or duplicate writes.

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

## Acceptance gates

1. Typecheck and tests pass for the unified Worker.
2. Route-contract tests cover every legacy route/method and response shape.
3. Authenticated smoke tests pass for login/me, dashboard, schedule CRUD, homework create/submit, tests/attempts, training lifecycle, materials/files, SRS, attendance, admin, AI and Telegram.
4. No secret/service-role key is returned to clients; all writes check user ownership or server-side admin role.
5. No route is marked “complete” based only on compilation or a 200 health response.

**Status:** merge in progress. The Worker now has a single canonical entrypoint and the first compatibility aliases, but this register deliberately does not claim full PHP/legacy parity until the remaining route families and live tests pass.
