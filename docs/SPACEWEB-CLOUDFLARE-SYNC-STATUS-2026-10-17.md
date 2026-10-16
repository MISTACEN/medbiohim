# MEDBIOHIM — SpaceWeb → Cloudflare synchronization status

**Audit date:** 2026-10-17  
**Branch:** `main`  
**Scope:** source, deployed Worker versions, API route parity, and histology media. This is not a production cutover approval.

## Current deployment reality

Cloudflare account inventory was checked live. The account contains:
- `medbiohim-api` — active production-named Worker; last modified `2026-10-16T12:54:28Z` during this audit.
- `medbiohim-api-shadow` — migration scaffold; `productionTrafficEnabled:false`; last modified `2026-10-16T15:12:56Z`.
- `medbiohim-telegram` and `medbiohim-telegram-test` — separate Telegram Workers.

Unauthenticated health checks returned HTTP 200 for both API Workers. The production API health payload reported `redisConfigured:false` and `openaiConfigured:false`; these integrations are not confirmed ready in the active runtime.

**The published Workers are not yet synchronized with the latest repository commits.** The GitHub Actions deployment job successfully completed dependency installation, TypeScript checking and the Worker tests, but the deployment step failed because `CLOUDFLARE_API_TOKEN` was empty/unavailable in Actions. Do not claim a code deploy until the Worker modified timestamp and post-deploy smoke tests confirm it.

## Source checks completed

| Check | Result |
|---|---|
| `workers/api`: TypeScript | PASS |
| `workers/api`: node tests | 11/11 PASS |
| `integrations/cloudflare-api`: node tests | 390/390 PASS |
| Frontend Cloudflare/SpaceWeb failover contract | 9/9 PASS |
| Migration Worker Wrangler dry-run | PASS; 823.54 KiB total / 137.79 KiB gzip |
| Full local predeploy audit | PASS with one environment warning after setting `CIRCLE_NODE_TOTAL=2`; TypeScript and Next.js production build succeeded. PHP CLI is unavailable in the sandbox, so PHP syntax is verified by CI instead. |
| PHP syntax in CI | PASS on commit `d8753b7c5b518279b79985313eb67b3e7bb3ec3b`; latest code-check rerun for the predeploy worker-limit adjustment is pending |
| Production Worker deployment | BLOCKED: missing GitHub Actions secret `CLOUDFLARE_API_TOKEN` |
| Authenticated production API smoke tests | NOT RUN: no test user session supplied |

The source tree now includes settings/account, profile, password, identity link/unlink, and academic-state handlers. Before the latest source is deployed, the published API returned 501 for `GET /api/v1/settings/account`, `GET /api/v1/settings/telegram/status`, `GET /api/v1/settings/preferences`, and `GET /api/v1/files`. `GET /api/v1/academic/state` returned 401 without a bearer token, which is the expected unauthenticated behavior. These results describe the old deployed version, not the current source tree.

## Histology media: counts do not yet prove parity

The connected private Upstash Blob bucket `medbiohim-files` currently lists 358 objects under `histology/`, totalling 432,658,572 bytes.

The uploaded SpaceWeb archive `public_html-31(1).zip` contains 416 files under `spaceweb_upload/content/histology/`, totalling 146,911,169 bytes.

These are different snapshots/trees and their counts and byte totals differ. It would be incorrect to state that exactly 58 files are missing: a path-normalized SHA-256 comparison has not been completed, and some Blob objects may come from the earlier local archive. No bulk overwrite or deletion was performed. The correct next step is to generate a source manifest (relative path, size, SHA-256), export the Blob object list, compare normalized paths, and upload only verified missing/changed files. Keep the bucket private and preserve the existing metadata-to-object-key mapping.

Cloudflare R2 is not enabled on this account. The selected storage plan remains Supabase for relational data/auth, private Upstash Blob for active media, Backblaze B2 for archive/originals where configured, and Upstash Redis for short-lived cache only. Do not switch to R2 as an accidental consequence of merging the older archive.

## Code-source reconciliation

