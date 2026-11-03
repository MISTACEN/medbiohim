# IMPLEMENTATION AUDIT — 2026-10-06 · PASS 16

## Scope
Test → Preparation → Question bank → Answer persistence → Finish.

## Verified live state
- test_preparation_sessions.status = in_progress | completed | abandoned.
- test_preparation_sessions.mode = full | count | sequential.
- UNIQUE(user_id,test_id,status) exists, preventing multiple sessions in the same status.
- Production does not support a cancelled preparation status.

## Already closed before this pass
- PATCH rejects question_id outside session.question_ids.
- PATCH requires session status in_progress.
- finish only reads an in_progress session and transitions it to completed.
- sequential mode uses the stored ordered question_ids and bank-progress counts persisted results.
- answer correctness for MCQ compares normalized sets of correct option labels.

## Implemented in Pass 16
### Preparation academic context
backend/config/routes/preparation.php
- preparation start now resolves the user's canonical group;
- preparation start accepts group_id;
- the test subject is resolved by UUID inside that group context;
- a test cannot start preparation when its subject is outside the selected academic context.

### Frontend propagation
src/lib/api.ts
- startPreparation now accepts groupId and sends it to the backend.

src/app/tests/preparation/[id]/page.tsx
- preparation UI reads the authenticated user's groupId;
- preparation start passes that groupId;
- automatic start waits for auth loading.

## Remaining P1
- bank-progress should use the same group/subject context explicitly rather than only the test UUID;
- preparation sessions should eventually snapshot group_id/session_id/context_version so a long-running session cannot silently outlive its academic context;
- ordinary test finish remains client-score based; server-authoritative scoring is still required;
- preparation result scoring should eventually use stable answer identifiers rather than option labels where the question schema permits it;
- question edits after a session starts need version/snapshot semantics if reproducibility of historical results is required.

## Gate
Pass 16 is partially implemented. Context enforcement at preparation start is closed; persistence/versioning and server-authoritative scoring remain open.