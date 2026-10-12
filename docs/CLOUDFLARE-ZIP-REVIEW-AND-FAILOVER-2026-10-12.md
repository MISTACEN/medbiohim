# Cloudflare API ZIP review + failover test mode — 2026-10-12

## Summary

The uploaded `medbiohim-cloudflare-api.zip` is useful as a feature-rich candidate source, but it should not replace the existing shadow Worker or be deployed wholesale without corrections. The original package run passed **58/58** (the included `LOCAL-STATUS.md` had a stale 56/56 count). After correcting schema mismatches and adding router-level cases, the reviewed package passes **65/65** on Node.js 22.16.0. These tests use mocked upstreams and still do not prove live RLS, real R2 storage, or public HTTP delivery.

## Verified blockers found

1. **Role lookup mismatch.** Read-only inspection of the live Supabase `public.user_roles` schema shows only `user_id` and `role_id`; role codes live in `public.roles.code`. Several original ZIP modules (`src/domain.js`, `src/files.js`, `src/homework-mutations.js`, `src/presence.js`) requested `select=role` from `user_roles`. That column does not exist in the observed live schema. The reviewed ZIP artifact now uses the caller-scoped embedded relation `roles(code)` and normalizes the returned role shape. Do not add a duplicate role column or loosen RLS to work around schema assumptions. This ZIP-side fix has not yet been integrated into all checked-in Worker modules.
2. **R2 is not enabled on the Cloudflare account.** The Cloudflare API returned error 10042: “Please enable R2 through the Cloudflare Dashboard.” The existing bucket `medbiohim-files` could not be verified and the active Worker currently has no `FILES_BUCKET` binding. Uploads/downloads cannot be considered ready. Do not point this code at B2 through a public browser URL or expose object credentials.
3. **Histology binary delivery intentionally stays on SpaceWeb.** The ZIP's `histologySpacewebOnly()` returns a typed 503 boundary; it does not stream the original binary from SpaceWeb. This is acceptable only if the Vercel proxy safely falls back to the HTTPS SpaceWeb origin for those GET requests.
4. **Auth rate-limit bindings are required.** Login and signup deliberately return 503 until Cloudflare rate-limit bindings are provisioned. This is fail-closed behavior, not successful auth migration. Never remove the guard or substitute an in-memory isolate counter for a real limit.
5. **Academic RPC migration is not applied.** `database/20261012_public_sync_my_academic_state.sql` remains a candidate file. No database migration or live policy was changed in this work; reconcile it with the actual remote migration history and inspect the existing SECURITY DEFINER function before considering an apply.
6. **Live integration acceptance is still missing.** The reviewed package now has 65 passing tests, including 7 router-level cases covering shadow health/ping, missing routes, unknown paths, CORS and method handling. These do not show that all routes work against the active Worker bundle, real user permissions, R2 storage, test attempts, or media.

## Failover test mode added in GitHub source

- New server-only configuration: `CLOUDFLARE_API_ORIGIN` and `MEDBIOHIM_CF_FIRST`. The flag is opt-in and defaults to disabled, so this commit does not itself change application traffic.
- When explicitly enabled in Vercel Preview, the proxy attempts Cloudflare first with a bounded timeout. Eligible failed reads may use the legacy SpaceWeb fallback. Explicit `ROUTE_NOT_MIGRATED` responses also fall back because the Worker did not execute the route.
- Generic write failures are not retried automatically: an upstream may commit a write and then lose its response. A narrowly allowlisted `STORAGE_NOT_CONFIGURED` result from the upload route is also eligible for fallback because that Worker code returns before writing bytes or file metadata.
- Fallbacks carrying credentials are permitted only to an HTTPS `SPACEWEB_API_ORIGIN`; the new fallback path refuses plaintext HTTP origins.
- Browser diagnostics are requested only from the `/admin` section. The server independently validates the Supabase bearer token and checks the canonical DB role relation; only an `admin` can receive transport-source response headers. The admin control center displays the last observed route/fallback. Client-provided role names and editable `user_metadata` are not used to authorize diagnostics.

## Current limits

- The live Vercel Preview environment was **not** switched to Cloudflare-first mode; no Vercel environment variables were edited.
- The active Worker is not proven to match the latest GitHub tree: the Cloudflare content endpoint returned only `src/index.js` and `src/supabase-auth.js`, while the latest repository source imports other modules. No full Worker deploy was done.
- External HTTP smoke tests could not be completed in this session because the test runtime could not resolve the Worker hostname. A green runtime test is not claimed.
- GitHub Actions has historically failed before steps start; no successful CI run is claimed from this work.
- No production route/custom domain, DNS, frontend API base, Supabase schema/policy, R2 setting, or Telegram webhook was changed.

## Next order

1. Fix ZIP role reads to use `roles(code)`; add route-level tests that import and call the Worker router, not only helpers.
2. Reconcile all new imports against the current repo and deploy bundle.
3. Reconcile the SQL RPC candidate with remote migration history; do not apply it by guesswork.
4. Enable R2 manually only if the user wants to use Cloudflare storage; then create/verify the bucket and configure a private binding. Until then, uploaded files stay on their existing storage route.
5. Restore GitHub Actions runner execution and run the whole set on the exact commit.
6. Configure `CLOUDFLARE_API_ORIGIN` and `MEDBIOHIM_CF_FIRST=true` in **Preview only**, after the Worker bundle is current. Compare real student read routes, unauthenticated and unauthorized cases, and fallback behavior. Leave Production flag disabled until acceptance.
7. Do not route authentication, test submissions, schedule edits, homework writes, Telegram, admin, or private media entirely to Cloudflare until the corresponding contract + RLS + rollback checks pass.


## Re-test and reviewed artifact — 2026-10-12

- Local Node.js run after schema corrections and router tests: **65 tests passed, 0 failed**; JS syntax checks passed for the source and test files.
- The reviewed ZIP artifact contains fixes for role lookup in `domain.js`, `presence.js`, `homework-mutations.js`, and `files.js`; the homework group membership selector now uses the actual `role_in_group` column; response fixtures were updated to match PostgREST's embedded `roles(code)` relation.
- Added 7 router-level tests and updated `CUTOVER.md`/review notes to mark the archive **not cutover-ready** while R2, rate limiting, live RLS and deployment-bundle mismatches remain.
- This is a corrected downloadable candidate package, not proof the same files are deployed or fully merged into `integrations/cloudflare-api` on GitHub.
- Latest GitHub Actions inspection: all four recent workflows on commit `31cbdf6929bdf04778ac6361dd0ff555c830f0f0` failed before any steps; the inspected jobs had `runner_id=0`, no runner name and an empty steps array. The workflow has been extended to run the Worker suite once runners execute, but no successful CI result exists yet.
