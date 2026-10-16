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


## Academic / planner / attendance implementation (2026-10-16)

Canonical Hono routes are now mounted in the primary API:

- `GET /api/v1/planner?group_id=&from=YYYY-MM-DD&to=YYYY-MM-DD`: validates the user's active group membership and returns tasks, attendance, recovery summaries, and `lessons`. Each lesson contains its linked tasks; task rows preserve `schedule_entry_id`.
- `POST /api/v1/attendance/:entryId`: validates the lesson belongs to an active schedule of one of the user's groups, then creates/updates only that user's attendance record. Allowed statuses: `present`, `excused`, `sick`, `unexcused`.
- `POST /api/v1/academic/sync`, `GET /api/v1/academic/state`, `PUT /api/v1/academic/state`, `POST /api/v1/academic/ai-plan`: sync tries known RPC names, state read/write is scoped to the authenticated user, and study plan generation currently uses deterministic rules (no LLM invocation).
- `POST /api/v1/homeworks`: students can add a personal or group task. If `schedule_entry_id` is supplied, the API checks membership and derives/validates the lesson's group and subject before insert. `GET /api/v1/homeworks` now returns subject and linked lesson details.

### Data semantics and verification status

- Schedule/task linkage uses the existing `homeworks.schedule_entry_id` foreign-key relationship; it does not copy or fabricate timetable entries.
- Attendance is separate from online presence heartbeats.
- Group IDs supplied by clients are not trusted; planner, attendance and linked-task creation verify active membership.
- The academic AI-plan endpoint is a rule-engine plan and is returned as `persisted: false`; persistence and LLM-backed planning are not claimed as implemented.
- These are source changes on `main`. They are **not yet runtime-verified** against the deployed Worker or live Supabase schema. Typecheck, unit/contract tests, and authenticated smoke tests remain acceptance gates. In particular, validate actual RLS grants and relation names for `schedule_entries`, `homeworks`, `attendance_records`, and academic tables before treating these routes as production-complete.


## Homework lifecycle — creation, submission and review (2026-10-16)

The primary Worker now exposes the following homework lifecycle:

- `POST /api/v1/homeworks`: create a student task, optionally linked to a timetable entry. Group/lesson context is checked against active membership; linked lesson supplies the subject and default due date. The archived attachment array contract is not yet fully implemented in this handler.
- `GET /api/v1/homeworks`: returns group tasks for the caller's active groups and personal tasks created by the caller. It no longer intentionally lists every group's tasks globally.
- `POST /api/v1/homeworks/:id/submit`: submits text and/or an owned uploaded file; checks group membership and blocks a second submission while the previous one is awaiting review.
- `GET /api/v1/homeworks/:id/submissions`: students can see their own submissions; teacher/moderator/admin roles can see submissions for that task.
- `POST /api/v1/submissions/:id/grade`: staff-only numeric grade (0–100) plus teacher comment; stores grader and timestamp.
- `POST /api/v1/submissions/:id/return`: staff-only return for revision with a required explanation.
- `POST /api/v1/homeworks/:id/progress`: records personal completion progress.

Staff roles are read through `user_roles → roles(code)`. The API does not trust a client-supplied role. These routes are source changes on `main`; live database constraints, RLS, typecheck, and authenticated tests still need to be verified before production acceptance.


## Tests, preparation, answers and learning sessions — 2026-10-16
The canonical Worker routes now enforce these contracts:

- `GET /api/v1/tests` and `GET /api/v1/tests/:id`: published test metadata only; answer keys are not selected.
- `GET /api/v1/tests/attempts`: caller's own attempt history, safe fields only.
- `POST /api/v1/tests/:id/start` and legacy alias `POST /api/v1/tests/:id/attempts`: server RPC only. There is no direct-table fallback that could bypass attempt limits/group context.
- `POST /api/v1/tests/attempts/:id/answers`: validates IDs and payload size, calls `medbiohim_save_test_answer` with `p_answer_text`, and strips grading/key fields while the attempt is active.
- `POST /api/v1/tests/attempts/:id/finish`: server-side finalization via `medbiohim_finish_test_attempt`.
- `POST /api/v1/tests/attempts/:attemptId/answers/:questionId/regrade`: server RPC only; deployment must provide the named RPC and authenticated-only grants.
- `/api/v1/sessions`: restored legacy `learning_sessions` list/create/get/patch contract. Every read/write is filtered by authenticated `user_id`; client cannot set ownership.
- `/api/v1/trainings`: validates status, UUID, answer index, skip flag, answer type and size before invoking the protected `histology_training_*` RPCs. No table fallback is used for mutation.

Legacy preparation mode routes are now mounted by `workers/api/src/routes/preparation.ts`: start/resume, GET session, PATCH/save answer, finish, retry-grading and AI review. The handler bundles the existing server-side implementation from `integrations/cloudflare-api/src/planner.js`; it does not forward requests to PHP/SpaceWeb or the Shadow Worker. Full route parity is **source-wired but not yet runtime-accepted** until the Worker bundle/typecheck succeeds and authenticated start → answer → reload → finish → review tests pass against live Supabase/RLS.
