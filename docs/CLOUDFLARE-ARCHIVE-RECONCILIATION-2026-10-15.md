# MEDBIOHIM — reconciliation of Cloudflare archives and legacy backend

**Audit date:** 2026-10-15  
**Repository:** `MISTACEN/medbiohim`, branch `main`  
**Purpose:** safely reconcile the uploaded Cloudflare variants against the current repository, the older PHP backend, and live Supabase state. This is an audit record, not a production cutover approval.

## Decision summary

- Treat the current GitHub `main` as the code baseline; use the PHP archive as a behavior/contract reference, not as a wholesale replacement.
- Do not replace the current Worker entry point with either archive's `src/index.js` without a route-by-route diff. The entry points have different import sets and feature surfaces.
- Do not adopt Cloudflare R2 from the older Cloudflare archive. The selected architecture is Supabase for relational data/auth/RLS, private Upstash Blob for active media, Backblaze B2 for archive/originals and migration fallback, and Upstash Redis for short-lived metadata cache only.
- Do not print, commit, or copy credentials from the PHP archive. Its environment/config files are not a source of deploy secrets.
- Keep the current frontend/API routing and legacy PHP fallback unchanged until authenticated end-to-end acceptance succeeds.

## Inputs reviewed

1. `medbiohim-cf-push.zip`: only `src/index.js` (125,662 bytes). It imports 27 local modules which are not included in this ZIP, so the archive is not a self-contained Worker package. Its imports and route implementation must be checked against the current source modules before applying.
2. `medbiohim-cloudflare-api 2.zip`: alternate Worker package with a different 37-module entry-point surface, additional admin/domain handlers and a separate test suite. It is not a drop-in replacement for the current `integrations/cloudflare-api/` tree.
3. `medbiohim-migration-audit 2.zip`: useful route and PHP comparison notes, but its own status statements are historical and must not override current GitHub/Supabase observations.
4. `public_html-31(1).zip`: legacy PHP reference archive. It contains 1,088 entries and about 162 MB uncompressed. The two PHP copies inside are not identical; they must not be copied over each other wholesale.

## Verified contradictions and blockers

### Alternate Worker archive tests

The local test run of `medbiohim-cloudflare-api 2.zip` produced **58 passed / 1 failed** (59 tests total), contrary to its `LOCAL-STATUS.md` statement of 56/56 passing.

- Failing suite: `gradeSupabaseSubmission`
- Failing case: `grades a submission for teacher role`
- Test: `test/homework-mutations.test.js`, assertion near line 202
- Failure: expected `true`, received `false`

This failure must be fixed and the full suite rerun before considering individual modules for porting. It is not evidence that the same feature is broken in the current GitHub implementation; the archive is a different code variant.

### Storage provider mismatch

The alternate package's `wrangler.toml` and `CUTOVER.md` configure `FILES_BUCKET` as Cloudflare R2 and instruct creating R2 buckets. That conflicts with the selected MEDBIOHIM architecture. Do not copy its R2 configuration or switch storage providers. Preserve Blob-first delivery for active media, B2 as archive/fallback, and Redis as metadata cache only. Do not cache binary files, credentials, or answer keys.

### PHP archive is a reference, not a deployment candidate

The audit notes record 191 successful PHP syntax checks and one parse error in the root copy at `src/Repositories/HomeworkRepository.php:22`: an SQL timezone literal is not escaped inside a PHP single-quoted string. The older `spaceweb_upload` counterpart differs and lacks the `due_date` expression. The current GitHub backend contains the escaped literal. Do not deploy the broken archive copy or replace the deployed PHP tree wholesale.

### Training RPC history

The repository contains several dated iterations of the histology-training lifecycle, including an earlier parallel set of RPC names and a later cleanup migration. The migration history in live Supabase includes the lifecycle, score-persistence, reconciliation, and duplicate-RPC cleanup versions. A live read-only catalog check confirms the canonical `histology_training_list/create/get/answer/complete/cancel` functions exist as SECURITY DEFINER functions. The lifecycle RPCs grant execution to `authenticated` (and service role); private helper functions are not granted to authenticated users. The live `trainings` and `training_answers` table grants returned for client roles did not include direct table access; postgres/service_role retain table privileges.

This is a positive schema-level check, **not** proof of successful authenticated UI flows. Next acceptance must verify that a user can create/resume/answer/finish/cancel their own training, cannot access another user's training, and never receives correct-answer metadata before answering.

## Integration rules

1. Keep `main` as the source of truth; do not overwrite current files with the alternate archive just because its docs claim completeness.
2. For every proposed code change, compare the current route contract, PHP handler, current Worker module, alternate module, Supabase schema/RPC/grants, and relevant tests.
3. Preserve existing route methods/status codes, ownership checks, RLS, safe error envelopes, and frontend response shapes.
4. Keep all secrets in Cloudflare/Supabase secret stores. Never copy archive `.env` values into GitHub, Vercel frontend variables, or this report.
5. Do not change production traffic, DNS, Vercel Production environment, Telegram webhook, or SpaceWeb fallback during source reconciliation.
6. Run the current repository test suite and Wrangler dry-run after any Worker code change. Mock tests alone do not approve cutover.
7. Update `ROADMAP.md` and `PHASES_STATUS.md` only with verifiable completion states; distinguish source implemented, tests passed, live authenticated acceptance, and production cutover as separate gates.

## Next work order

1. Diff the `cf-push` entry point against current `integrations/cloudflare-api/src/index.js`; classify each route change as additive, conflicting, or regressive.
2. Reconcile the alternate package's modules selectively. Fix its failing teacher-grading test in the isolated copy first; do not port its entire entry point.
3. Compare the legacy PHP contracts for schedule/homework, materials/downloads, trainer media, and admin flows against current Worker handlers.
4. Finish authenticated lifecycle acceptance for histology training and private media delivery; verify actual Blob objects and the 206-card source-key mapping before declaring media migration complete.
5. Keep production cutover gated until Worker build/tests, storage delivery, RLS, frontend canary, and rollback path are all verified.

**Status:** source reconciliation started; no production routing cutover approved by this audit.