The alternate archive `medbiohim-cloudflare-api 2.zip` is not a drop-in replacement for `integrations/cloudflare-api/`. It contains additional modules such as `admin-questions.js`, `admin-lectures.js`, `admin-package.js`, `domain-staff.js`, `preparation.js`, `telegram.js`, and `homework-mutations.js`, but also has a different router surface and storage assumptions. Do not replace the canonical entry point wholesale. Port missing PHP contracts into the current `workers/api` route structure or the migration Worker only after route-by-route parity and RLS review.

## Required next actions

1. Configure the GitHub Actions repository secret `CLOUDFLARE_API_TOKEN` with a least-privilege token that can edit Workers for this account. Do not commit the token or put it in frontend variables.
2. Let the deployment workflow install, typecheck, test and deploy `workers/api`; verify the live Worker modified timestamp and health.
3. Run authenticated smoke tests for settings/account, profile/preferences, academic state, schedule, homework, file metadata/download, and training lifecycle. Check real read-after-write behavior, not only HTTP 200.
4. Generate and compare path/hash manifests for the SpaceWeb histology tree and private Blob objects. Upload only the exact missing/changed objects and verify each upload.
5. Reconcile remaining PHP-only/admin routes one by one. Keep HTTP SpaceWeb as a forbidden credentialed fallback; only HTTPS legacy origins are eligible for safe read fallback.
6. Keep production traffic and Telegram webhook configuration unchanged until the above acceptance gates pass.



## 2026-10-17 follow-up — Supabase admin directory and group schema

The live database contains users/groups/membership records. The blank group selector and incomplete user directory were caused by schema mismatches in Worker queries plus RLS policies that only allowed each user to read their own `users` and `user_roles` rows.

- Worker routes now use `group_memberships.role_in_group` and `groups.course_number`; nonexistent `groups.course`, `groups.semester`, `group_memberships.role`, and membership `updated_at` fields were removed from the affected paths.
- Applied migration `20261016160523_admin_user_directory_rls`, which grants admin-only SELECT/UPDATE on `public.users` and admin-only SELECT/INSERT/DELETE on `public.user_roles`. RLS stays enabled; normal users retain their self-only policies.
- Admin endpoint now reports role/membership query errors instead of silently omitting those data. The admin page surfaces API errors for group/subject/user loads.
- Checks: Worker TypeScript + 13 tests pass; frontend failover 9 tests pass; migration Worker 390 tests pass; predeploy audit passes with warning because PHP CLI is unavailable in the runner; Worker deploy dry-run passes.
- Production deployment is still blocked by the missing/empty GitHub Actions secret `CLOUDFLARE_API_TOKEN`. The code fix is in `main`, but must not be described as live until deployment and authenticated read-after-write smoke tests succeed.

## Follow-up update — Telegram account linking and validation

- Added `workers/api/src/routes/telegram.ts` and mounted `POST /api/v1/telegram/account-link/confirm`. The endpoint validates the Telegram webhook secret, validates payload shape and token format, hashes the raw token, and calls a server-only RPC. Raw tokens and secrets are not logged.
- Added authenticated settings endpoints `GET /api/v1/settings/telegram/status`, `POST /api/v1/settings/telegram/link-start`, and `POST /api/v1/settings/telegram/unlink`. Link tokens are generated with 24 random bytes, stored as SHA-256 hashes through an authenticated RPC, and expire after ten minutes. The database RPC rate-limits creation to five tokens per user per 15 minutes.
- Applied the additive Supabase migration `telegram_account_linking_rpc_20261017`. Live verification confirms both Telegram tables have RLS enabled; anon/authenticated have no direct table SELECT/INSERT privileges; authenticated can execute only the user-scoped status/create/unlink RPCs; webhook confirmation RPC is executable by `service_role` only. No account-link rows were created. Direct no-auth probes returned `unauthorized`, and an invalid token returned `invalid`.
- Added the canonical confirmation URL to `integrations/telegram-bot-cloudflare/wrangler.toml`. The endpoint is not yet live because the canonical Worker and Telegram Worker source are still awaiting deployment.
- Latest local checks: `workers/api` TypeScript + 15/15 tests pass; `integrations/telegram-bot-cloudflare` tests 14/14 pass; legacy Telegram bot tests 15/15 pass; migration Worker tests 390/390 pass; frontend failover tests 9/9 pass; histology importer tests 6/6 pass. Optional integrations CI passed after the importer path fix. Next.js production build passes with `CIRCLE_NODE_TOTAL=2`; the full predeploy audit reports PASS with one warning because PHP CLI is not installed in the sandbox. GitHub PHP syntax CI passed after fixing three malformed PHP string/backslash cases; latest API CI rerun is pending.
- Deployment remains blocked until the repository Actions secret `CLOUDFLARE_API_TOKEN` is configured. The canonical Worker also needs `TELEGRAM_WEBHOOK_SECRET` set to the same value as the Telegram Worker secret; the value cannot be retrieved from Cloudflare's secret inventory. The active production health still reports Redis and OpenAI unconfigured; do not treat those integrations as live until binding checks confirm them.


