# IMPLEMENTATION AUDIT — 2026-10-06 · PASS 17

## Scope
Test → Attempt → Answer persistence → Server-authoritative scoring → Historical reproducibility → Preparation context.

## Live database verification
- Added test_attempts.group_id, session_id, context_version, question_snapshot.
- Added test_preparation_sessions.group_id, session_id, context_version, question_snapshot.
- Added test_preparation_results.answer_snapshot.
- Added unique (attempt_id, question_id) for test_answers.
- Existing active preparation sessions were backfilled into the current academic context.
- Verified active preparation sessions now have group, academic session, context version and question snapshot.
- Production currently has 0 ordinary test attempts with snapshots because no ordinary attempts existed at the migration point; new attempts will snapshot automatically.
- test_answers currently has 0 rows; the new API will populate them before finish.

## Implemented

### 1. Ordinary test answers are persisted server-side
- New POST /api/v1/tests/attempts/{id}/answers.
- Server validates that the question belongs to the attempt's immutable question snapshot.
- Answer correctness is calculated from the snapshot, not from the client.
- (attempt_id, question_id) is upserted, making retries safe.

### 2. Ordinary test finish is authoritative
- TestRepository::finishAttempt() ignores client score/max_score.
- Final score and max score are calculated from persisted test_answers and the attempt snapshot.
- Existing terminal attempts remain idempotent for the same stored result and reject conflicting rewrites.

### 3. Answer keys are no longer sent by the normal test detail endpoint
- Normal /tests/{id} questions no longer expose q.answer.
- Correct option flags are stripped.
- Client receives labels plus allow_multiple.

### 4. Attempt snapshot
At test start the backend stores:
- question id;
- subject/module/topic;
- question type/text;
- authoritative answer;
- option definitions and correctness;
- group/session/context version.

Editing a question after an attempt starts therefore cannot rewrite the historical answer key for that attempt.

### 5. Preparation snapshot/context
Preparation sessions now store:
- group_id;
- academic session_id;
- context_version;
- immutable question snapshot.

Existing active preparation sessions were backfilled because they predated the context fields.

### 6. Bank progress
Bank-progress now accepts group_id and resolves the test subject through the same academic context before calculating progress.

### 7. Preparation answer-key leakage
Preparation question responses no longer expose answer/correct flags while a session is in progress. is_correct/score are returned only for completed sessions.

## Remaining P1
- Preparation result rows can additionally store a normalized answer snapshot on write; the schema field is ready, but the route should populate it consistently on the next pass.
- Ordinary test frontend still sends answers one-by-one in parallel; batching can reduce latency later.
- Written/free-text grading remains exact normalized matching; human/AI review is a separate future contract.
- Full PHP/TypeScript/build/runtime verification against SpaceWeb is still required after these changes.
- Progress aggregation still needs final academic-session semantics.

## Gate
Pass 17: implementation closed for the core test scoring invariant; runtime verification remains.
