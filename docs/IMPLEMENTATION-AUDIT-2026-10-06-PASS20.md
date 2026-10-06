# IMPLEMENTATION AUDIT — 2026-10-06 — PASS 20

## Test / preparation API contract audit

### Closed
- Test detail exposes labels and allow_multiple, not correct flags.
- Test start response no longer exposes test_attempts.question_snapshot.
- Test finish response no longer exposes test_attempts.question_snapshot.
- My attempts/history SELECT explicitly excludes question_snapshot.
- Preparation start/resume responses no longer expose session.question_snapshot.
- Preparation GET session response no longer exposes question_snapshot.
- Preparation PATCH save response no longer exposes question_snapshot.
- Preparation finish response no longer exposes question_snapshot.
- Preparation GET exposes correct answer/options only for completed sessions.
- Preparation AI review uses stored answer_snapshot + immutable session snapshot.
- Multiple-choice answers continue to use JSON arrays on the client/server boundary.

### Progress/history contract
- test_attempts terminal state is submitted.
- /progress counts submitted as finished.
- progress test-history DB failures no longer become HTTP 200 empty history.
- group-scoped test history uses test_attempts.group_id, not subject/schedule inference.

### Legacy trace found
backend/src/Services/ProgressService.php still contains an older service-key based aggregation implementation. No runtime call to ProgressService::forUser was found in the repository search; platform.php only imports the service. It remains a cleanup candidate, not an active source of truth.

## Remaining gate
- PHP syntax verification in target/repository environment.
- Next.js TypeScript/build verification after Pass 20.
- SpaceWeb runtime smoke.
- Frontend test/preparation browser smoke.

Detailed previous pass: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS19.md.