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


### Ticket-bank recovery — 2026-10-17

- Found another source-sync defect: 260 published organic-chemistry exam prompts were already in `exam_questions`, but their slug was the legacy alias `organic_chemistry` even though their `subject_id` pointed to the canonical semester-3 chemistry subject. The idempotent migration `20261017160000_canonicalize_organic_chemistry_ticket_bank.sql` aligned the slug without changing question text, answers, IDs, or RLS. The canonical chemistry ticket catalog now exposes **280 published questions** (260 legacy source questions + 20 canonical questions); none of the 260 duplicate the canonical 20 by text.
- Found the reason subject ticket tabs were empty: the frontend called `GET /tickets`, which reads the empty legacy `tickets` table, while the actual bank metadata lives in `ticket_banks` and ticket questions live in `exam_questions`. Added authenticated `GET /tickets/banks` and `POST /tickets/generate`; generation uses published, ticket-eligible questions under the bank's subject scope and does not return answers in exam mode. Practice mode may reveal the stored answer. The frontend now loads `/tickets/banks`.
- Live-data-derived bank counts: chemistry 280; physiology 8; histology full bank 366, med/ped source subset 16, situational cases 57, preparation questions 19. The legacy stomatology ticket bank currently has 0 matching published exam-question rows; its source-backed questions were not fabricated. The 178 stomatology/preparation images remain available in the separate trainer/media catalog.
- After this pass: Worker typecheck and tests pass **20/20**; frontend typecheck passes; Next.js production build passes with bounded worker concurrency. The new ticket-bank API code is now confirmed in the active Cloudflare Worker production deployment (version 28 at 100% traffic); the live script contains both `/tickets/banks` and `/tickets/generate`. The GitHub Actions deployment workflow itself still fails because `CLOUDFLARE_API_TOKEN` is empty, so future automatic deploys remain blocked. Vercel's live `X-Medbiohim-Build` header is still `31370e44...`, which predates the frontend helper change to `/tickets/banks`; the updated ticket UI is not yet confirmed live. Authenticated end-to-end verification remains pending.


### Latest rollout gate — 2026-10-17 21:22 UTC

- Cloudflare production Worker is on active version 28 at 100% traffic. Its deployed script was inspected and contains the canonical subject-scope fix for tests plus the new `/tickets/banks` and `/tickets/generate` handlers.
- Production Worker health remains `supabaseConfigured=true`, `redisConfigured=false`, `openaiConfigured=false`. The Redis REST token and OpenAI API key still need to be configured in Worker secrets; no credential values are in source control.
- Vercel production still advertises build `31370e44...`, which predates the frontend change from `/tickets` to `/tickets/banks`. The connected Vercel API returned 403, and the prescribed CLI fallback failed with “You do not have access to the specified account.” No further deploy retry was attempted. The latest frontend change is therefore **not confirmed live**.
- Local verification after ticket-route work: Next.js production build passes, frontend TypeScript passes, Worker typecheck passes, and Worker tests pass 20/20. Authenticated end-to-end ticket generation and the new frontend helper still need production verification after Vercel access is restored.


## Continued restoration pass — 2026-10-17

- Applied and committed `database/migrations/20261017153000_restore_physiology_subject_plan.sql`: the complete 18-week physiology plan from the SpaceWeb `data/subject_plans.json` source is now in `curriculum_items`, preserving lecture/practice text, dates, colloquium notes and stable source keys. No existing rows were deleted.
- Applied and committed `database/migrations/20261017160000_restore_histology_detailed_plan.sql`: restored the detailed 18-week MBH histology plan from `data/subject_plans/histology-semester3-2026-2027.json`, including lecture topics, exact dates and preparation lists. Old generated schedule rows from the incomplete derived import were retained but deactivated; the user's grade/credit row was not changed.
- Updated the subject plan card to render the plan description, study guidance and histology preparation list instead of silently hiding it.
- Live Supabase verification after migration: histology has 18 restored plan rows, 206 trainer/atlas cards, 80 materials and 9 published tests; physiology has 18 restored plan rows, 2 published tests and 15 published question-bank items; organic/physical chemistry has 37 active curriculum rows and 22 published tests. Histology and chemistry test banks contain the source-backed sets already imported from the archive.
- Worker API typecheck and all 20 Node tests pass; frontend `tsc --noEmit` passes. A full Next.js build has not been re-run in this pass.
- Deployment remains the blocker: GitHub Actions deploy logs show `CLOUDFLARE_API_TOKEN` is empty, so Cloudflare Worker deploys cannot run from CI. Latest visible Vercel production deployment is still on commit `4e49160551c7b3b9616c7ca7329d946e1a1e145e`; the latest frontend plan-description change is not confirmed live. The source/data restoration is complete in GitHub + Supabase, but must not be called fully live until Vercel and Cloudflare deployments are verified.


