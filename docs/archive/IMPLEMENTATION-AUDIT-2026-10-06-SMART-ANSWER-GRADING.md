# Smart answer grading — 2026-10-06

## Implemented

MEDBIOHIM now has one shared `AnswerGradingService` used by both normal tests and preparation sessions.

### Decision order

1. Empty answer → deterministic incorrect.
2. MCQ / multiple-choice → deterministic comparison against the immutable option snapshot.
3. Open / problem / theory / practical:
   - normalized exact match first;
   - if not exact, AI compares question + canonical answer + student's answer semantically.
4. AI returns:
   - correct/incorrect;
   - confidence;
   - short feedback;
   - model provenance.
5. Confidence below 0.65 or provider failure → `pending/error`, never silently converted to incorrect.
6. A test/preparation cannot be finalized while an answer remains `pending/error`.

## Persistence

Added to `test_answers` and `test_preparation_results`:

- `grading_status`
- `grading_source`
- `grading_confidence`
- `grading_feedback`
- `grading_model`
- `graded_at`

Existing historical answers are not regraded or rewritten.

## Runtime safety

AI calls happen outside database transactions. The database is locked only for the final persistence step, so a slow/unavailable provider cannot hold an attempt/session transaction open.

The AI prompt treats question, reference answer and student answer as untrusted data and does not execute instructions contained inside them.

## Scope

This applies to:
- normal `/tests` attempts;
- preparation / sequential / bank sessions backed by `test_preparation_results`.

MCQ scoring remains local and does not spend an AI request.

## Release verification still required

The code and production Supabase schema are updated, but a real authenticated E2E must still be run with:
- one exact open answer;
- one semantically equivalent answer with different wording;
- one materially wrong answer;
- one MCQ/multiple-correct answer;
- temporary AI-provider failure.

The final production gate must verify that the same result is persisted and returned after page reload.