## Histology importer follow-up

- Fixed `tools/import_histology_media.py` so content-archive photo paths preserve the canonical `5_Фотографии препаратов/` directory rather than silently dropping it. This aligns the importer with the expected `histology/5_Фотографии препаратов/...` keys and existing metadata references. Regression tests now pass 6/6; conflicting normalized paths still fail closed instead of overwriting.



### Latest verification
The frontend also requests `GET /api/v1/settings/preferences`; this exact route has now been added to the canonical Worker. Source checks pass: Worker 15/15, frontend failover 9/9, migration Worker 390/390, Next.js build/predeploy audit pass with the PHP CLI warning, Wrangler dry-run pass. The live Worker still returns 501 for that GET route and its latest deployment is older than the source. The deploy workflow confirms the `CLOUDFLARE_API_TOKEN` Actions secret is empty. Until that secret is set and a deployment completes, these code fixes must be treated as committed-but-not-live.


### Histology content coverage — hash-verified
Compared the 416 files in the supplied `spaceweb_upload/content/histology/` archive against the private Upstash Blob listing using each object's MD5-like ETag and exact relative path. All **234 unique source contents** are represented in Blob, and all canonical non-encoded paths match exactly. The only 144 missing path keys belong to the old literal `#U...` encoded duplicate directory; every one of those contents exists under its canonical path. A query of `trainer_feed_cards`, `materials`, `content_sources`, and `files` found zero database references to `#U` aliases. One encoded alias key has a different hash, but the expected source bytes are already present under canonical paths. No uploads, overwrites, or deletions were performed. The 58 extra `histology/source-materials/` objects in Blob are not in this archive and were preserved.

**Conclusion:** unique histology content bytes are synchronized; the object-key tree differs only for obsolete encoded aliases and additional source-materials. This content result is separate from the still-blocked Cloudflare Worker deployment needed to activate the Supabase/API code fixes.

## File metadata and admin storage routes follow-up

- Added `workers/api/src/routes/files.ts` and mounted it at `/api/v1/files`: authenticated upload writes a private Upstash Blob object and an owner-scoped `public.files` metadata row; metadata and download endpoints enforce RLS-backed file access, active group membership and the MBH specialty gate for histology-linked files. Upload cleanup removes the Blob object if signing or metadata persistence fails.
- Added strict-admin `GET /api/v1/admin/files/capabilities` and `GET /api/v1/admin/files/audit`; the audit is read-only, uses a server-only Supabase client after role verification, and reports metadata reference counts. Image processing is explicitly reported unavailable in Workers instead of pretending that PHP GD/Imagick/ffmpeg are installed.
- Local canonical Worker validation now passes TypeScript + 17/17 tests. The latest live unauthenticated probe returns `401 UNAUTHORIZED` for `GET /api/v1/files/{id}` and `GET /api/v1/admin/files/audit`, confirming the protected routes are mounted. Authenticated metadata reads, uploads and audit contents remain unverified.
- The live `files_storage_provider_check` currently permits only `b2`, `spaceweb`, `external`, and `unknown`. An additive migration to permit `upstash_blob` is present in the repo but was not applied; until that schema gate is changed, uploads store the allowed provider value `unknown` while retaining an explicit `users/<id>/...` Upstash object key. No attempt was made to bypass the constraint.