## Validation update — 2026-10-17

- Re-ran a clean frontend production build after removing the previous `.next` output: **Next.js build completed successfully**, generated all 44 static pages and route manifests. Existing ESLint warnings remain; no build error remained on the clean run.
- Worker validation: TypeScript check passes and all 20 Node tests pass. Frontend `npx tsc --noEmit` passes.
- Vercel deployment remains blocked by permissions, not source compilation: creating a production deployment returned HTTP 403 (`You don't have permission to create a Production Deployment for this project`). The latest production deployment still points to `4e49160551c7b3b9616c7ca7329d946e1a1e145e`; commits after it, including the study-description renderer, are not verified live.
- Cloudflare CI deployment remains blocked because `CLOUDFLARE_API_TOKEN` is empty in GitHub Actions. The authenticated Cloudflare connector can inspect the account, but deploying over the live Worker without preserving its secret bindings would risk breaking production; no direct replacement upload was attempted.
- The `.vercel-redeploy-trigger` marker was updated on `main` to request a Git-integrated build. No newer production deployment was visible at the last check.


### Root cause of blank subject tabs — 2026-10-17

- Found the primary UI contract mismatch behind the blank subject header/plan: Cloudflare `GET /subjects/:id` returns the subject row directly, while the frontend only read `response.data.subject`. That left `subject` undefined and skipped all follow-up requests for plan, tests, ticket banks, materials, and progress. The subject page now accepts both the direct Cloudflare shape and the wrapped legacy SpaceWeb shape, merging the catalog row as a fallback.
- Added a regression assertion for this response-shape mismatch. Latest local verification after the fix: Worker typecheck/tests pass 20/20, frontend typecheck passes, and a clean Next.js production build passes.
- This fix is committed on `main`; production Vercel still reports the older `31370e44...` build, so the repaired subject page cannot be considered live until Vercel deployment access is restored.


## Subject page contract fix — 2026-10-17

- Found and fixed the root response-shape mismatch on the subject tests page: Cloudflare's `GET /subjects/:id` returns the subject row directly, while the page only read `data.subject`. It now accepts the direct row and legacy wrapped shapes.
- Added workload fields (`control_type`, credits, total/lecture/practice/self-study hours) to the subjects catalog response, so the page can still show the academic load if it must fall back to the catalog.
- Added a regression test for direct subject responses, workload fields and visible plan descriptions. Worker typecheck passes and all 21 tests pass.
- Rebuilt from a clean `.next` directory after these UI changes: the full Next.js production build succeeds and generates all 44 static pages. Existing lint warnings remain.
- Vercel's direct production-deployment API returned HTTP 403. The Vercel CLI fallback was checked but is logged out and has no credentials in the build environment. No credentials were requested in chat or added to source.


## Continued pass — full subject-plan contract and RLS-safe access (2026-10-17)

- Recovered why the Cloudflare subject page can lack the full SpaceWeb plan: `curriculum_items` contains lecture rows, while the original `site_content` plan JSON retains lecture + practice + weekly histology preparations. Direct student reads of `site_content` remain denied by design.
- Added/applied the narrow `medbiohim_get_student_subject_plan` RPC. It is restricted to the supported plan slugs and returns the matching active subject's name, course, semester, control type, hours and credits together with the original weekly JSON.
- Verified live function privilege flags: no `anon` execution, `authenticated` execution allowed, empty function `search_path`; confirmed existing `site_content` policies remain unchanged.
- Updated `integrations/cloudflare-api` to call the RPC first, forward `course`/`semester`, normalize the chemistry slug alias, and keep the curriculum fallback. Updated `workers/api` to use the same scoped RPC contract. Updated the subject UI to recover missing metadata and display per-week micro-preparations/electronogram markers.
- Added regression tests for RPC response shape, filters, preparation data and unchanged RLS intent. CI on `faa36cf1f5501064fac762a29a5e48c1684bd952` passed: API Worker suite 391 tests / 0 failures, Next.js production build passed, optional integrations checks passed. This does not establish live authenticated end-to-end success.
- Deployment remains blocked/unverified according to the latest inventory: `CLOUDFLARE_API_TOKEN` was empty/missing in Actions; Vercel production deploy API returned HTTP 403. No production routing or DNS change was attempted.

