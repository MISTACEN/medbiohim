# MEDBIOHIM — reverse API contract pass
**Date:** 2026-10-16  
**Scope:** inspect the current `main` Worker router against frontend contracts and the supplied migration artifacts. No production cutover or deployment performed.

## Confirmed from current GitHub main

- Worker router: `integrations/cloudflare-api/src/index.js` (blob `e99247b3c8e105180286e591d0472afeedc9581b`).
- Frontend API client: `src/lib/api.ts` (blob `7fad41da506f363e4469ec7a60e2c0adbe668958`).
- Subject-plan handler has an intentional fallback: student-facing RLS denial on optional `site_content` (401/403/404) is treated as no curated JSON; it then derives the plan from caller-visible curriculum rows. Other errors such as 503 remain failures rather than silently masking an outage.
- Homework creation supports personal and group scope, verifies active group membership, validates schedule context, and supports up to 12 attachment IDs. Attachments are checked for owner/status and group scope before calling the atomic `create_homework_with_attachments` RPC. Caller JWT is used; no service-role bypass is introduced.
- Existing tests already cover the happy path for homework with photos and rejection of inaccessible attachment IDs.

## Change made on main

Added a regression test to `integrations/cloudflare-api/test/planner-homework.test.js`:
- a file owned by the caller but scoped to a different group must be rejected with `403 ATTACHMENT_GROUP_MISMATCH`;
- the atomic write RPC must not be called on that failure.

Commit: `b15e4aa0fb8f3698ea9ea168cee73544f1e15c12`.

## Evidence and limits

- The test was committed to main, but this session did not execute the repository's full GitHub test suite against that exact commit. Treat the test as added, not as passing.
- Running `npm test` against the separately supplied `medbiohim-cloudflare-api 2.zip` artifact produced 58 passing tests and one failure in its legacy `homework-mutations.test.js` teacher-role fixture. That artifact's fixture returns `user_roles.role`, while the audited current main handler correctly reads the live `roles(code)` relation and main has a separate updated `homework-grading.test.js`. This is artifact drift, not proof that main's current suite fails.
- Live authenticated RLS acceptance, actual file download URLs, Worker runtime, and frontend end-to-end flows remain unverified.
- Do not enable production traffic or relax rate-limit/auth/RLS gates based on these unit-level checks.

## Next passes

1. Execute tests on the exact main commit using GitHub Actions or a reproducible checkout; record each failing test without weakening access checks.
2. Validate homework attachment upload → metadata → authenticated download end-to-end, including MIME/size checks and no private object-key leakage.
3. Test the full training lifecycle (create, fetch, answer, finish, cancel) against real schema/RLS with a student JWT.
4. Test account settings and preferences; distinguish expected 401 when logged out from a real authenticated 401/503.
5. Keep `ROADMAP.md` and `PHASES_STATUS.md` as the project-level status files; this note is supporting evidence, not a replacement.