## Latest live Worker smoke (unauthenticated, 2026-10-17)

- `GET /api/v1/settings/account`, `GET /api/v1/settings/preferences`, `GET /api/v1/settings/telegram/status`, and `GET /api/v1/academic/state` return `401 UNAUTHORIZED` without a bearer token, confirming these protected routes are mounted.
- `POST /api/v1/telegram/account-link/confirm` returns `503 BOT_NOT_CONFIGURED`, confirming the confirmation route is mounted but `TELEGRAM_WEBHOOK_SECRET` is missing on the API Worker.
- `GET /api/v1/files/{id}` and `GET /api/v1/admin/files/audit` return `401 UNAUTHORIZED` without a bearer token, confirming the protected routes are mounted. Authenticated data-level checks are still pending.
- Health remains `200`; it reports `redisConfigured:false` and `openaiConfigured:false`. Cloudflare binding inventory shows the production API has `UPSTASH_REDIS_REST_URL` and `SUPABASE_SERVICE_KEY`, but no `UPSTASH_REDIS_REST_TOKEN` or `TELEGRAM_WEBHOOK_SECRET`. The Telegram Worker has `TELEGRAM_WEBHOOK_SECRET` and the correct confirmation URL. Copy the same Telegram secret into the API Worker; do not paste it into chat.
- The latest deployment job passed all 17 Worker tests and then failed at Wrangler because `CLOUDFLARE_API_TOKEN` is empty in GitHub Actions. The live script contains the Telegram RPC and storage-audit code signatures, but automated redeployment is still blocked and full source/runtime parity is not independently proven.

## SpaceWeb deployment note

- The existing `deploy-backend.yml` run failed during FTP site-root discovery: none of the candidate roots contained the expected `backend/public/index.php`. No deployment was performed. I did not guess a different remote path or upload files to an unverified directory.
- This means the old SpaceWeb deploy automation is also not currently a verified sync path. Cloudflare should remain the target runtime, and SpaceWeb should remain fallback-only until its exact remote root is confirmed. The source and archive manifest must be compared before any legacy media copy.


## 2026-10-17 — recovery of subject learning content

- Recovered original SpaceWeb archive sources from `public_html-31(1).zip`; this is source-grounded restoration, not newly invented course content.
- Fixed subject-plan lookup for duplicate subject slugs: it now accepts the selected course and semester and returns a `weeks` view compatible with the subject page. The frontend requests the canonical `chemistry_organic_physical` slug and renders returned plan items.
- Fixed the subject test catalog to resolve the selected active subject by slug/course/semester, exclude archived tests, and include linked question counts.
- Restored the 18 original semester-3 organic/physical chemistry schedule entries from `data/curriculum_master.json` into `curriculum_items` with their lecture, lab/practice and study guidance. These rows are tagged with stable `metadata.legacy_key` values to keep the migration idempotent.
- Restored the 2 original physiology multiple-choice tests (blood and circulation) with all 7 source questions and answer options. Restored the original 8 open physiology ticket prompts to both the exam-ticket catalog and ordinary question bank; their answers remain blank because the source archive had no answers.
- Live Supabase post-migration counts: physiology question bank 15 published items (8 restored open prompts + 7 MCQ items), exam-ticket prompts 8, tests 2, linked test questions 7; chemistry semester-3 curriculum has 37 active items, including 18 specifically tagged restored archive rows.
- Histology still has published atlas/trainer and material data in Supabase. The 17 `histology_lectures` records are empty `written_lecture_stub` rows with no body text, so they were deliberately not published as if they were real lectures.
- Worker API typecheck and 18/18 tests pass. Frontend `tsc --noEmit` passes. Next.js production build compiles and passes type/lint checks but the build worker then exits with `spawn ... EAGAIN` during static page generation in this execution environment; this is an environment resource failure, not a confirmed successful full build.
- Production deployment and authenticated end-to-end UI verification remain pending; do not mark the live site as restored until the Cloudflare deploy gate is resolved and the pages are checked with an authenticated session.


