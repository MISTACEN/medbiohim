# Production route and histology media audit — 2026-10-19

Read-only production smoke tests plus deployment/source checks. Route fallback and admin parity changes are on `main` at commit `8c010cdd70e648967951d97539ee8bcb95da7002`.

## Deployment and health

- Canonical Worker: `medbiohim-api`, production version 81 created at 2026-10-19T12:49:01Z.
- GitHub deployment workflow: [run 39254961127](https://github.com/MISTACEN/medbiohim/actions/runs/39254961127) — success.
- Smoke workflow: [run 39254961228](https://github.com/MISTACEN/medbiohim/actions/runs/39254961228) — success.
- `GET https://medbiohim.vercel.app/api/v1/health` returns HTTP 200 and identifies `service=medbiohim-api`, `mode=production`, `env=production`, `supabaseConfigured=true`, `redisConfigured=true`, `openaiConfigured=false`.

## Fallback regression

The previous Hono middleware returned a new shadow response after `await next()` without replacing Hono's already-finalized `c.res`. A minimal Hono reproduction returned the original local 501 even when a mock service binding returned another response.

Fixed by assigning the service-binding response to `c.res` (and doing the same for the 502 error response). The updated Worker deployed as version 80, then version 81 with the admin route parity changes. A live GET to a path with no canonical route now returns the shadow's `ROUTE_NOT_MIGRATED` response rather than the canonical `ROUTE_NOT_IMPLEMENTED`, proving that the 501 fallback executes. This does not imply that every route exists in shadow; it proves response replacement now works.

## Admin route registration smoke

Unauthenticated production requests to all newly added routes returned 401 `UNAUTHORIZED`, not 501. This confirms route registration and auth middleware, not successful authenticated data access:

- GET `/admin/community`, `/admin/homeworks`, `/admin/materials`, `/admin/problem-center`, `/admin/db/audit`
- POST `/admin/homeworks`, `/admin/content/archive`, `/admin/content/move`, `/admin/problem-center/work`, `/admin/db/audit/:id/rollback`
- PATCH `/admin/community/:id`, `/admin/problem-center/work/:id`, `/admin/question-reports/:id`
- DELETE `/admin/community/:id`, `/admin/homeworks/:id`, `/admin/materials/:id`
- PUT `/admin/site`

The student-facing protected routes `/auth/me`, `/academic/state`, `/planner`, `/settings/account`, `/settings/telegram/status`, `/schedule`, `/subjects-catalog`, and `/community/posts` also return 401 when no token is supplied, which is expected.

**Authenticated student/admin end-to-end flows were not run:** no test session/token was available. No account, homework, post, material or other application data was created or changed by smoke testing.

## Histology image delivery — blocker

Supabase read-only query found 206 published trainer cards for `subject_slug=histology`, `specialty_slug=mbh`: 178 preparation cards and 28 electronograms.

Every card's public image route was checked through the real Vercel → canonical Worker path:

| Result | Count |
|---|---:|
| HTTP 200 image bytes | 0 |
| HTTP 404 | 206 |
| Other/error | 0 |

The Upstash Blob object-list operation also rejected its listing credential with “token rejected”. Therefore the current key-to-object mapping is not verified and none of the 206 images is confirmed reachable. The 404s may be caused by absent objects, stale/wrong object keys, or a public bucket/base URL mismatch; the listing failure prevents distinguishing these cases. Do not mark the atlas restored and do not delete the database cards. Recovery requires a valid bucket credential plus an object inventory/hash comparison or a safe re-upload of the original media.

## Build/check status

- Worker package `npm run check`: typecheck and all 35 tests passed locally after the admin routes were added.
- Cloudflare production deploy and smoke workflows passed.
- Frontend code-check run initially failed on a stale literal-string assertion in `scripts/predeploy-audit.mjs`, although the actual cache behavior correctly bypasses caching for `presigned`, `upstash-blob`, and any `expires_in>0` URL. The audit assertion has been updated to test the actual implementation and was verified locally with `npm run predeploy:audit` (pass with warnings; existing React lint warnings and no local PHP CLI remain).

## Remaining verification

1. Run authenticated student and admin journeys with a dedicated test account/session.
2. Restore a valid Upstash Blob token and reconcile all 206 cards against object keys, MIME types and hashes.
3. Validate admin create/update/rollback operations with a test account against staging/test rows before declaring full UI/data parity.
