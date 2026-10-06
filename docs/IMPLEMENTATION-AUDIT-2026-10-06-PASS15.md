# IMPLEMENTATION AUDIT — 2026-10-06 · PASS 15

## Scope
Core academic chain: Group → Schedule → Attendance → Homework → Test attempt → Progress.
This pass checks semantic consistency, retry/idempotency and cross-group leakage, not only endpoint availability.

## Verified live database facts
- homework_submissions.status is constrained to draft | submitted | graded | returned.
- test_attempts.status is enum in_progress | submitted | abandoned.
- There were no duplicate in_progress attempts for the same (test_id,user_id) before the new invariant.
- A production partial unique index now exists: test_attempts_one_active_per_user_test_idx on (test_id,user_id) where status is in_progress.
- schedule_entries has session_id, event_kind, is_makeup, source.
- schedules has group, semester and immutable version fields.

## Implemented

### 1. Planner context
backend/config/routes/student_planner.php
- Planner now resolves one explicit academic group.
- Multiple active groups without group_id return GROUP_REQUIRED instead of mixing groups.
- Homework planner data is restricted to the selected group plus explicitly global homework.
- Attendance is restricted to the selected group's active schedule version.
- Attendance writes resolve the concrete schedule_entry through AcademicContextResolver::resolveLesson().
- Planner response exposes resolved group/context information.

### 2. Homework submission state machine
backend/src/Repositories/HomeworkRepository.php and backend/config/routes/homework.php
- Submission locks the current row before changing it.
- Identical retry of an already submitted/graded payload is idempotent.
- Conflicting overwrite of submitted or graded work is rejected.
- draft and returned can move to submitted.
- Submission route validates homework group membership and subject context before writing.
- Homework list requires a canonical selected group instead of silently aggregating all memberships.

### 3. Test attempts
backend/src/Repositories/TestRepository.php and backend/config/routes/tests.php
- Concurrent start requests are protected by the production partial unique index.
- Race retry returns the existing active attempt.
- finish validates score/max-score bounds.
- finish is idempotent for the same terminal result.
- Conflicting terminal rewrite is rejected with ATTEMPT_ALREADY_FINISHED.
- Validation errors are returned as 422; terminal conflicts as 409.

### 4. Schedule and frontend propagation
backend/config/routes/platform.php, src/lib/api.ts, src/app/schedule/page.tsx
- Student schedule resolves an explicit academic group and filters DB and REST fallback data to that group.
- Planner/schedule/attendance API helpers accept groupId.
- Schedule UI propagates user.groupId into schedule, planner and attendance calls.

### 5. Production schema invariant
Migration: database/migrations/20261006_test_attempts_active_unique.sql
The partial unique index was applied to production Supabase and verified afterwards.

## Remaining P1/P0 work
### P1 — Progress is still legacy-context mixed
backend/config/routes/progress_rest.php and ProgressService.php still have broader legacy aggregation paths. Next: make overall progress group/session aware; use the same canonical subject set; stop using service-key REST reads as an implicit context bypass; keep degraded mode explicit.

### P1 — Test score authority
The ordinary test finish endpoint still accepts the calculated score from the client. Next state-machine pass must make the server authoritative for scoring from persisted answers/question definitions where supported.

### P1 — Attempt academic snapshot
test_attempts does not yet persist group_id/session_id/context_version. Start-time authorization is correct, but a long-lived attempt can outlive a context change. Future migration should snapshot academic context on attempt creation.

### P1 — Homework canonical state
homework_progress.completed and homework_submissions.status remain separate stores. UI/API should expose one canonical derived state so completed/submitted/returned/graded cannot appear contradictory.

### P1 — Schedule session integrity
schedule_entries.session_id is nullable and not yet universally reconciled with schedule semester/current academic session. Next schedule pass must validate session/semester consistency.

## Acceptance gate for Pass 15
Pass 15 is implemented but not fully closed until: progress cannot aggregate another group/semester; test scoring is server-authoritative; long-lived attempts retain context snapshot; homework progress/submission state has one canonical semantic contract; schedule session/semester consistency is enforced.

## Verification note
Production DB verification was performed after the test-attempt migration. Repository/build verification is separate and must not be represented as passed until the actual deployed/runtime path is checked.