## Deployment gate after subject-content recovery

- Latest source commit: `2457178c528d36ba119952c5e57ffeb548148ee1` on `main`.
- GitHub source packaging and smoke workflows pass; the Worker code-check workflow is still running at last check. Cloudflare deployment workflows fail because `CLOUDFLARE_API_TOKEN` is missing/empty.
- The latest visible Vercel production deployment is still on commit `b5b2ca908210a96fce78aa92c365e051fd60a0fa`; the Vercel connector denied creating a new production deployment with HTTP 403. Do not claim the latest frontend fix is live.
- To finish the user-visible restoration, Vercel project deployment permission / Git integration must be restored, and the Cloudflare deploy token must be configured in GitHub Actions. No secrets should be pasted into chat.


## Follow-up recovery pass — 2026-10-17

- Restored the archived **«Химическая кинетика»** test for organic/physical chemistry from `data/legacy/tests/mc/orgchem-chem-kinetics.json`: 5 original MCQ prompts and their original options/answers. The migration is idempotent by `source_key`.
- Restored the full 67-question histology embryology collection. The source archive contains 96 cytology questions, 67 embryology questions, and a 163-question mixed collection. The 96-question cytology test and 163-question mixed test were already present; the older 20-question embryology test was incomplete. It now links to all 67 source entries, mapping 8 duplicate-hidden rows to exact published counterparts with identical text and options rather than inventing or changing answers.
- Supabase verification after the changes: histology test links = 96 cytology + 67 embryology + 163 mixed, with all linked questions published; the separate legacy histology tests and 206-card trainer remain intact. Chemistry now has 22 published semester-3 tests, including the restored 5-question kinetics test. Physiology retains 2 tests with 7 MCQ questions plus 8 open ticket prompts in both the exam-ticket and question-bank catalogs.
- Upstash Blob bucket `medbiohim-files` is private and contains 357 actual objects under `histology/` (432,658,572 bytes; the extra listed key is only the folder marker). All 206 published histology trainer-card image paths were checked against the bucket: **206/206 resolve to an existing object key**. Histology also has 80 published materials with inline content. The 17 empty histology lecture stubs remain unpublished; they were not presented as complete lectures.
- Fixed subject test catalog scoping: the Worker now returns canonical subject slug/course/semester metadata, and both subject pages query and match tests by canonical scope. This addresses the duplicate-slug / mismatched-subject-ID case that could make a populated subject appear to have no tests.
- Fixed constrained-runner build fan-out with `experimental.cpus: 1`. Verified locally in the connected repository environment: Next.js production build passes; frontend `tsc --noEmit` passes; `npm run predeploy:audit` passes with one expected warning that PHP CLI is not installed; API failover tests pass 9/9; Worker typecheck and tests pass 19/19.
- Current main includes these fixes. **Production rollout is still blocked, not complete:** Cloudflare deployment workflow fails because GitHub Actions `CLOUDFLARE_API_TOKEN` is empty; Vercel's deployment API returned HTTP 403 for production deployment creation. No secret values were added to source. Until those permissions/secrets are corrected and an authenticated smoke test runs, do not claim the new frontend/Worker code is live.


### Live Cloudflare/Upstash check — 2026-10-17

- Public Cloudflare API health returns HTTP 200, `mode=production`, and `supabaseConfigured=true`.
- The same health response currently reports `redisConfigured=false` and `openaiConfigured=false`. The Worker secret-name audit shows `UPSTASH_REDIS_REST_URL` exists but `UPSTASH_REDIS_REST_TOKEN` and `OPENAI_API_KEY` are absent. Other model-provider secrets exist, but the OpenAI Platform key is not configured on this Worker.
- Upstash Redis database `medbiohimcache` exists and is active on the free tier. The missing Worker secret is the remaining connection step; no credential was copied into source or printed in logs.
- Cloudflare currently has a deployed production version, but the GitHub deploy workflow cannot reproduce that deployment until its Actions token is configured. Vercel project/deployment access also returns permission errors from the connected integration. Treat these as external deployment/configuration gates, not completed rollout.
