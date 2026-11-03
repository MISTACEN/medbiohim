# MEDBIOHIM — Implementation Audit Pass 9–13 — 2026-10-06

## Pass 9 — Canonical Academic Context

Implemented:
- added `backend/src/Services/AcademicContextResolver.php`;
- explicit group selection for multi-group writes;
- membership verification;
- subject UUID validation inside group context;
- homework create/list/progress/submit context enforcement;
- submission file access validation;
- published-test gate;
- idempotent active test attempt;
- preparation question membership and `in_progress` transition checks;
- preparation finish no longer accepts terminal sessions.

Key invariant:
`user → group → subject UUID → action`.
Group membership order is no longer a business decision.

## Pass 10 — Files + Community + Cache

Implemented:
- file upload validates selected group membership before B2 upload;
- file visibility accepts only known `group/public` values;
- file download/metadata access checks ownership/group/public access;
- community list/create is group-scoped;
- fallback community path preserves group scope;
- community UI loads the user's groups and requires explicit selection when needed;
- client API cache is scoped by authenticated user instead of only URL.

## Pass 11 — SRS / Subject Identity

Implemented:
- SRS accepts `subject_id`;
- UUID is authoritative when supplied;
- slug remains compatibility/routing alias;
- SRS summary groups by `subject_id`;
- SRS question generation actually filters by resolved UUID;
- cards UI can pass subject UUID from URL.

## Pass 12 — Build / Runtime Contract

Implemented:
- removed incorrect `/tests → /subjects` redirect;
- frontend `X-Medbiohim-Build` now uses `VERCEL_GIT_COMMIT_SHA` when deployed;
- backend health/root/ping expose `MEDBIOHIM_BUILD` when configured;
- Router type contract remains strict and unchanged.

Still open:
- production TypeScript/ESLint suppression remains in `next.config.ts`;
- SpaceWeb runtime must be proven against the exact deployed artifact;
- GitHub workflow connector did not expose a run for the latest commits.

## Pass 13 — Regression / DB Verification

Live read-only snapshot:
- active memberships: 4
- active groups: 4
- active subjects: 110
- published tests: 32
- test links: 854
- homeworks: 0
- attendance: 0
- community posts: 0
- SRS cards: 0

Integrity:
- broken test→test links: 0
- broken test→question links: 0
- published tests with missing subject: 0
- schedule entries with missing subject: 0

Because homework/attendance/community/SRS are currently empty in production, full write E2E cannot be proven without creating test data. No production test data was inserted.

## Remaining P0/P1

1. Verify SpaceWeb runtime and eliminate source/artifact mismatch around the previous Router TypeError.
2. Run exact frontend typecheck + production build without ignored errors.
3. Add automated E2E seed/cleanup scenario for:
   login → group → subject → schedule → attendance → homework → submit → test → preparation → progress → SRS → community.
4. Continue UUID migration in legacy content/search/lecture/practice paths where slug is still an identity selector.
5. Complete file/material viewer checks for DOCX/PDF/images.
6. Finish community comments/report/edit/delete lifecycle.
