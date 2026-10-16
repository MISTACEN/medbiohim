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
