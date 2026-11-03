# Security fix — recursive trainer answer sanitization (Pass 45)

Date: 2026-10-10  
Repository: `MISTACEN/medbiohim`  
Scope: PHP/Next source and regression tests; no production database writes.

## Finding

The trainer sanitizers removed known answer fields from the top-level question and options, but the PHP route helper and Next.js proxy did not uniformly walk arbitrary nested objects/arrays. A future payload shape could therefore reintroduce answer-bearing fields under an unanticipated nested key.

## Changes

- `backend/src/Security/TrainingPayloadSanitizer.php` exposes `sanitizeQuestion()` and recursively removes answer/explanation/correctness keys.
- `backend/config/routes/platform.php` delegates to the shared sanitizer instead of maintaining a second, less-general recursive closure.
- `src/app/api/v1/[...path]/route.ts` now recursively traverses nested objects and arrays, removing answer-bearing keys at every depth and still removing preparation name/organ/captions from unanswered question snapshots.
- `backend/tests/TrainingPayloadSanitizerTest.php` adds a deeply nested correctness-field assertion. The PHP test now contains 15 assertions across pre-answer sanitization, post-answer review preservation, media path preservation, and unrelated endpoint isolation.

## Verification

- The repository class/test contents were mirrored into an isolated PHP 8.4 CLI test directory. PHP syntax checks passed and all 15 assertions passed.
- Read-only Supabase inspection found 206 published cards and zero nested answer-bearing fields anywhere inside the stored `question` JSON outside the known top-level/options shape; the recursive key-path scan returned no unexpected nested paths. This is a data-shape spot-check, not a substitute for end-to-end role testing.
- GitHub Actions still fails before any step (`runner_id=0`, `steps=[]`), so the committed workflow tests have not run in GitHub.
- Latest observed READY Vercel deployment `6687e057` includes the Pass 45 Next.js sanitizer source. Browser/runtime behavior is still unverified.
- PHP changes are not confirmed deployed to SpaceWeb.

## Acceptance gate

1. Run the committed PHP regression test and full PHP lint in GitHub Actions.
2. Confirm a Vercel READY deployment includes the Next.js sanitizer change.
3. Confirm SpaceWeb has the shared PHP sanitizer and route delegation.
4. Test MBH and non-MBH accounts against feed, detail, image, submit, and post-answer review.
5. Inspect actual pre-answer network payloads for answer keys at every nesting level.