### Acceptance gate

1. [x] CI: `MEDBIOHIM code checks` and optional integrations checks passed on the latest source commit in this pass; API Worker suite reported 391 tests / 0 failures.
2. Use a legitimate signed-in MBH student session to verify HTTP 200 and the complete histology/physiology/chemistry plan shape, including hours, credits, control, lecture, practice and preparations.
3. Deploy through the authorized integration only after CI and authenticated smoke checks pass; verify the live Worker version and frontend deployment before describing the screenshot issue as fixed.
4. Continue comparing PHP versus Cloudflare routes one domain at a time; do not replace the canonical Worker with the alternate archive wholesale.


## Additional pass — tests and question-bank API parity (2026-10-17)

- PHP `GET /api/v1/tests/{id}` returns `test` and `questions`; Cloudflare's former handler returned only metadata even though the current frontend reads `detail.data.questions` and `detail.data.test.title`. Updated the canonical source route to restore the envelope.
- Question detail returns only published, non-archived questions sorted by `test_questions.order_index`. Ordinary attempts omit the answer key and correctness flags from options; the explicit bank view retains answers for study mode.
- Added subject-specialty access checks to test lists/details, actual subject-name metadata, course/semester validation, and the fail-closed unknown-slug behavior.
- Added source-level contract assertions. **No fresh successful CI run for this exact route commit is established**: the reported Action runs have zero jobs, and Vercel check is failing.
- Inspected the live Cloudflare bundle read-only: scoped subject-plan RPC marker is present, but the latest `stripOptionCorrectness`/bank-view handler is not. Therefore the tests fix is committed to `main`, not yet confirmed deployed.
- Deployment status remains blocked: latest visible READY main frontend deploy is `a1b197...`; the later subject-page fix `5220d5...` has no matching Vercel deployment. Attempt to create a Preview returned HTTP 403 permission denied; prior Vercel status references the build-rate-limit gate. No production alias, DNS, or table policies were changed.

### Updated acceptance order

1. Obtain an authorized Vercel deploy path without changing or bypassing project protections.
2. Run a fresh Worker typecheck/test job on current `main`; keep answers excluded from normal test mode.
3. Publish the canonical Worker and frontend, then verify them through the normal authenticated app session.
4. Only then mark the screenshots resolved; continue route-by-route PHP parity after subjects, tests, tickets and histology media.

## Live re-check — 2026-10-17 01:02 UTC (supersedes earlier secret/deploy observations)

- Cloudflare account inventory confirms `medbiohim-api` and `medbiohim-api-shadow` still exist. The canonical `medbiohim-api` now has a bound `UPSTASH_REDIS_REST_TOKEN` secret (secret value is not stored in Git). Cloudflare created deployment `e3468edf-484d-4551-837d-3c5be7402ce4` at `2026-10-17T00:59:10Z`, with version `9c3a033c-5a68-440e-89e6-07d57b22dbf5` receiving 100% traffic. This deployment was triggered by the secret binding update; it is not proof of full API acceptance.
- Upstash Redis `medbiohimcache` answered PING and passed a temporary SET/GET/TTL/DEL check; the test key was deleted. 21 pre-existing `mbhdeploy:v1:*` keys were preserved. Do not confuse those old deployment stamps with active cache contents.
- Private Upstash Blob bucket `medbiohim-files` currently lists 358 objects under `histology/`. Object count is not a hash-level parity check and does not prove every published card points to a valid object.
- Supabase migration `files_upstash_blob_provider_20261017` was applied and recorded as `20261017005831`; the `files_storage_provider_check` constraint now allows `upstash_blob`.
- Latest live counts: 80 published materials, 206 trainer cards with 0 `source_file_id` links, and 1 row in `files`. Trainer card ↔ object mapping remains an explicit blocker.
- The newest three workflow runs for `apply-p0-academic-crud.yml`, `apply-p0-embedded.yml`, and `apply-p1-ui-schedule-db.yml` failed on push. Their failures must be diagnosed before those workflows are retried; do not treat their presence as successful schema/UI synchronization.
- All work remains on `main`; SpaceWeb stays frozen. Authenticated production smoke tests were not run, so do not declare full end-to-end parity or a production cutover.
