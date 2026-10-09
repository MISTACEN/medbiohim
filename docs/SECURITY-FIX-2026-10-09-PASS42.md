# MEDBIOHIM — trainer answer-key security fix (Pass 42)
**Date:** 2026-10-09
**Related audit:** [Functional audit Pass 41](FUNCTIONAL-AUDIT-2026-10-09-PASS41.md)

## Result
The original P1 issue is mitigated at the live Supabase Data API boundary and in source code. Full end-to-end acceptance is still pending because GitHub Actions jobs have not allocated a runner and the latest PHP deployment/browser session has not been verified.

## Live Supabase changes
Migration: database/migrations/20261009120000_secure_trainer_feed_answers.sql.

- Created public.trainer_feed_cards_public, a read-only view that exposes published cards but removes answer-bearing question fields and option keys (correct, isCorrect, is_correct).
- The view filters histology / mbh cards to active MBH group members. A trusted service_role request can use the view for server-side fallback; an anonymous SQL-editor context sees no MBH cards.
- Revoked all public/client privileges on public.trainer_feed_cards; only the safe view is granted SELECT to anon and authenticated.
- Revoked all direct client privileges on trainer_feed_answers, trainings, and training_answers from PUBLIC, anon, and authenticated. The frontend uses the PHP API/Next proxy for these flows; server-side database access remains available.
- Added public.submit_trainer_feed_answer(...), a SECURITY DEFINER RPC with fixed search_path=pg_catalog, an authenticated-user check, active-MBH-membership validation for histology cards, option validation, server-side scoring, bounded time values, and answer persistence. Execute is granted to authenticated, not anon or PUBLIC.
- Sent NOTIFY pgrst, 'reload schema' after applying the schema changes.

## Verification performed
- Live view query: 206 cards were returned before specialty filtering was added, with 0 answer fields and 0 option correctness flags.
- Live membership-context transaction: an active MBH member can see all 206 published cards through the safe view.
- The safe view's correctness-flag scan returned 0 rows with a correct / isCorrect / is_correct key.
- information_schema.role_table_grants after the change shows only SELECT on trainer_feed_cards_public for anon / authenticated; it shows no SELECT/INSERT/UPDATE/DELETE grants on the base trainer_feed_cards table and no direct write grants on trainer_feed_answers.
- Function metadata confirms owner postgres, SECURITY DEFINER, and search_path=pg_catalog; routine grants list authenticated, service_role, and postgres, not anon or PUBLIC.
- No answer rows were intentionally added or altered by the audit. A write-and-rollback scoring integration test was not completed; authenticated RPC end-to-end remains an acceptance check.

## Source-code changes
- src/app/api/v1/[...path]/route.ts: trainer feed, detail, and image fallback now read from the safe view; answer submission uses the RPC rather than client-writable table inserts. Nested question keys are removed. The API proxy also sanitizes unanswered training snapshots returned by the PHP backend.
- backend/config/routes/platform.php: PHP feed and detail responses remove answer-bearing keys; invalid option IDs are rejected; time values are bounded; explanation is returned only after answer submission.
- backend/src/Http/Response.php and backend/src/Security/TrainingPayloadSanitizer.php: common PHP response boundary strips answer keys from newly-created training questions and unanswered session snapshots, while retaining review keys for already answered/skipped questions.
- database/migrations/20261009120000_secure_trainer_feed_answers.sql: checked-in migration matches the live mitigation.

## Remaining acceptance gate
1. GitHub Actions must run actual steps (current runner failure is before checkout).
2. Verify Vercel deployed the latest frontend proxy changes.
3. Verify SpaceWeb received the PHP Response sanitizer and trainer route changes.
4. As an authenticated MBH test user, run: feed load → create training → confirm unanswered response contains no correctness flags → submit valid answer → verify correct/incorrect result and post-answer review → complete → reopen completed training.
5. As a non-MBH authenticated test user, verify histology feed and answer RPC are denied; verify public anon access cannot read the base table or write answers.
6. Verify the same behavior through direct Supabase REST/RPC and the same-origin Next.js proxy.

## Data safety
No existing training records, trainer cards, questions, or answer rows were deleted or rewritten. The source table retains correct-answer flags for trusted server-side grading; the public view and unanswered API payloads omit them.