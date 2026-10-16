## Verified legacy archive migration pass — 2026-10-14

- New upload `public_html-31(1).zip`: ZIP integrity check passed; 1,088 entries; 162,345,152 uncompressed bytes; SHA-256 `3697cc5ba99b6cbc0c157cd40614cbf4b807227d77e6364f21f5dcf18c264b68`.
- Syntax checked 192 PHP entries across the archive's root copy and `spaceweb_upload`: 191 passed; one root-copy parse error at `src/Repositories/HomeworkRepository.php:22`. Its SQL timezone literal is not escaped inside the PHP single-quoted query string. The separate `spaceweb_upload` counterpart is older and omits the `due_date` expression; the current GitHub `backend/src/Repositories/HomeworkRepository.php` contains the escaped SQL literal. Root and deployed-folder route registries differ, so do not replace either copy wholesale.
- **SRS migration:** ported the legacy service to `integrations/cloudflare-api/src/srs.js`, covering `GET /srs/summary`, `POST /srs/ensure`, `GET /srs/due`, `GET/POST /srs/cards`, `POST /srs/review`, and `DELETE /srs/cards/{id}`. Reads and writes use the authenticated caller JWT and explicit `user_id` scoping, with the live Supabase RLS policies remaining authoritative.
- **Binary material compatibility route:** added `GET /api/v1/materials/{id}/file`; it resolves the material through the existing authorization-checked B2 signing helper, streams content without returning the signed URL, and supports a single byte range. It safely fails when mappings, credentials or upstream file access are unavailable.
- **Latest Worker gate:** Cloudflare Build `67d6a594-2b6b-4474-bbef-c63e87e0714e`, source commit `bc3b6aef2371f352395fb704099d86bec9295276`, `npm test` **297 passed / 0 failed**, Wrangler dry-run passed, deploy command completed; deployed Shadow Worker version `d0e5d5cd-637e-4fb0-a866-c551c1b941ba`. This does not mean the new flows passed authenticated live-user acceptance or that the physical files are present.
- Archive `.env` values were not printed, committed, or installed. No Vercel Production, DNS or PHP production-routing cutover was performed.
- Remaining gates: run signed-in SRS acceptance against live Supabase/RLS; verify B2 signer and real material objects; upload/reconcile the legacy archive and 206 histology mappings; keep Upstash Blob primary for active media and Redis cache-only; fix the archive-only PHP syntax defect before anyone deploys that root tree.

---

## Storage architecture — 2026-10-14

Four services have distinct roles: Supabase is the relational source of truth and enforces RLS; private Upstash Blob bucket `medbiohim-files` is the primary application delivery store for active binary media; Backblaze B2 is retained as the existing large-archive/original-source store and migration fallback; Upstash Redis `medbiohimcache` is only a short-lived metadata cache. Do not add Cloudflare R2 or another storage provider unless the user changes this decision again.

The Worker source has Blob and Redis adapters and a Blob-first/B2-fallback trainer image path. Live readiness remains blocked: Blob bucket was last observed empty; Worker secrets `UPSTASH_BLOB_TOKEN` and `UPSTASH_REDIS_REST_TOKEN` are not confirmed installed; B2 credentials/bucket contents and end-to-end signing must be verified without exposing secret values; 206 MBH trainer cards still require verified object/key mapping; no signed-in real AI generation or end-to-end media/RLS acceptance is confirmed. Do not enable production cutover on the basis of source code or mock tests alone.

A temporary Upstash Box test environment was created, but its repository clone failed because authenticated GitHub credentials were unavailable inside that box. No production settings, keys, schema, or traffic routing were changed in that attempt.

---

## Latest verified checkpoint — 2026-10-14 (after account/training/textbook route port)

- 🟢 Cloudflare Worker build/deploy passed: commit `bd787c12cd324c66dfcf5260b5753e74b8b60f0b`, version `f27f713e-e1cc-44ad-95b3-266f64a7885c`, **276/276 tests passed**.
- 🟢 Public `medbiohim.vercel.app/api/v1/health` returns the Worker `mode: shadow` response. This confirms Vercel's current API proxy routes to the Shadow Worker even though the Worker is labelled shadow; don't assume the PHP API is the active path.
- 🟢 Added current frontend routes for account settings, GET training list, and histology textbook listing/private download. Public smoke checks without a bearer token return 401 rather than 501. Signed-in runtime behavior still needs E2E verification.
- 🟢 Applied `public.user_preferences` in Supabase with RLS and owner-only CRUD policies; the repo migration filename matches applied version `20261013171940`.
- 🟡 Private B2 textbook listing/streaming has mock-backed tests, but actual files were not found in the checked Supabase Storage or Upstash Blob inventories. Missing PDFs fail explicitly, not as empty success. Training POST/detail/answer/cancel/complete still need parity.
- 🔴 Trainer media incident remains open: 206 published MBH cards have no `source_file_id`; `files` has only one deleted stub. Preparations use `histology-photo-…` hash keys but `preparation.imagePath` original JPEG names; electronograms use `electronograms/images/*.png`. Verify/upload real objects and finish key mapping before calling the 236 historical image 503s fixed.
- 🟡 Five server-side AI provider secret bindings exist, but no signed-in real generation has been verified. `UPSTASH_REDIS_REST_TOKEN` and `UPSTASH_BLOB_TOKEN` remain missing from Shadow and must be added through the Cloudflare Dashboard. Redis remains metadata cache only.
- 🟡 Supabase security advisor flags the sanitized trainer view as SECURITY DEFINER, four authenticated SECURITY DEFINER RPCs, and disabled leaked-password protection. Review grants/RLS before semantics-changing remediation.
- 🔒 No extra branch created. No Vercel env, DNS, or custom-domain setting was changed by this pass; live Vercel health confirms the existing public API proxy is already forwarding to Shadow. Audit: [UPLOAD-ARCHIVE-AND-VERCEL-LOG-AUDIT-2026-10-14.md](docs/UPLOAD-ARCHIVE-AND-VERCEL-LOG-AUDIT-2026-10-14.md).

---

## Verified state — 2026-10-14: AI execution + Upstash storage/cache implementation pass

- 🟡 AI send endpoint has a provider execution path on `main` (Groq/Mistral/OpenRouter, region-gated Gemini and GigaChat OAuth), caller-JWT data access and fallback among configured providers. **Not verified by successful Worker Build/tests or live provider calls yet.**
- 🟡 Added private Upstash Blob adapter; trainer-image path can prefer Blob then use B2 fallback and can use canonical MBH `source_key` while metadata backfill is pending.
- 🟡 Added optional Upstash Redis REST cache for sanitized per-user trainer metadata, TTL 15 seconds. Image bytes and answer keys are not cached.
- 🔴 **Current shadow Worker secret inventory:** the Cloudflare API lists only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. No `B2_KEY_ID`, `B2_APPLICATION_KEY`, `UPSTASH_BLOB_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, or AI provider secret is configured.
- 🔴 **Required secrets remain uninstalled**: `UPSTASH_BLOB_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, B2 keys and AI provider keys. The secret-transfer attempt was blocked by connected security controls; no secret values were changed.
- 🔴 Upstash Blob `medbiohim-files` is private and empty; 206 published cards still have `source_file_id IS NULL`. The latest known Worker deployment predates these commits; Vercel status remains `build-rate-limit`. No production route/DNS cutover.
- Details: [audit report](docs/UPLOAD-ARCHIVE-AND-VERCEL-LOG-AUDIT-2026-10-14.md).

## Verified state — 2026-10-14: legacy secrets and storage split

Evidence report: [docs/UPLOAD-ARCHIVE-AND-VERCEL-LOG-AUDIT-2026-10-14.md](docs/UPLOAD-ARCHIVE-AND-VERCEL-LOG-AUDIT-2026-10-14.md).

- 🟢 Shadow Worker secret bindings saved for Supabase URL/anon key, Backblaze B2, and AI providers Groq/Gemini/GigaChat/Mistral/OpenRouter. Secret values remain out of GitHub. Supabase service-role/secret DB keys were deliberately excluded.
- 🟡 Live AI generation and real object download remain unverified. Cloudflare's latest observed 100% shadow deployment predates the secret update; check runtime consumption before treating providers as working.
- 🔴 206 published histology cards still have no `source_file_id`. Actual object existence in B2 is unverified. Upstash Blob is private and empty; its token is not configured.
- 🟡 Upstash Redis `medbiohimcache` is active in `eu-west-1`; 21 `mbhdeploy:v1:*` keys were preserved. Redis REST-token setup was blocked; no Redis runtime cache is wired yet.
- **Storage boundaries:** Supabase owns metadata/RLS, private B2 or Upstash Blob owns binary media, Redis is for metadata/cache only (not image bytes).
- 🔒 No production Vercel API mode, DNS, Supabase schema/RLS, or production Worker cutover was changed.

## Verified state — 2026-10-14: uploaded archive and production console log

Evidence report: [docs/UPLOAD-ARCHIVE-AND-VERCEL-LOG-AUDIT-2026-10-14.md](docs/UPLOAD-ARCHIVE-AND-VERCEL-LOG-AUDIT-2026-10-14.md).

- 🟢 **Archive test run:** 58 tests passed, 0 failed. The ZIP contains no populated runtime `.env` or usable test provider credentials; test Supabase URLs are fixtures. Do not replace the current Worker code with the older archive wholesale.
- 🟡 **Secret bindings:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` exist on `medbiohim-api-shadow`, but secret values were not read and no credential synchronization was applied.
- 🔴 **Production browser log:** 247 × 503 and 3 × 501 records. 236 × 503 are trainer image requests. Remaining 503s affect progress, subjects catalog, search, subject plan, tickets, lectures and tests.
- 🔴 **Shadow Auth telemetry:** 2026-10-13 14:37 UTC captured Supabase Auth fetch timeout (configured project host and HTTPS checks passed); older login events were redirect-classified. Root cause remains open pending a controlled runtime probe and Supabase Auth log correlation.
- 🔴 **Trainer-media DB audit:** the live database has 206 published histology cards (178 preparations, 28 electronograms); all have a source key/path, but none links to `files` via `source_file_id`, while `files` contains only one row. The current signer intentionally returns `503 MEDIA_NOT_MIGRATED` in this state. Active Worker has no B2 credentials; a metadata/binary migration plus B2 secret setup is required.
- 🔴 **501 routes:** `histology/source-materials`, `trainings`, `settings/account` need contract comparison and implementation/restore.
- 🟡 **Storage:** R2 API says R2 must be enabled through Dashboard. The archive's Cloudflare R2 binding is not equivalent to Backblaze B2. No storage configuration was changed.
- 🟡 **Non-secret Worker config:** `B2_BUCKET = "medbiohim-files"` was committed to `integrations/cloudflare-api/wrangler.toml` (`c0057bc9e1a1c569ba4e0f08c32aa1867dfb41de`). The resulting Cloudflare Build/deployment is not yet verified; B2 secret values were not set.
- 🔒 **Production unchanged:** no production Vercel settings or routing, DNS, Supabase schema/RLS, Cloudflare secret values, or production Worker was modified.

## Verified state — 2026-10-14 (latest shadow rollout)

- 🟢 **Admin login:** user confirmed admin UI access works on the account with the existing admin assignment.
- 🟢 **Calculator route family:** the 8-calculator PHP catalog/formulas are implemented in the Worker with authentication, payload bounds, validation, and tests.
- 🟢 **AI history/metadata family:** provider status and conversation list/create/detail/delete routes are implemented with verified bearer auth, caller JWT, owner filters and RLS; the provider CHECK constraint and migration filename are reconciled with the live applied migration.
- 🟢 **Verification:** Workers Build for `7db8224aa6dab6ea538f5995e0566be69fbc8265` passed and deployed Worker version `0f2871b2-abeb-4e38-940f-a5d1225b816b` at 100% of `medbiohim-api-shadow`.
- 🟡 **AI message execution:** intentionally not migrated; POST returns a non-success 501 after authentication because provider-secret bindings, routing/fallback, rate limiting and real-provider E2E remain unverified.
- 🟡 **Schedule/subjects/academic state/presence and trainer image timeout:** not yet closed. Review fresh telemetry from the current Worker version; old events must not be represented as current errors.
- 🔒 **Shadow only:** production still uses the existing production path. No production API cutover was performed in this phase.

## Latest verified state — 2026-10-14

- 🟢 **Admin access fixed and owner-confirmed:** the `@hotmail.com` account now enters the admin interface. The existing DB role assignment was retained; no extra admin role or self-service role-write path was added.
- 🟢 **Calculators migrated in Cloudflare shadow:** catalog, detail, and compute handlers are present; the implementation mirrors the PHP calculator service (8 calculator types), preserves response structure, requires a verified bearer token, caps JSON payloads, validates inputs, and keeps calculation results stateless.
- 🟢 **Build validation:** Workers Build for commit `f987acce68925af18cf5dee25e9185e4401a43b0` completed successfully. Build logs show calculator tests and route auth/method-guard tests passing. Wrangler dry-run is part of the configured build.
- 🟡 **AI routes remain unmigrated:** `/api/v1/ai/providers` and conversation routes still need full contract/security porting; a 501 from the shadow Worker means the route has not been migrated, not that Supabase necessarily failed.
- 🟡 **Other API failures remain open:** re-check fresh logs for subjects, academic state, schedule and presence to separate RLS/data-shape issues from redirects/upstream/network errors. Do not assume earlier failures are fixed solely because diagnostic logging changed.
- 🔒 Production remains on the legacy/SpaceWeb path. Shadow verification is not acceptance of production traffic, and no Supabase RLS/schema, production routing, DNS or production environment was changed in this pass.

### Current release gate — 2026-10-13, Cloudflare Shadow verified

- 🟢 **Latest confirmed Shadow build:** source commit \`4effc4e59f2e1cccad4166f4e306e218f0ee344b\`; Cloudflare Build \`d35cdff6-696c-476a-8b8a-e3e058fb4c8f\`; outcome \`success\`; Worker version \`0c4d9644-7122-4b16-92f7-3670614b0e52\`. A duplicate build for the same source also succeeded.
- 🟢 **Worker gate:** \`npm test\` **231 passed, 0 failed**; Wrangler 4.149.0 dry-run passed; Shadow deployment completed. This is the current checked source count; older roadmap entries with 134/135/225 tests are historical snapshots.
- 🟢 **Verified deployed read/write paths:** materials listing/detail/source metadata; trainer feed/detail and answer submission through the existing scoring RPC; personal notes/favorites; lecture mini-quiz read/check; published-question report submission; scoped file metadata and private download handler; material file-URL and trainer image handlers.
- 🟢 **Test attempts are not disabled:** the live Supabase migration \`secure_test_answer_review_20261013\` is applied. Start/save/finish use the narrow \`medbiohim_start_test_attempt\`, \`medbiohim_save_test_answer\`, and \`medbiohim_finish_test_attempt\` RPCs, not direct table writes. The RPCs are SECURITY DEFINER with authenticated execution and guarded attempt ownership/snapshot behavior. No real student token was used in this pass; browser/user acceptance remains separate.
- 🟡 **File downloads remain configuration-gated:** current Worker settings contain no \`B2_*\` secrets/bindings. File metadata is scoped and download code fails closed if private B2 signing is unavailable. Do not describe real downloads as verified until B2 secrets and live file/object-key mappings are securely configured and tested.
- 🟡 **Legacy files:** \`GET /api/v1/materials/{id}/file\`, \`GET /api/v1/histology/source-file\`, and \`POST /api/v1/files/upload\` are still open migration items. Worker cannot read SpaceWeb's local filesystem; migration requires an inventory + checksum-verified copy, plus private B2 upload/access handling.
- 🟡 **Frontend/Preview:** Preview and browser parity must be rechecked against this Worker version before switching the frontend mode. Vercel Production remains on the legacy backend; its health endpoint previously returned \`503 INSECURE_BACKEND_ORIGIN\`. No Production variables, DNS or traffic route were changed here.
- 🔒 **Production is unchanged:** no Cloudflare production cutover, Vercel Production deployment, Supabase schema/RLS mutation, B2 secret write, or Redis resource creation was performed. No valid student JWT was supplied, so live user RLS/media smoke tests remain outstanding.



## API migration — Pass 19: authenticated curriculum read — 2026-10-13

- 🟢 Added `GET /api/v1/curriculum` to the Cloudflare Worker. It mirrors PHP `ContentStore::listCurriculum()` by returning `{items}` from the existing caller-JWT/RLS-aware subject-list helper. It does not require the optional `site_content.curriculum` JSON document, so a missing CMS document cannot make this route fail unlike the broader subject catalog.
- 🟢 Added the route to the authenticated GET contract tests and method-guard tests.
- 🟢 Exact-source verification after the change: `npm test` **136 passed, 0 failed**; Wrangler 4.149.0 `npm run build` dry-run passed (213.39 KiB, 31.53 KiB gzip). Bindings show login/registration limiter enforcement still defaulted off.
- 🟡 Not yet confirmed: Cloudflare's auto-build/deployment for this latest source commit, and real authenticated RLS/response comparison. No live data result is claimed.
- 🔒 No production routing change. Auth login/registration and test-attempt writes remain fail-closed. Do not treat mock limiter tests as a live 429 proof.

---

## Frontend route-parity audit — 2026-10-13

- 🟢 Re-read current `src/lib/api.ts` and Worker router from `main`; recorded a prioritized caller-family gap matrix in `docs/CLOUDFLARE-API-ROUTE-INVENTORY-2026-10-12.md`. It explicitly corrects stale historical statements that the shadow Worker is not deployed, and keeps production cutover prohibited.
- 🔴 Large route parity gap remains. The frontend uses more API calls than the Worker has handlers: file uploads/downloads, homework create/submit, planner/attendance, community, settings/Telegram linking, mini-quiz/check/reports, trainer feed/answer, academic state/sync/AI plan, notes/favorites, preparation attempts, tickets/materials, group/subject mutations and most admin routes remain cutover blockers.
- 🔒 Do not fill those gaps by forwarding to the legacy HTTP origin or by using a Supabase service-role key as a shortcut. Each route needs exact verb/payload/response compatibility, caller JWT ownership/group checks, RLS/schema verification and tests.
- 🟢 Current fetched Worker source snapshot: `npm test` 135/135; `npm run build` Wrangler dry-run passed. This is the exact run performed in this pass; prior inventory notes mentioning 139 tests refer to a different snapshot and are not being represented as the same run.
- 🔴 Auth limiter still lacks a reproducible live 429 proof; login/registration gate stays off. Test-attempt writes stay blocked. Vercel Production remains unchanged.

---

## Exact-source verification pass — 2026-10-13

- 🟢 Retrieved the current `main` versions of all Worker source modules, all six test files, `package.json`, and `wrangler.toml` through GitHub and staged them in a disposable Node box for verification. This pass used the current source SHAs from `main`, rather than the older mixed test tree noted in previous history.
- 🟢 `npm test`: **135 tests passed, 0 failed** against the retrieved Worker source.
- 🟢 `npm run build`: Wrangler 4.149.0 dry-run passed; upload estimate 212.79 KiB (31.50 KiB gzip). Output confirms the two native rate-limit bindings and the default `AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED=false` setting.
- 🟢 Cloudflare Workers Builds history now shows the latest documentation commit `7245d0c21e00af2c922ae9cf4317bacf0d26b03d` completed with outcome `success`. This verifies the build for that commit, not a production cutover.
- 🟡 An outbound live probe initiated from the Cloudflare management execution environment returned 403 for every requested worker path; this environment-level response did not provide a usable Worker HTTP status/body, so it is not counted as an application smoke-test result.
- 🔒 Auth rate limiting remains unverified: do not set `AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED=true`. The binding configuration and passing mock tests are not substitutes for a reproducible live 429.
- 🔒 Test-attempt writes remain blocked pending private answer snapshots and guarded scoring. Production remains on legacy mode; no Vercel production variables were changed.

**Next:** diagnose the native limiter's real-world threshold behavior in a controlled shadow environment; review frontend-to-Worker route parity; fix the Vercel project/team scope and legacy HTTPS health blocker before any migration cutover.

---

## Frontend API parity pass — authenticated groups read, 2026-10-13

- 🟢 Migrated and deployed GET /api/v1/groups for the frontend listGroups() consumer. Uses Supabase Auth plus caller JWT/anon-key REST read and RLS, no service-role key; the group filter/order mirrors the PHP repository (active or NULL is_active, course then code).
- 🟢 Added unit tests for caller-JWT forwarding, result shape/filter/order, RLS-denied fail-closed behavior, route authentication and method handling. Exact current Cloudflare Worker suite: 139/139 passing; Wrangler 4.149.0 dry-run build passes. Cloudflare Workers Build commit 6ea5331126d0dcb5b64817f39bfc9b80ea90088a succeeded.
- 🟡 Live shadow smoke: GET /api/v1/groups without a token returns 401; POST returns 405. No real-user JWT/RLS data-read acceptance has been performed.
- 🔴 Frontend parity audit shows remaining unmigrated API families: group mutations, file/media endpoints, community, account settings/Telegram links, presence, planner/attendance, homework creation/submission, quiz/report/trainer APIs, preparation sessions/grading, tickets/materials/lesson-plan, academic planning, notes/favorites, gradebook, and admin APIs.
- 🔒 No Vercel Production environment, Supabase schema/RLS, DNS, or Telegram webhook was changed. Login/registration and attempt mutations stay closed. Cloudflare-only cutover remains blocked until route parity and authenticated role/RLS acceptance are complete.

**Next:** finish authenticated group-read/RLS validation using a safe student and admin session, then migrate the next read-only frontend route family before any new state-changing API.

---

## Native rate-limit runtime proof + live shadow smoke — 2026-10-13

- 🟢 Rechecked the deployed main shadow Worker over HTTPS from an allowed test client: GET /api/v1/health → 200; unauthenticated GET /api/v1/schedule → 401; GET /api/v1/subjects with a deliberately invalid Bearer token → 401 UNAUTHORIZED. The earlier 502 AUTH_UPSTREAM_ERROR is no longer reproduced by the live invalid-token path.
- 🟢 Reproducibly exercised Cloudflare native rate-limit bindings in a temporary Worker that contained no Supabase credentials and did not call auth or create users. The binding configuration used the same login namespace (1001, 5/60s) and registration namespace (1002, 3/60s) as the main Worker. In 100 login probe requests, 10 returned 429; in 100 registration probe requests, 31 returned 429. Test requests reached Cloudflare locations EWR and IAD. This proves the bindings do produce a denied result/HTTP 429 at runtime, but the distribution across locations means the observed behavior must not be described as a strict global cap of exactly 5/3 requests.
- 🟢 Removed the temporary probe Worker and disabled/removed its workers.dev subdomain after testing. No temporary public probe endpoint remains.
- 🔒 Main Worker setting AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED deliberately remains false; auth routes still return 503. Rate-limit primitive verification does not make login/registration route parity ready: registration lacks PHP-compatible profile creation/default student-role assignment, and live valid-session/profile/RLS contract checks still need acceptance. Do not enable those routes yet.
- 🔒 Test-attempt start/save/finish remain blocked with 503 TEST_ATTEMPT_SECURITY_NOT_READY until private answer snapshots and guarded scoring are implemented and verified.
- 🟢 Current-source verification remains: Cloudflare Worker tests 126/126, frontend API failover tests 9/9, Wrangler 4.149.0 deploy --dry-run passes. Latest Cloudflare source bundle contains all six expected Worker modules. These local/source checks are not GitHub Actions results.
- 🔴 Production still has not switched to Cloudflare-only mode. Do not change Vercel Production settings, Supabase schema/RLS, custom domains, DNS, or Telegram webhook until authenticated reads, write authorization, route contract parity, and rollback checks pass.

**Next:** continue safe valid-session and read-only RLS acceptance for dashboard/schedule/subjects, map frontend API route coverage, and test the Vercel proxy in a separate Preview environment once its Vercel project scope is accessible. Leave the main auth gate false until the missing login/register contract and acceptance checks are complete.

---

## Full current-source verification and auth telemetry diagnosis — 2026-10-13

- 🟢 Fetched every current file under `integrations/cloudflare-api/src` and `test`, plus `package.json` and `wrangler.toml`, from GitHub `main` into a temporary isolated workspace. Ran `npm test`: **126 passed, 0 failed** (Node.js v25.9.0). This replaces older 124/124 results.
- 🟢 Ran `npm run build` in the same workspace. Wrangler `4.149.0 deploy --dry-run` passed, included all source modules, and recognized `AUTH_LOGIN_LIMITER` (5/60s) and `AUTH_REGISTER_LIMITER` (3/60s). Bundle: 205.01 KiB / 30.89 KiB gzip. It was a dry-run compilation, not by itself a deployment.
- 🟢 Cloudflare API confirms Workers Builds connected to `MISTACEN/medbiohim`, branch `main`, root `integrations/cloudflare-api`, with `npm run build` and `npx wrangler deploy`. The latest code-containing build inspected (commit `7245d0c21e00af2c922ae9cf4317bacf0d26b03d`) succeeded; active deployment is 100% on version `b7b84bbe-34ec-4043-9ffb-f08894abe261`. The active bundle has all six expected modules/markers.
- 🟢 Worker settings confirm both native rate-limit bindings are present and `AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED=false`. The switch is intentionally false; presence of bindings and a dry run do not prove live 429 enforcement.
- 🟡 Read-only Cloudflare telemetry for earlier auth attempts records `TypeError` during upstream fetch with sanitized category `redirect`; the configured URL was HTTPS and the hostname matched `gnobvyjywtqbdfeejxmf.supabase.co`. This rules out a simple project-host typo as an explanation, but does not determine the exact cause and does not validate the anon key. Never log raw errors, credentials, token values, or response bodies.
- 🔴 Fresh public HTTP smoke requests from the current isolated test environment were blocked at Cloudflare edge with error 1010 before reaching the Worker. Therefore no new health/auth endpoint status can be claimed from this pass; use a permitted test origin or Cloudflare telemetry after a controlled attempt.
- 🔒 No secret values were read, no Supabase schema/RLS was changed, and no Vercel Production variables or production traffic routing were changed. Login/registration and test-attempt writes remain fail-closed; Production remains on legacy mode.

**Next safe pass:** (1) diagnose the upstream redirect-category failure without logging raw exception detail; (2) run a controlled 429 verification from an allowed test origin while the auth gate remains fail-closed by default; (3) verify live read-only Supabase/RLS routes using an authorized test session; (4) repeat Worker route-contract and frontend proxy acceptance; only then consider Preview, never Production first.

---

## Latest state reconciliation — 2026-10-13 (supersedes older conflicting status entries)

- 🟢 Re-queried Cloudflare API for the live `medbiohim-api-shadow` script and settings. The returned bundle contains all six expected modules/markers: `index.js`, `supabase-auth.js`, `schedule-mutations.js`, `admin-schedule.js`, `test-attempts.js`, and `test-catalog.js`. This supersedes earlier entries claiming only two modules were deployed.
- 🟢 Workers Builds configuration is present and enabled for GitHub repo `MISTACEN/medbiohim`, production branch `main`, root `integrations/cloudflare-api`, build command `npm run build`, deploy command `npx wrangler deploy`. This supersedes earlier entries saying the build connection was absent. Build configuration being present does not alone prove the latest commit's build/deploy passed.
- 🟢 Live Worker settings include `AUTH_LOGIN_LIMITER` and `AUTH_REGISTER_LIMITER` rate-limit bindings, plus the two Supabase secret binding names. Secret values were not read.
- 🔒 `AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED` remains `false` in tracked Wrangler configuration. Login and registration stay fail-closed until real HTTP 429 enforcement is demonstrated. The earlier 18-attempt probe did not yield 429; do not treat the bindings' presence as proof of enforcement.
- 🔒 Test-attempt start/save/finish remain blocked by `TEST_ATTEMPT_SECURITY_NOT_READY` until private answer-snapshot storage and guarded scoring are implemented and verified.
- 🟡 This environment's outbound DNS lookup for the workers.dev hostname failed during this pass, so no fresh live HTTP response codes are claimed here. The active script bundle/settings were verified through Cloudflare API instead.
- 🔴 Production remains on legacy mode: do not change Vercel environment variables, production API routing, Supabase RLS/schema, DNS, or Telegram webhook. The Vercel production API previously returned `503 INSECURE_BACKEND_ORIGIN`; Vercel project-scope access and full route parity remain blockers.

**Next actions:** obtain a reproducible isolated rate-limit test against a disposable/shadow target without exposing login/registration; diagnose the invalid-bearer `502 AUTH_UPSTREAM_ERROR` via safe upstream status/code diagnostics; run the full Worker suite against the exact current source and verify the latest Cloudflare build record; then resume authenticated read/RLS and frontend route-contract checks. No production cutover until every gate passes.

---

## Wrangler validation and deployment gate — 2026-10-13

- 🟢 Ran Wrangler `4.149.0 deploy --dry-run` against a minimal isolated fixture using the committed TOML binding syntax. Wrangler recognized both `AUTH_LOGIN_LIMITER` (5 requests/60s) and `AUTH_REGISTER_LIMITER` (3 requests/60s). This validates the config schema and binding declaration, **not** the full application bundle.
- 🔴 Cloudflare API confirms there is currently **no Workers Builds configuration associated with** `medbiohim-api-shadow` (API error 12040). Therefore GitHub auto-deploy for this Worker is not set up/confirmed. No attempt was made to deploy an unreviewed or incomplete bundle through the live script API.
- 🔴 GitHub Actions package/smoke jobs continue to terminate before any runner step (`runner_id=0`, no runner name, no steps). The complete Worker test suite has not been run in GitHub Actions; only the isolated 9-test API failover suite and the minimal Wrangler fixture dry-run passed in this session.
- 🔒 Live Worker code and secrets remain unchanged; no production route or database permission was changed.

**Deployment acceptance criteria:** create/verify Cloudflare Workers Builds connection for repo `MISTACEN/medbiohim`, production branch `main`, root `integrations/cloudflare-api`; obtain a successful full source build; deploy to shadow; confirm deployed modules include all six source files; verify invalid bearer returns 401 (not 502), login/register are rate-limited, CORS remains strict, and read-only Supabase calls behave correctly. Keep Vercel Production in legacy mode until these pass.

## Rate-limit configuration added — 2026-10-13

- 🟢 Updated `integrations/cloudflare-api/wrangler.toml` on `main` to declare Cloudflare native rate-limit bindings matching the existing Worker code: `AUTH_LOGIN_LIMITER` = 5 requests/IP/minute and `AUTH_REGISTER_LIMITER` = 3 requests/IP/minute. Namespace IDs are separate (`1001`, `1002`); thresholds are conservative initial values.
- 🟢 Parsed the exact TOML configuration with Python `tomllib`; both bindings and thresholds validated.
- 🟢 Re-ran isolated API failover tests in the sandbox: **9 passed, 0 failed**.
- 🟡 GitHub Actions did start workflows for commit `9b2a0abb0f7917b817e0ac6ed61f876501d2269c`, but package and smoke jobs again failed before any steps with `runner_id=0`, empty runner name, and `steps=[]`. This is not evidence of a test assertion failure; CI runner provisioning remains unresolved.
- 🔴 The config is committed but has **not yet been deployed** to Cloudflare. The active Worker will still lack these bindings until a successful Wrangler/Cloudflare Builds deployment is confirmed.
- 🔴 Invalid-token auth smoke test still needs investigation: live Worker returned `502 AUTH_UPSTREAM_ERROR`. A request to update the deployed public Supabase anon-key binding was blocked by the tool safety layer, so no secret/config value was changed.
- 🔒 Production Vercel mode remains unchanged; SpaceWeb HTTP fallback remains guarded. No Supabase schema/RLS or production traffic was changed.

**Next:** resolve CI runner provisioning and complete a Wrangler validation/build for the entire Worker; deploy to the shadow Worker only, then re-test health, 401 invalid-token behavior, CORS, rate-limit 429 behavior, and read-only Supabase routes. Do not switch Vercel Production until all checks pass.

## Live Worker reconciliation — follow-up verification, 2026-10-13

- 🟢 Re-read the active Cloudflare script bundle through the Cloudflare API without exposing secret values. The live bundle is exactly **two modules**: `src/index.js` and `src/supabase-auth.js` (about 101.8 KB multipart payload).
- 🔴 GitHub `main` currently has **six Worker source modules**: `index.js`, `supabase-auth.js`, `schedule-mutations.js`, `admin-schedule.js`, `test-attempts.js`, and `test-catalog.js`. The last four are absent from the deployed bundle, confirming source/deployment drift.
- 🟡 Active Worker settings show the names `SUPABASE_URL` and `SUPABASE_ANON_KEY` as secret bindings, but their values were not read. The same settings do not show `AUTH_LOGIN_LIMITER` or `AUTH_REGISTER_LIMITER`; therefore login/register are expected to remain fail-closed with 503 until limiters are provisioned.
- 🔴 Auth smoke check remains unresolved: an invalid bearer to `GET /api/v1/subjects` returns 502 `AUTH_UPSTREAM_ERROR`, not 401. Because secret values and upstream response details were not inspected, do not assume whether the cause is the key, endpoint, or network. Re-test after controlled deploy/config verification.
- 🔒 No live Worker bundle, secret, Vercel environment, Supabase schema/RLS, DNS, Telegram webhook, or production route was changed in this verification. Vercel API runtime error lookup returned 403 (project access not available through that connector), so no runtime-log conclusion is claimed.

**Next safe action:** configure rate-limit bindings in the tracked Wrangler configuration using the documented current syntax; validate with Wrangler dry-run/build and unit tests; then deploy the complete `main` source to the shadow Worker through the connected Cloudflare Builds/Wrangler path while preserving secret bindings. Verify the deployment's module list, health, CORS, auth (401 for invalid token), login/register limiter behavior, and read-only Supabase RLS before any Vercel Preview switch. Keep Production unchanged.

## First live migration test pass — 2026-10-13

### Verified with real HTTP requests
- `https://medbiohim.vercel.app/` returned HTTP 200.
- Active Worker `https://medbiohim-api-shadow.ryazansevegor.workers.dev/health` and `/api/v1/health` returned HTTP 200 and explicitly reported `mode=shadow`, `role=migration-scaffold`, `productionTrafficEnabled=false`.
- Worker `GET /api/v1/schedule` without a bearer token returned 401 `UNAUTHORIZED` as expected.
- Worker `POST /api/v1/schedule` returned 405 `METHOD_NOT_ALLOWED`.
- Worker preflight with an unapproved origin returned 403 `ORIGIN_NOT_ALLOWED`.
- Worker unknown API route returned 501 `ROUTE_NOT_MIGRATED`.
- The active Worker currently returns 503 `RATE_LIMIT_NOT_CONFIGURED` for both `POST /api/v1/auth/login` and `POST /api/v1/auth/register`. Login/registration are therefore not ready for cutover until real rate-limit bindings are configured.
- Worker `GET /api/v1/subjects` with a deliberately invalid bearer token returned 502 `AUTH_UPSTREAM_ERROR`, rather than expected 401. This requires investigation of the live Worker Supabase Auth upstream/configuration before authenticated API acceptance.
- Vercel `GET /api/v1/health` returned 503 `INSECURE_BACKEND_ORIGIN`. Production is still on legacy mode and the current configured SpaceWeb origin appears to be HTTP; Vercel environment inventory access did not succeed during this pass, so the exact variable value is not independently confirmed. Do not set Cloudflare-only Production mode until Preview acceptance is complete.
- A direct Supabase Auth health probe reached the known Supabase host and returned 401 because the probe intentionally supplied no API key; this only confirms host reachability, not Worker credentials.

### Local tests
- Isolated Node.js run of `test/api-failover.test.mjs`: **9 passed, 0 failed**.
- This test was run against the fetched current proxy/test/helper files in an isolated temporary workspace, not against the full checked-out repository.

### CI / deployment status
- Latest inspected GitHub Actions run for code checks failed before steps started: jobs had `runner_id=0`, blank runner name and empty `steps`. The smoke workflow showed the same pattern. This is a runner/Actions execution blocker, not a demonstrated test assertion failure.
- Vercel deployment status API was inaccessible (403) in this pass; an existing deployment check had a successful Vercel status, and the live homepage responds 200. No claim that all frontend build or browser smoke tests passed.
- No production environment variables, database migrations, RLS policies, storage bindings, Telegram settings, or live Worker source were changed as part of this test pass.

### Cutover blockers (must pass before production switch)
1. Inspect/fix live Worker Supabase Auth behavior: invalid bearer must return 401, not 502.
2. Provision and verify real Cloudflare login/registration rate limiting, then test valid and invalid auth safely.
3. Deploy the exact current GitHub Worker source and verify module parity (live Worker reports migration scaffold and is not the production API).
4. Test authenticated dashboard/schedule/homework/subjects/tests using a safe test account and verify RLS.
5. Configure Cloudflare-only mode in Vercel Preview and test no SpaceWeb dependency; keep Production unchanged until all required routes and media/storage paths pass.
6. Restore GitHub Actions runner execution and obtain actual completed job steps.

## SpaceWeb exit plan — Cloudflare + Supabase only (2026-10-13)

- Decision: SpaceWeb is not a required fallback because its HTTP-only temporary URL cannot safely carry authenticated API traffic and the paid HTTPS upgrade is intentionally out of scope.
- Added an explicit server-side mode, `MEDBIOHIM_API_MODE=cloudflare`, to the Vercel API proxy. In this mode the proxy ignores any stale `SPACEWEB_API_ORIGIN`, forces Cloudflare-first routing, and fails closed if Cloudflare is unavailable. It does not retry ambiguous writes or leak bearer credentials to the retired HTTP origin.
- Default remains `legacy` until the Cloudflare Worker has been reconciled with GitHub source, tested against real Supabase RLS/auth, and accepted for the routes being moved. This commit alone does not switch production traffic.
- Target architecture: Vercel frontend/API gateway → Cloudflare Worker → Supabase. Cloudflare R2 is not assumed available; file/media storage must be migrated separately to an already-provisioned secure storage backend (existing private B2 is a candidate after its server-side bindings and access controls are verified).
- Cutover gates: deploy exact multi-module Worker source; prove auth, dashboard, schedule, subject catalog, tests and writes route contracts; confirm student/admin RLS; confirm upload/media paths; test 503/timeout behavior; verify Vercel env vars in Preview first; then Production. If a route is not migrated, show an explicit unavailable response rather than silently falling back to SpaceWeb.
- No Supabase migration, RLS change, Telegram webhook change, DNS change, or Vercel environment change is included in this code commit.
- Required Vercel variables for the eventual Cloudflare-only Preview test: `MEDBIOHIM_API_MODE=cloudflare` and `CLOUDFLARE_API_ORIGIN=https://medbiohim-api-shadow.ryazansevegor.workers.dev/api/v1` (verify the exact deployed workers.dev hostname before setting it). Do not set these until the Worker deployment and smoke tests are confirmed.

## Cloudflare failover hardening — 2026-10-13 (continued)

- Fixed a missing server-side `isCanonicalAdminRequest()` verifier in the Vercel API proxy. Without this helper, the admin transport-diagnostics path could not compile. It validates the bearer token with Supabase Auth and checks `user_roles → roles.code` using the caller JWT/RLS; metadata supplied by the client is not trusted.
- Added a hard HTTPS guard for `SPACEWEB_API_ORIGIN`. The proxy now refuses a plaintext HTTP backend origin instead of forwarding bearer tokens or private payloads to it.
- Added a regression test that checks the admin-only diagnostics contract and the HTTPS guard. The change is in commit `075a666ebcfd4ce4a25f4d8d272a6dd18c75552d`; the guard fix is in `1a7a2ffc65cfd6b0e073bad351a9a24752af02ff`.
- The Vercel Preview flag `MEDBIOHIM_CF_FIRST` remains off unless explicitly configured. No environment variables or production aliases were changed.
- The active Cloudflare Worker remains behind the latest GitHub source. Its live bundle still needs a controlled full-module redeploy; do not claim source/deployment parity or cut over production until smoke checks pass.
- Verification caveat: the GitHub combined commit status endpoint returned no statuses for the test commit at the time of review; this is not proof that CI passed. Continue to inspect the actual workflow jobs/logs.
- Next: ensure the new Node test itself passes, confirm GitHub Actions actually allocates runners, run `npm run test:api-failover`, `cd integrations/cloudflare-api && npm test`, typecheck/build, and then test the shadow Worker over HTTPS. Only after that enable the Preview flag and test as student/admin accounts.

## Cloudflare ZIP review + Cloudflare-first preview test mode — 2026-10-12 (updated)

- 🟢 Cloudflare-first proxy mode and admin-only transport diagnostics are implemented in source. `MEDBIOHIM_CF_FIRST` defaults to off; no Vercel Preview or Production environment variables have been changed.
- 🟢 Repaired the reviewed ZIP's observed Supabase schema mismatches: caller-scoped role lookup now uses `user_roles → roles(code)`; group memberships read `role_in_group` instead of the nonexistent `role` column.
- 🟢 Added 7 router-level test cases to the reviewed candidate archive. Latest local Node.js 22.16.0 result: **65 passed, 0 failed**, with JS syntax checks passing. Downloadable candidate archive was rebuilt and ZIP integrity verified.
- 🟡 The corrected ZIP is a reviewed candidate artifact, not yet the deployed Worker bundle and not fully merged into the checked-in `integrations/cloudflare-api` source. The active Cloudflare Worker still contains only two modules, while GitHub's entry imports additional modules.
- 🔴 R2 is not enabled (Cloudflare error 10042), so its bucket/binding cannot be validated. Auth rate-limit bindings, live RLS tests, media delivery and the optional academic RPC migration remain unresolved.
- 🔴 Latest Actions runs still fail before steps: run IDs `38260355983`, `38260355958`, `38260355910`, `38260355848` on commit `31cbdf6`; inspected job has `runner_id=0`, no runner name, and no steps. CI now includes the Worker router/helper suite but no green execution is claimed.
- 🟢 New file: [Cloudflare ZIP review and failover](docs/CLOUDFLARE-ZIP-REVIEW-AND-FAILOVER-2026-10-12.md). The corrected candidate should not be cut over until R2/configuration prerequisites, complete bundle deployment and live contract/RLS tests pass.
- 🔒 No production route, DNS, Vercel variable, Supabase schema/policy, SQL migration, R2 setting, or Telegram webhook changed.

Next: correct/integrate the ZIP modules into the GitHub Worker source; configure safe R2 and rate limiting only after account prerequisites; reconcile and deploy the complete module bundle to shadow; restore actual Actions runner execution; run live public/authenticated smoke tests; then enable Preview-only failover. Keep Production on the current route until acceptance.


## Cloudflare ZIP review + Cloudflare-first preview test mode — 2026-10-12

- 🟢 Added opt-in Vercel proxy mode `MEDBIOHIM_CF_FIRST=true` with server-only `CLOUDFLARE_API_ORIGIN`; default remains off. It tries Cloudflare first and allows guarded SpaceWeb fallback only over HTTPS.
- 🟢 Admin-only route diagnostics were added to `src/lib/api.ts` and `src/app/admin/tools/page.tsx`. The server verifies the caller JWT and canonical `user_roles → roles.code` relationship before sending transport headers; an ordinary authenticated user cannot request/see those headers.
- 🟢 Safe fallback for `POST /api/v1/files/upload` was added only for the explicit `STORAGE_NOT_CONFIGURED` pre-write guard. Generic/ambiguous write errors are not retried automatically.
- 🟢 Uploaded ZIP tests ran locally under Node 22.16.0: **58/58 passed** (archive status file's 56/56 count is outdated).
- 🔴 ZIP integration is not approved as a production replacement. Live Supabase schema confirms `public.user_roles` has `user_id` and `role_id` only and joins `public.roles.code`; ZIP modules in domain/files/homework/presence use `select=role` and need correction.
- 🔴 Cloudflare API reports R2 is not enabled on the account (error 10042). `FILES_BUCKET` cannot be assumed present; ZIP upload/download is not ready. No R2 enablement or bucket migration was performed.
- 🟡 Histogram/source-media binary routes are deliberately tagged SpaceWeb-only; auth rate-limit bindings are still required; the optional academic RPC SQL has not been applied or approved.
- 🔴 The active deployed Worker bundle is behind GitHub source (only `src/index.js` and `src/supabase-auth.js` were returned by Cloudflare). Public HTTP smoke-test access failed from the current environment, and Actions remains historically blocked before steps; live behavior is unverified.
- 🔒 No Vercel variables were changed, Preview did not get switched to Cloudflare-first mode, and no Production URL/DNS/API route/Supabase policy/SQL/Telegram webhook changed.
- Report: [Cloudflare ZIP review and failover test mode](docs/CLOUDFLARE-ZIP-REVIEW-AND-FAILOVER-2026-10-12.md). Deployment drift report: [Cloudflare shadow deployment reconciliation](docs/CLOUDFLARE-SHADOW-DEPLOYMENT-RECONCILIATION-2026-10-12.md).

Next: fix ZIP role queries, add Worker router-level tests, reconcile the Worker upload bundle, verify Wrangler dry-run/build and external HTTP smoke, then activate Preview-only failover. Keep Production unchanged until auth, reads/writes, media, RLS, and rollback tests pass.


## Cloudflare shadow deployment reconciliation — 2026-10-12

- 🟢 Read Cloudflare account state; `medbiohim-api-shadow` has Supabase URL/anon-key secret bindings (values not read).
- 🟢 Enabled the isolated API Worker's `workers.dev` subdomain; previews stay disabled. No production routing, custom domain, frontend API base, database policy, or Telegram webhook changed.
- 🔴 Deployment drift found: current GitHub API Worker source imports/implements modules that are absent from Cloudflare's returned active script content. Latest repo routes are not proven deployed.
- 🟡 No external HTTP smoke test or successful Actions run is claimed. Next: reconcile the complete module bundle, run Node tests and Wrangler build, deploy exact tested source to shadow, then verify public and authenticated RLS behavior.
- Details: [Cloudflare shadow deployment reconciliation](docs/CLOUDFLARE-SHADOW-DEPLOYMENT-RECONCILIATION-2026-10-12.md).



## Extension + Telegram integration hardening (2026-10-11)

- 🟢 Extension search now prefers question text instead of concatenating all options, formulas and captions into one long query; when the question is too short, it falls back to formula text or image captions.
- 🟢 Telegram webhook adds /homework guidance and regression tests for commands addressed to a different bot and refusal of insecure HTTP relay URLs.
- 🟡 Group homework ingestion depends on the existing PHP TelegramHomeworkService, an explicitly mapped/active Telegram chat and correct server-side bot/secret configuration. Cloudflare Worker remains an un-deployed alternative; no production webhook changed.
- ⚠️ BotFather group privacy must permit ordinary group updates if the bot is expected to receive regular homework text/photos. Change this only for the intended bot and verify update delivery.
- ⬜ Next: run both bot test suites in Node 20, test a mapped group with text/photo/reply/media-group updates against a non-production backend, then improve extension image selection and consent-based OCR/vision after privacy review.
- 🔒 No production data writes, deploys, webhook changes, token exposure or new browser host permissions were made in this pass.


## Multimodal STEM questions — formula/equation groundwork (2026-10-11)

- 🟢 Side panel now has an editable formula/equation field and attempts to collect text exposed by MathML, KaTeX, MathJax, MathJax v3 containers, accessible formula labels, data-math nodes and code blocks in the likely question area.
- 🟢 Formula text and image captions are included in the explicit copy/search handoff alongside question and answer options. This covers some text-rendered chemical equations, mathematical notation and formula descriptions.
- 🟡 It does **not** reconstruct arbitrary 2D chemical structures, stereochemistry, reaction arrows, charges/subscripts lost by the page renderer, or formula drawings embedded only as pixels/canvas. Extracted notation must be reviewed before using it for answer matching.
- ⬜ Future work: structure-aware chemistry representation (e.g. MOL/SDF/SMILES when genuinely available in page data), image selection + user-consented OCR/vision, equation normalization that preserves stoichiometry/charge/state/conditions, and tests for organic structures, ionic equations, redox, equilibrium, graphs and image-only prompts.
- 🔒 No image/formula upload is automatic; no new host permissions or access-control bypass added.


## Image-based questions — extraction groundwork (2026-10-11)

- 🟢 Side panel now collects visible image-like elements in the likely question area and their available alt/ARIA/title/figcaption descriptions. This metadata is editable and included in the user-triggered copy/search handoff.
- 🟡 This is **not image recognition/OCR**: pixels, arrows/markers, histology morphology, chart axes and labels rendered only inside an image are not interpreted yet. Image URLs/pixels are not uploaded.
- ⬜ Next image pass: let the user explicitly choose the relevant image(s), add local/consented OCR or a secure vision endpoint only after privacy/auth review, preserve captions/marker context, and rank matches by question + options + image evidence. Never label an answer correct from visual similarity alone.
- 🔒 No host permissions, automatic image uploads, credential extraction or access-control bypass added.

## Browser extension — resilient extraction pass (2026-10-11)

- 🟢 Updated extraction to try multiple DOM/ARIA/question/option selectors and rank likely question containers; fallback text can be corrected manually.
- 🟡 No guarantee for every LMS, cross-origin iframe, image/PDF/canvas-only question or protected page. No OCR, direct side-panel answer API, source trust queue or import journal yet.
- 🔒 No bypass of site restrictions; only content available to the user and readable through active-tab permission is in scope.
- 🟡 Source committed; syntax/runtime checks and real-browser tests remain pending because CI runner allocation is blocked.

## Browser extension — answer lookup groundwork (2026-10-11)

- 🟢 `SearchService` now includes stored answer text for published `questions` and `exam_questions` in the authenticated search response; the search UI shows it only after the user expands “Показать ответ”. Trainer-feed answer keys are not added to this response.
- 🟡 Extension still hands off to the website search page. Direct answer display inside the side panel, candidate ingestion, source trust allowlist, end-of-test evidence capture and admin journal remain open.
- 🟡 Source edits committed to `main`; PHP lint, frontend build, authenticated API test, deployed PHP/frontend verification and real Chrome/Edge tests are not verified because CI runner allocation remains blocked.

## Cloudflare Telegram Worker — initial source implementation (2026-10-11)

- 🟢 Added separate `integrations/telegram-bot-cloudflare/` Worker prototype and deployment/configuration README; existing Node/Vercel bot remains untouched.
- 🟢 Added tests for health, missing secrets, wrong secret, methods, invalid/oversized payloads, command reply and optional HTTPS group relay.
- 🟢 Optional-integrations workflow now includes Worker tests for pushes and pull requests.
- 🟡 Test code and deployment compatibility have **not** been executed/verified; GitHub Actions runner issue remains.
- 🔴 Not deployed to Cloudflare; no production token/secrets/webhook changed. Do not switch Telegram webhook until preview tests pass and explicit approval is given.

## Project state and hosting failover snapshot — 2026-10-11

Comprehensive restart point: [docs/PROJECT-STATE-AND-HOSTING-FAILOVER-2026-10-11.md](docs/PROJECT-STATE-AND-HOSTING-FAILOVER-2026-10-11.md). This records the last known main SHA, implemented vs unverified work, CI/Vercel/Supabase/PHP/LLM/Telegram status, outstanding security items, and a proposal (not yet implemented) to preserve Vercel → SpaceWeb → Supabase while evaluating Cloudflare edge, a second international frontend, Russian emergency mirror (Layero/ONREZA), and a persistent no-card Telegram webhook host. No production/database/deployment changes were made as part of the snapshot. Always verify current main HEAD before resuming.

## Latest status — 2026-10-10, Pass 65–73

- 🟢 Explicit `contents: read` permission is now set on all six workflows.
- 🟢 Fixed malformed indentation in `package-archives.yml`; GitHub now recognizes its `package` job.
- 🔴 GitHub Actions execution remains blocked before steps: code-check `38025017750`, smoke `38025017788`, SpaceWeb archive `38025017818`, source package `38025017740`; raw jobs report `runner_id: 0`, no runner name and empty steps.
- 🟡 ZIP `.env` exclusion guards are committed but not execution-verified.
- 🟡 Next: inspect owner-side Actions settings/runner availability or contact GitHub support; after execution returns, run PHP/frontend checks, archive validation and smoke tests.
- Handoff: [docs/CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md](docs/CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md).

## Consolidated workstream — Data + DB privileges (2026-10-10)

- 🟢 Read-only integrity checks show no broken/duplicate test-question links and all active published tests/questions linked.
- 🟡 Privilege audit found client roles with unnecessary `TRUNCATE`, `TRIGGER`, and `REFERENCES` rights on many public tables; RLS does not govern TRUNCATE.
- 🟡 Prepared migration `database/migrations/20261010_revoke_non_rls_table_privileges.sql`; **not applied** to live Supabase. Staging and migration-owner verification are required before applying.
- 🔴 GitHub Actions is still not executing steps; CI/runtime not green.

Combined report: [Data + DB privilege integrity workstream](docs/DATA-SECURITY-INTEGRITY-WORKSTREAM-2026-10-10.md). Previous Pass 54 report retained.

## Data integrity reconciliation — Pass 54 (2026-10-10)

- 🟢 Read-only Supabase check: 854 question links; no duplicate pairs or broken links; 32/32 active published tests have questions; 660/660 active published questions have test links.
- 🟢 776 published `exam_questions` have non-empty prompts and valid checked curriculum links.
- 🟡 719 blank answer fields belong to open-ticket/preparation-style types in the grouped audit; no auto-fill/delete/unpublish was performed.
- 🟡 Five linked Anatomy/Biochemistry questions have a valid `subject_id` but their legacy subject has NULL `slug`; normalization is deferred until canonical mapping is confirmed.
- 🔴 CI and production runtime are still unverified; Actions jobs terminate before steps.

Report: [Pass 54](docs/DATA-INTEGRITY-RECONCILIATION-2026-10-10-PASS54.md).

## API proxy hardening — Pass 53 (2026-10-10)

- 🟢 Trainer fallback now respects PHP-first routing; Supabase fallback is only used after an upstream 404.
- 🟢 Authenticated trainer images are marked `private, no-store`; proxy 502 messages are generic.
- 🟢 Pre-deploy audit now checks these three contracts.
- 🔴 Workflow runs for commits `ec4aad1` and `6aeb401` still fail before any steps with `runner_id=0`; source/build/test checks and live runtime remain unverified.
- Code: [`ec4aad1`](https://github.com/MISTACEN/medbiohim/commit/ec4aad139413292c3beb6992e58bdfb6ef7ae17b); audit guard: [`6aeb401`](https://github.com/MISTACEN/medbiohim/commit/6aeb401434ab8ba10dad778bc48c585a5fe4347e).

# MEDBIOHIM — PHASES STATUS

> Актуально на **2026-10-10**.  
> Source of truth: `main` + живой Supabase + целевые deployment environments.  
> Подробный план: [ROADMAP.md](ROADMAP.md).

## CI/PHP audit — Pass 51 (2026-10-10)

- 🟢 Source hardening: trusted role claims, DB-backed role checks, token URL rejection, generic uncaught-error responses.
- 🟢 Duplicate admin route registrations removed; route scanner now examines all router variable names.
- 🟢 Homework attachment SQL PHP-string syntax fixed.
- 🔴 GitHub Actions runner allocation is **blocked**: fresh run [37993824049, attempt 2](https://github.com/MISTACEN/medbiohim/actions/runs/37993824049) on `ubuntu-24.04` still returned `runner_id=0`, zero steps and no logs. Pinning did not resolve it; check account Actions billing/permissions or contact GitHub Support.
- 🟡 Full repository PHP lint, route registration, SQL/RLS/fallback tests, and SpaceWeb post-deploy smoke are still open.

Report: [CI/PHP audit Pass 51](docs/CI-PHP-AUDIT-2026-10-10-PASS51.md).

## CI runner retry — attempt 4 (2026-10-10)

- 🔴 Retried failed jobs for run [37993824049](https://github.com/MISTACEN/medbiohim/actions/runs/37993824049); attempt 4 again ended with both frontend/backend jobs failing before any steps (`steps=[]`).
- This remains runner allocation/dispatch failure, not a result from PHP/TypeScript/build commands. Do not mark checks green or weaken required checks.
- Next external unblock: verify GitHub Actions account/org billing, spending limit, repository Actions permissions and runner availability; contact GitHub Support if those are normal.
- Vercel is separately blocked by the observed `build-rate-limit` target; production deployment/runtime smoke remains open.

## Histology media reconciliation — 2026-10-10

- 🟡 Read-only comparison of 28 published electronograms found 5 `source_key` / `preparation.imagePath` mismatches; no database writes were made. Exact mismatches and the SpaceWeb HTTP verification checklist are recorded in [the reconciliation report](docs/HISTOLOGY-MEDIA-RECONCILIATION-2026-10-10.md).
- 🟡 Histology materials: 80 rows, all have inline `content_html` and a resolvable `source_key`; none has `file_id` or `external_url`. This is not automatically an error, but source download/viewer behavior must be checked in the target runtime.

## CI/PHP audit — Pass 52 (2026-10-10)

- 🟢 Fixed repeated named PDO placeholders in homework listing/attachment SQL.
- 🟢 Added `backend/tests/HomeworkSqlContractTest.php` and wired it into code-check and SpaceWeb pre-deploy checks.
- 🔴 GitHub Actions still fails before steps (`runner_id=0`, no logs); no CI success claimed. Full PHP lint and integration/deploy checks remain unverified.
- Report: [CI/PHP audit Pass 52](docs/CI-PHP-AUDIT-2026-10-10-PASS52.md).

## Статусы

> Последняя сверка: Vercel deployment metadata + [security fix Pass 49 (2026-10-10)](docs/SECURITY-FIX-2026-10-10-PASS49.md) + [Pass 48 viewer access](docs/SECURITY-FIX-2026-10-10-PASS48.md) + [Pass 47 media cache isolation](docs/SECURITY-FIX-2026-10-10-PASS47.md) + [Pass 46 cache fix](docs/RELIABILITY-FIX-2026-10-10-PASS46.md). Исторические pass-записи ниже сохранены; при расхождении чисел/статусов использовать последнюю датированную проверку. Код-коммит не равен успешному production/runtime-тесту.

- ✅ DONE
- 🟡 IN PROGRESS
- 🔴 BLOCKED
- ⬜ TODO
- ⚪ DEFERRED

---

| Фаза | Состояние | Что это значит |
|---|---|---|
| 0. Source of truth / sync | 🟡 | Pass 45–47 frontend source included in latest observed READY Vercel deployment `6687e057`; fixed PHP autoloader in CI, added 15-assertion sanitizer regression test and required pre-deploy backup. GitHub runner still fails before steps; exact-commit runtime smoke remains open. See [unified checklist](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md) |
| 1. Auth / account | 🟡 | login → /me → dashboard → logout не подтверждены в target runtime; Pass 46 prevents malformed JWTs sharing a cache bucket and Pass 47 scopes private media/card caches by user; two-account runtime check remains open |
| 2. Schedule | 🟡 | core/data есть; production-smoke и охват повторяющихся отработок требуют сверки |
| 3. Subjects architecture | 🟡 | предметный hub реализован, остальные subject flows доводятся |
| 4. Histology | 🟡 | Supabase answer-key mitigation live; Pass 44 trainer route membership, Pass 45 recursive answer sanitization, Pass 47 user-scoped media caches, Pass 48–49 material/file access and Pass 50 subject/gradebook/academic-context MBH checks are in source. Pass 45–47 frontend deployment observed READY; Pass 48–50 PHP deployment, authenticated smoke and media/source mapping remain open |
| 5. Tests / Question Bank | 🟡 | данные/связи имеются; полный start → answer → finish → review smoke и аудит exam_questions не закрыты |
| 6. Materials | 🟡 | записи и viewer существуют; наличие физических DOCX/PDF/image и единый lecture source ещё не подтверждены |
| 7. Admin CMS | 🟡 | есть DB console; две PHP syntax ошибки исправлены в fb4eed97, target-runtime проверка ещё не выполнена |
| 8. AI Tutor | 🔴 | provider chain есть, но runtime availability не закрыта |
| 9. Chemistry | 🟡 | core на main, экспериментальные части в beta |
| 10. UI system | 🟡 | основной UI стабилен; Aero Glass — beta |
| 11. SpaceWeb media | 🟡 | Read-only reconciliation: all 28 published electronogram cards have non-empty source_key; 23/28 source_key values exactly match preparation.imagePath, while 5 differ (four truncated imagePath values and one capillary card with an ID-like source_key). No exact/basename matches exist in content_sources.source_path. GitHub main tree has no matching image assets. Files may live only on SpaceWeb/B2; do not rewrite DB paths until physical filenames and HTTP 200 responses are checked |
| 12. Documentation | 🟡 | Unified GitHub/production checklist and issue template added; Pass 44–50 reports, 15-assertion sanitizer test, unified checklist and bug issue form documented; historical counts remain snapshots |
| 13. Optional integrations | 🟡 | Chrome/Edge quick-access extension and isolated public-command Telegram bot MVP added; manual browser install/bot deployment not performed; private account linking intentionally absent |

---

## Уже фактически закрыто

- ✅ Supabase project используется как основной DB.
- ✅ main — production branch.
- ✅ beta — experiment branch.
- ✅ subject-level navigation.
- ✅ histology canonical subject cleanup.
- 🟡 Histology `exam_questions` exist; latest recorded live snapshot is 466 rows (366 published, 100 unpublished as of 2026-10-06). Duplicate-text groups and blank-answer candidates still need source comparison; count is not a completion criterion.
- ✅ 5 histology ticket banks.
- 🟡 Histology material counts need reconciliation: older phase notes say 27 published, while the later live snapshot records 80 published material records; neither count proves physical files are available.
- ✅ histology trainer feed and atlas data.
- ✅ test-key resolution via `source_key`.
- ✅ backend deployment workflow.
- ✅ document viewer route for histology materials.
- ✅ trainer atlas → detailed materials navigation.
- ✅ Aero Glass вынесен в отдельную beta-theme, не включён по умолчанию.

## Главные открытые блокеры

- 🟡 **CI runner dispatch:** PHP autoloader smoke was fixed and a 12-assertion trainer payload sanitizer regression test was added, but GitHub Actions still fails before any step. The workflow changes are not verified until an actual runner executes them.
- 🟡 **SpaceWeb deployment safety:** deployment now requires a non-empty source backup and checks deployed Pass 44 markers; actual successful deployment is still unconfirmed.
- 🟡 **Unified acceptance:** follow [the GitHub/production verification checklist](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md) and record PASS/FAIL/BLOCKED with evidence.

### 🟡 Trainer route access — source fix awaiting deployment/test
Pass 45 further hardens recursive answer-key stripping in PHP and Next source. [Pass 45 report](docs/SECURITY-FIX-2026-10-10-PASS45.md).
Pass 44 (`99ed1bc`) aligns PHP access checks across feed, detail, answer submission, and image routes. CI runner allocation prevents PHP lint/integration execution; do not mark runtime verification complete until the PHP source is deployed and both MBH and non-MBH accounts are tested. [Details](docs/SECURITY-FIX-2026-10-10-PASS44.md).

### 🔴 AI
Provider availability/runtime ещё не подтверждён end-to-end.

### 🟡 Media
Trainer feed image endpoints всё ещё требуют закрытия 404/502.

### 🟡 Production
Последний наблюдавшийся READY Vercel build — `e23fb882`; более новый docs-only build `701573ef` был BUILDING. Live browser/API smoke ещё не выполнен, SpaceWeb PHP deployment не подтверждён.

### 🟡 CMS
Нужно довести быстрые правки вопросов/материалов/занятий.

---

## Правило обновления

После каждой законченной крупной задачи:

1. изменить статус в `ROADMAP.md`;
2. изменить статус в этом файле;
3. при необходимости обновить `SYNC_STAMP.md`;
4. только после проверки ставить ✅.


## 2026-10-04 deep audit status

Большинство ранних P0, найденных первым аудитом, уже закрыто.

| Фаза | Текущий статус |
|---|---|
| 0. Source of truth / sync | 🟡 | target-environment verification remains |
| 1. Auth / account | 🟡 | code path stable, final login/logout smoke remains |
| 2. Schedule | 🟡 | backend/editor stable, final target smoke remains |
| 3. Subjects architecture | 🟡 | subject filtering/progress/advanced tests path fixed |
| 4. Histology | 🟡 | content integrated; physical media smoke remains |
| 5. Tests / Question Bank | 🟡 | sequential/options/typecheck path fixed; full published-test audit remains |
| 6. Materials | 🟡 | histology DOCX/image viewer works; generic document coverage remains |
| 7. Admin CMS | 🟡 | false-zero fallbacks reduced; material/trainer/version UI still needs completion |
| 8. AI Tutor | 🔴 | external provider runtime still unresolved |
| 9. Chemistry | 🟡 | core implemented, broader data/content still beta |
| 10. UI system | 🟡 | no current functional blocker; Aero Glass remains beta |
| 11. SpaceWeb media | 🟡 | physical trainer media verification remains |
| 12. Documentation | 🟡 | deep audit registry now current |

## Verification evidence

Latest fully completed code-check before the newest documentation-only commit:
- TypeScript: ✅
- Next.js production build: ✅
- PHP syntax: ✅ (93 files)
- predeploy audit: ✅ no escaped-newline, no retired /api-compat calls, homework API-only
- smoke: ✅

The newest code-check after the Deep Audit documentation commit is running separately.
## Deep audit 3 override — 2026-10-04

- Source/sync → 🟡 code cleanup substantially complete; deployment convergence still pending.
- Schedule → 🟡 route duplication removed; CI backend syntax green; production delivery pending.
- Histology → 🟡 trainer content integrity is clean in Supabase; physical media still requires target-environment smoke.
- Tests → 🟢 DB integrity check shows no orphan links and no published tests without questions; UI CI is being re-run after cleanup fixes.
- Admin CMS → 🟡 content validator + audit rollback exist; dedicated editors remain polish work.
- AI Tutor → 🔴 upstream/provider availability unresolved.
- Materials → 🟡 histology DOCX viewer exists; generic subject-wide DOCX/PDF viewer is still a product task.
- Deployment → 🔴 current Vercel production deployment is behind current main.

See docs/DEEP-AUDIT-3-2026-10-04.md.
### Current CI evidence

Latest main Code Checks for commit 84d4684a013660e9c6a8e0d624edaae9ab4f7c13:
- frontend TypeScript: ✅
- Next.js production build: ✅
- escaped-newline guard: ✅
- backend PHP syntax: ✅
- smoke: ✅
- backend/source archives: ✅

The previous failing check was caused by a missing adminValidateContent import in src/app/admin/tools/page.tsx. It is fixed and the final Code Checks run is green.

See docs/FULL-AUDIT-2026-10-04.md.


## 13. Student-first / Telegram

| Подфаза | Статус | Фактическое состояние |
|---|---|---|
| 13.1 Student identity | 🟡 | Auth exists; Telegram account linking needs end-to-end verification |
| 13.2 Group membership | 🟡 | groups + memberships + group-aware schedule/homework exist; join flow needs hardening |
| 13.3 Lesson context | 🟡 | schedule entries exist; dedicated Telegram message → lesson resolver absent |
| 13.4 Telegram webhook | 🟡 | implemented in PHP; production webhook not proven |
| 13.5 Telegram chat binding | 🟡 | admin UI + DB schema implemented; live chats = 0 |
| 13.6 Telegram message ingestion | 🟡 | service + schema implemented; live messages = 0 |
| 13.7 OCR / vision | 🟡 | code path exists; runtime provider availability must be tested |
| 13.8 Homework classification | 🟡 | heuristic + LLM second pass exists |
| 13.9 Homework creation | 🟡 | repository/API path exists; live homeworks = 0 |
| 13.10 Attachments | 🟡 | attachment schema/import path exists; live attachments = 0 |
| 13.11 Telegram registration | 🔴 | custom Telegram auth trace exists, but full bot /start → account → group flow is not proven |
| 13.12 Student-generated content | ⬜ | product direction; moderation/confirmation model not complete |

### Telegram acceptance gate

The feature is not DONE until a real group test proves:

`Telegram → webhook → stored message → group resolution → subject resolution → lesson resolution → homework → attachment → website`

and:

`Telegram /start → identity link → group membership → schedule → homework`

## 14. Student-generated learning ecosystem

| Capability | Status |
|---|---|
| Student creates/updates own/group homework | 🟡 |
| Student submits homework | 🟡 |
| Student marks homework done | 🟡 |
| Student contributes notes/materials | ⬜ |
| Student suggests content correction | ⬜ |
| Peer confirmation | ⬜ |
| Starosta moderation | ⬜ |
| Change history / attribution | 🟡 foundation exists via content/audit structures |
| Group knowledge feed | ⬜ |

## Updated phase ordering

After current stability blockers:

1. **Student identity + group membership**
2. **Telegram registration/linking**
3. **Telegram → lesson resolver**
4. **Telegram → homework production smoke**
5. **Student contribution + moderation**
6. **Progress based on real activity**
7. **UI polish**


## 2026-10-06 — Pass 14–17 second verification

A second pass was performed against current main + live Supabase after the implementation and subsequent Pass 18–22 hardening.

| Pass | Status | Current result |
|---|---|---|
| Pass 14 — AcademicContext | 🟢 | group/subject/session/lesson/context_version contract is implemented and live invariants are clean |
| Pass 15 — Core academic flow | 🟢 | planner/schedule/attendance/homework/test/progress are group-scoped; homework has one canonical derived status |
| Pass 16 — Preparation | 🟢 | preparation start, membership, sequential bank progress and terminal transitions are context-safe |
| Pass 17 — Test integrity | 🟢 | server-side answers/scoring and immutable attempt/preparation snapshots are live and verified |

### Live second-pass invariants

- active test attempts missing academic snapshot: **0**;
- active preparation sessions missing academic snapshot: **0**;
- test answers outside attempt snapshot: **0**;
- preparation results without answer snapshot: **0**;
- foreign-group test attempts: **0**;
- foreign-group preparation sessions: **0**;
- schedule ↔ academic session/year/semester mismatches: **0**.

One historical submitted test attempt from before the snapshot migration has no score/context/snapshot. It is retained unchanged because reconstructing an answer or score would fabricate history. It is classified as a **legacy historical anomaly**, not a current-flow defect.

### Additional hardening in this pass

- HomeworkRepository::listForUser() now returns canonical my_status and my_status_source.
- planner uses the same derived status contract.
- pending / done / submitted / returned / graded is now the shared semantic vocabulary for student homework state.

Detailed second verification: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS14-17-SECOND-VERIFY.md.

### Release gate

Passes 14–17 are closed at implementation + live DB invariant level. They are **not** a substitute for the final target-environment gate: PHP/TypeScript/build, authenticated browser smoke, Vercel READY and SpaceWeb artifact/runtime verification remain separate.

## 2026-10-06 — Pass 18: Historical preparation integrity

| Контур | Статус | Состояние |
|---|---|---|
| Preparation scoring source | 🟢 | immutable session snapshot |
| Preparation answer snapshot | 🟢 | stored per result |
| Preparation AI historical correctness | 🟢 | uses stored answer snapshot |
| Active context integrity | 🟢 | live DB gap counts = 0 |
| CI execution evidence | 🟡 | no workflow run for latest commit |
| SpaceWeb/PHP runtime | 🟡 | must be verified in actual deployment |
| Next.js build | 🟡 | must be verified after latest frontend changes |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS18.md.


## 2026-10-06 — Pass 19: Progress / History / Preparation

| Контур | Статус | Состояние |
|---|---|---|
| Preparation historical reads | 🟢 | GET/finish/AI используют immutable session snapshot |
| Preparation answer snapshot | 🟢 | live results без answer_snapshot = 0 |
| Progress terminal statuses | 🟢 | submitted учитывается как завершённая попытка |
| Progress DB failure handling | 🟢 | silent empty fallback удалён |
| Test history group scope | 🟢 | history фильтруется по test_attempts.group_id |
| Bank group propagation | 🟢 | bank + preparation передают group_id |
| Runtime/build verification | 🟡 | требует реального target environment |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS19.md.


## 2026-10-06 — Pass 20: Test / Preparation API contract

| Контур | Статус | Состояние |
|---|---|---|
| Test answer-key exposure | 🟢 | detail/start/finish/history не отдают immutable answer snapshot |
| Preparation snapshot exposure | 🟢 | start/get/save/finish скрывают server snapshot |
| Historical preparation review | 🟢 | completed flow использует immutable snapshot |
| Progress/history contract | 🟢 | submitted + group-scoped history |
| Legacy ProgressService | 🟡 | не используется как runtime source, но файл остаётся cleanup trace |
| Runtime/build/browser verification | 🟡 | следующий gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS20.md.


## 2026-10-06 — Pass 21: Deployment / cross-group

| Контур | Статус | Состояние |
|---|---|---|
| Bank progress group isolation | 🟢 | sequential session выбирается только внутри group_id |
| Live snapshot/context invariants | 🟢 | все проверенные gaps = 0 |
| GitHub code-check definition | 🟢 | PHP + route smoke + frontend checks существуют |
| CI evidence | 🟡 | workflow runs отсутствуют в доступном API |
| Vercel runtime | 🟡 | 403 permissions prevent deployment verification |
| SpaceWeb runtime | 🟡 | отдельный target gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS21.md.


## 2026-10-06 — Pass 22: Legacy / fake-success cleanup

| Контур | Статус | Состояние |
|---|---|---|
| Admin partial-success fallback | 🟢 | fail-closed 503 |
| Legacy ProgressService | 🟢 | removed; no runtime consumer |
| Stub/placeholder scan | 🟢 | executable fake states distinguished from legitimate UI |
| Historical docs traces | 🟡 | source-of-truth cleanup remains |
| Runtime/build/browser verification | 🟡 | target environment required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS22.md.


## 2026-10-06 — Pass 23: route / legacy cleanup

| Контур | Статус | Состояние |
|---|---|---|
| Duplicate /api/v1/me | 🟢 | legacy profile_rest removed from registration and deleted |
| Canonical profile route | 🟢 | domain_rest.php is the single registered /api/v1/me handler |
| Orphan SupabaseRestProfile | 🟢 | removed; no runtime consumer |
| Runtime/build/browser verification | 🟡 | target environment still required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS23.md.


## 2026-10-06 — Pass 24: Curriculum-linked tests

| Контур | Статус | Состояние |
|---|---|---|
| Test curriculum map API | 🟢 | module/topic hierarchy with question/test counts |
| Academic context isolation | 🟢 | group/course/semester/specialty scoped |
| Test topic metadata | 🟢 | module/topic titles returned |
| Question bank topic filter | 🟢 | filter by canonical topic UUID/title |
| Untagged question safety | 🟢 | shown as unclassified; no guessing |
| Detailed plan coverage | 🟡 | currently complete only where module/topic hierarchy is imported |
| Remaining question tagging | 🟡 | controlled mapping required |
| PHP/Next/browser/runtime | 🟡 | target environment verification required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS24.md.


## 2026-10-06 — Pass 25: full current-semester mapping

| Контур | Статус | Результат |
|---|---|---|
| Current-semester question mapping | 🟢 | 655/655 have canonical topics |
| Current-semester test mapping | 🟢 | 30/30 have canonical topics |
| Histology lesson mapping | 🟢 | 206 previously untagged mapped; 47 explicitly outside current plan |
| Chemistry lesson mapping | 🟢 | 1.1–3.13 taxonomy mapped to canonical topics |
| Lesson dates | 🟢 | verified current calendar dates attached where available |
| Out-of-calendar safety | 🟢 | marked explicitly, not falsely assigned |
| Ticket-bank integrity | 🟢 | untouched |
| Runtime/build/browser | 🟡 | separate verification gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS25.md.


## 2026-10-07 — Pass 26: Chemistry master catalog

| Контур | Статус | Состояние |
|---|---|---|
| Source archive audit | 🟢 | 7 scanned PDFs / 142 pages checked; no usable native PDF text layer |
| Unified chemistry catalog | 🟢 | Supabase `chemistry_master_documents` created |
| Open tasks | 🟢 | 260 canonical organic-chemistry open tasks included |
| Current test questions | 🟢 | 176 published chemistry test questions included with options/answers |
| Formula preservation | 🟢 | textual chemical formulas/reactions retained verbatim where source text contains them |
| Image-only structural/skeletal formulas | 🟡 | must be confirmed from original page images before generating answer formulas |
| Full archived test-section import | 🟡 | source contains additional OCR-sensitive questions; controlled expansion remains |
| Curriculum mapping | 🟢 | canonical topic/plan links retained for imported current questions |
| Runtime/build/browser | 🟡 | separate target-environment gate remains |

Detailed report: `docs/IMPLEMENTATION-AUDIT-2026-10-07-CHEMISTRY-MASTER-CATALOG.md`.


## 2026-10-07 — Pass 26A: ответы/формулы химии

| Контур | Статус | Результат |
|---|---|---|
| Master catalog | 🟢 | 436 элементов |
| Open tasks | 🟢 | 260 сохранены |
| Test questions | 🟢 | 176 сохранены с ответами/вариантами |
| Prepared answers | 🟢 | 40 элементов |
| Structural-formula answers | 🟡 | 19 подготовлены из текста; визуальная проверка ещё нужна |
| Production scoring answers | 🟡 | `exam_questions.answer` намеренно не изменён |
| Remaining open-task answers | 🟡 | 220 требуют подготовки и проверки |
| RLS | 🟢 | включён для master catalog |


## 2026-10-07 — Pass 26B: две методички химии

| Контур | Статус | Результат |
|---|---|---|
| Методическое пособие №1 | 🟢 | Органическая и физическая химия; контрольные вопросы/задания |
| Методическое пособие №2 | 🟢 | Минаева/Пронкина; задачи, упражнения и тестовые задания по органической химии |
| Source registry | 🟢 | `chemistry_source_documents` содержит отдельные provenance-записи |
| Unified catalog | 🟢 | оба источника представлены в общем каталоге |
| Duplicate handling | 🟢 | одинаковый текст не удаляется без проверки происхождения |
| Source attribution | 🟡 | неустановленный источник не приписывается догадкой |


### Pass 27 — Химический банк на сайте (2026-10-07)
- 🟢 Добавлен API `GET /api/v1/tests/chemistry-master` с поиском, типом задания, фильтром сохранённых формул и пагинацией.
- 🟢 На странице «Тесты и билеты» выведен единый банк из 436 элементов.
- 🟢 В карточке сохраняются вопрос, ответ (если подготовлен), источник, номер источника и статус ответа.
- 🟢 Формульные задания визуально помечаются; неподготовленные ответы явно показываются как требующие решения.


## 2026-10-07 — Storage architecture clarification: Supabase Free + SpaceWeb media

Зафиксирована окончательная модель хранения проекта:

| Слой | Роль |
|---|---|
| Supabase Free | БД, Auth, RLS, metadata, связи, вопросы/тесты, учебный план, trainer cards |
| SpaceWeb | физическое тяжёлое media: фото, изображения препаратов, электронограммы, крупные документы |
| GitHub | код, миграции, документация, небольшие декларативные контентные артефакты |
| Vercel | frontend и deployment, не постоянное media-хранилище |

Для большого content.zip действует правило: **не требуется загружать весь архив в чат целиком**. Его можно анализировать и переносить частями; полнота архива не должна зависеть от лимита вложения чата.

По текущему content.zip:
- 444 фактических файлов;
- 389 изображений;
- 207 уникальных изображений после дедупликации;
- 206 trainer feed cards уже есть в Supabase;
- 28 EM представлены в данных;
- физические файлы должны быть подтверждены отдельно на SpaceWeb.

Важно: наличие записи в Supabase не считается доказательством наличия физического файла. Финальный media gate:
Supabase metadata → API → SpaceWeb → HTTP 200.

public.files/Supabase Storage не являются обязательным местом для всех histology images. Использование их для всего архива не требуется и не должно делаться автоматически из-за ограничения бесплатного Supabase.

Статус: 🟡 DB/content metadata в основном синхронизированы; SpaceWeb physical media verification остаётся отдельным target-environment этапом.


## 2026-10-07 — SpaceWeb media root подтверждён

По прямому скриншоту файловой системы SpaceWeb подтверждено физическое наличие Histology media root под /public_html/....

В корне видны:
- source-materials;
- electronograms;
- em;
- 5_Фотографии препаратов;
- дополнительный каталог с Unicode/URL-encoded именованием;
- README.md.

Поэтому физический архив не следует считать отсутствующим только потому, что его нет в GitHub или public.files Supabase.

| Проверка | Статус |
|---|---|
| SpaceWeb media root существует | 🟢 подтверждено |
| Ожидаемая структура каталогов | 🟢 подтверждена |
| Все файлы из исходного content.zip сопоставлены | 🟡 ещё требуется |
| Все 206 trainer cards → физические файлы | 🟡 ещё требуется |
| 28 EM → физические файлы | 🟡 ещё требуется |
| Materials → физические документы/фото | 🟡 ещё требуется |
| Production HTTP media smoke | 🟡 ещё требуется |

Каноническая схема:
Supabase Free → metadata/source_key/path → SpaceWeb physical file → API endpoint.


## 2026-10-07 — Question Library

🟢 Реализована полноценная база вопросов для всех авторизованных пользователей:
- все опубликованные типы вопросов;
- ответы доступны без запуска теста;
- предмет/тип/поиск;
- пагинация;
- жалоба на конкретный вопрос;
- существующий admin problem center и быстрый редактор используются для обработки жалоб.

🟢 `QuestionReport` уже существовал и теперь рассматривается как обязательная часть карточки каждого вопроса, а не только тестового прохождения.


## 2026-10-07 — subject-scoped Question Library

🟢 Из предметной страницы «База вопросов» открывается с фиксированным `subject_slug`. Гистология → только гистология; органическая/физическая химия → только химия. Для гистологии отдельно сохранён тренажёр микропрепаратов. Глобальный вход в базу без subject context допускает ручной выбор предмета.


## 2026-10-07 — Source-of-Truth Audit

🟢 Создан единый документ `docs/PROJECT-SOURCE-OF-TRUTH-AUDIT-2026-10-07.md`, который объединяет правила продукта, архитектуры и release-gates.

🟡 Остаточные зоны не закрыты формально до runtime/browser/physical-media проверки: Histology reconciliation, Materials files, schedule session integrity, единый schedule+homework UX, production auth/runtime, latest CI, strict TS/ESLint, timezone centralization и полный mobile/browser acceptance.


## 2026-10-07 — Zero-cost / full-functionality release gate

| Контур | Статус | Правило |
|---|---|---|
| GitHub Free | 🟢 | source/docs/migrations/CI в бесплатных лимитах |
| Vercel Hobby | 🟢 | frontend/deployment без обязательного Pro |
| SpaceWeb Free | 🟢 | PHP API/runtime и физический контент в бесплатном лимите |
| Supabase Free | 🟢 | DB/Auth/RLS/metadata без обязательного paid plan |
| Backblaze B2 Free | 🟢 | дополнительное object storage в бесплатной квоте |
| Full functionality | 🟡 | функция не должна урезаться ради free-tier; оптимизация обязательна |
| Unexpected billing protection | 🟡 | для каждого сервиса проверять лимиты и поведение после free quota |
| Optional AI | 🟢 | базовая функция не зависит от платного AI |

Главное правило: **не терять функциональность из-за бесплатных лимитов**. Сначала оптимизировать storage, egress, caching, batching, lazy loading, streaming, deduplication и распределение нагрузки.

Полная политика: docs/FREE-TIER-FULL-FUNCTIONALITY-POLICY-2026-10-07.md.


## 2026-10-07 — Admin Data & Storage Control Center

- 🟢 Database Console уже существует и усилен поиском/пагинацией.
- 🟡 Следующий этап: PC-style управление таблицами, relation inspector, bulk dry-run и health checks.
- 🟡 Затем: единый File & Storage Center для SpaceWeb/B2 и сверки с Supabase metadata.
- 🟡 Затем: агрегированный Operations Dashboard с квотами, проверками, экспортами и безопасным rollback.
- 🟢 Архитектурное правило: Supabase — canonical DB; SpaceWeb/B2 — physical object layers; дополнительные бесплатные сервисы — только специализированные дополнения.

Архитектура: `docs/ADMIN-DATA-CONSOLE-ARCHITECTURE.md`.

## 2026-10-07 — Consolidated Remaining Implementation Map

Все ранее обнаруженные незакрытые направления сведены в единый backlog. Статус 🟡 означает «частично реализовано / требуется target-environment verification или finishing», а не «сломано».

| Направление | Приоритет | Статус | Следующий gate |
|---|---:|---|---|
| Production Vercel/SpaceWeb/CI | P0 | 🟡 | READY + green CI + authenticated smoke |
| Auth / roles / RLS / security | P0 | 🟡 | login/refresh/roles/RLS runtime audit |
| Histology physical media | P0 | 🟡 | 444-file + 206-card + 28-EM reconciliation + HTTP 200 |
| Tests / Question Library | P0 | 🟡 | all published tests smoke + subject isolation |
| Schedule + Homework unified UX | P0 | 🟡 | date → subject → lesson → homework → submission/status |
| Materials viewer/files | P1 | 🟡 | DOCX/PDF/media end-to-end |
| Trainers / preparations | P1 | 🟡 | start/resume/finish/result/error-review |
| Admin Content Center | P1 | 🟡 | question/material/lesson/trainer editing + history |
| Admin DB/File/Storage Center | P1 | 🟡 | relations, bulk dry-run, reconciliation, B2/SpaceWeb |
| Mobile/browser acceptance | P1 | 🟡 | iPhone/Android/Windows/macOS matrix |
| Chemistry master completion | P1 | 🟡 | 220 answers + formula visual verification + OCR expansion |
| Smart grading E2E | P1 | 🟡 | deterministic + optional AI + pending/error retry |
| Code quality | P1 | 🟡 | strict TS/ESLint, timezone, legacy cleanup |
| AI tutor/providers | P2 | 🟡 | verified primary + fallback + context-aware tutor |
| Performance/free-tier optimization | P2 | 🟡 | measurements + cache/lazy/batch/dedup |
| Optional free-service aggregation | P2 | 🟡 | permanent-free service audit before integration |
| Release/documentation discipline | P1 | 🟢/🟡 | baseline + roadmap/status on every risky change |

### Required product flows to preserve
- Auth → dashboard → schedule → subject → tests → preparation → result/history.
- Subject → curriculum → question bank → answer/report → admin correction.
- Histology → atlas/trainer → materials/documents/images.
- Schedule → date → subject → homework → submission → derived status.
- Chemistry → curriculum → unified 436-item master bank → provenance/formulas.
- Admin → DB console → content/storage center → audit/rollback.

### Non-regression rule
Stable baseline 8e8fef5c2f661e7e1d625964909307c00c343884 remains the rollback reference. No backlog item may replace a canonical data source or remove working functionality for the sake of free-tier limits.

### Release order
1. P0 target-runtime and authenticated verification.
2. Physical media/material delivery.
3. Tests/question bank/smart grading smoke.
4. Unified schedule + homework flow.
5. Admin/content/storage workspace.
6. Mobile/browser acceptance.
7. Chemistry completion and trainers/preparation finishing.
8. Strict code-quality cleanup.
9. AI tutor and optional free-service aggregation.
10. Final UI polish and release snapshot.


## 2026-10-07 — P0 implementation pass

🟢 Кодовые исправления: curriculum-map exception handler и связь учебного плана с topic metadata восстановлены.

🟡 Production gate: Vercel build-rate-limit; GitHub Actions/runtime smoke пока без подтверждённого зелёного результата.

Следующий gate: CI → Vercel READY → SpaceWeb runtime → authenticated smoke → следующий P0 контент/расписание.


## 2026-10-07 — P0 verification/fix cycle continuation

- 🟢 Vercel commit `59e38d9664645556bd2fca64ea6d97f998a5f200` достиг READY; combined GitHub status для него — Vercel success.
- 🟢 HealthChecker hardened: public health no longer exposes DB host/port/user or raw connection diagnostics.
- 🟢 Histology Materials: authenticated SpaceWeb physical-file fallback added to generic Materials page; dedicated HistologyMaterials already uses authenticated file loading.
- 🟢 Schedule + Homework: source/UI audit confirms current schedule page already selects a concrete date + subject and creates homework with that subject/date/group context; planner returns homework, attendance and recovery in one response.
- 🟡 Latest post-READY commits currently cannot receive a new Vercel deployment because of external `build-rate-limit`; therefore those latest fixes remain source-verified until a READY deployment exists.
- 🟡 SpaceWeb physical-file HTTP verification and authenticated production smoke remain open gates.


## 2026-10-07 — verification cycle

- 🟢 Supabase: `public.chemistry_source_documents` теперь защищена RLS.
- 🟢 Supabase policy: только `authenticated SELECT`; записи остаются server-side.
- 🟢 Security advisor повторно проверен: критический `rls_disabled` для этой таблицы устранён.
- 🟡 Supabase Auth: остаётся отдельное предупреждение Leaked Password Protection; это следующий security hardening gate.
- 🟡 Subject isolation: обнаружены повторяющиеся `subjects.slug` (в том числе histology=2, chemistry_organic_physical=3); нельзя делать глобальную уникальность slug без миграции контекста. Следующий шаг — authoritative subject UUID/context в search/question-bank boundary.

## 2026-10-07 — media optimization requirement
- 🟡 Added Media Optimization Pipeline to roadmap.
- 🟡 Target architecture: original → optimized master → thumbnails/responsive derivatives → client.
- 🟡 WebP/AVIF for images; WebM/AV1/VP9 reserved for video/animation, not ordinary photos.
- 🟡 Server-side processing, checksum deduplication, EXIF stripping, responsive sizes, cache headers and storage/egress metrics are required.
- 🟡 Existing Atlas/content and Materials physical-file architecture must remain compatible.


## 2026-10-07 — Media quality/readability gate

🟡 Media Optimization остаётся IN PROGRESS. Дополнительно зафиксировано:

- content-aware classification вместо единого quality profile;
- несколько compression/quality candidates для значимых изображений;
- отдельная проверка мелкого текста, подписей, формул и учебных деталей;
- выбор самого лёгкого кандидата, прошедшего quality/readability threshold;
- автоматический переход на менее сжатый вариант при провале проверки;
- fallback на original, если ни один derivative не проходит quality gate;
- при неопределённости quality-check запрещено рисковать читаемостью;
- original не удаляется ради экономии размера, если нужен zoom/восстановление/архив;
- DONE только после проверки реальных фото препаратов, ЭМ, атласа, лекционных материалов и 1080p-видео на mobile/desktop.


## 2026-10-07 — Pass 28: subject isolation hardening

| Контур | Статус | Результат |
|---|---|---|
| exam_questions | 🟢 | subject_id authoritative filter added; slug remains fallback |
| Ticket generation | 🟢 | bank subject UUID preferred |
| Question Library catalog | 🟢 | preserves distinct subject UUIDs even with duplicate slugs |
| Global Search | 🟢 | supports authoritative subject_id boundary |
| Admin content package | 🟢 | ambiguous duplicate slug is rejected without explicit UUID |
| Live ticket-bank integrity | 🟢 | current banks have matching subject UUIDs with their question pools |
| Frontend subject propagation | 🟡 | slug-only legacy entry points still need migration to UUID context where available |
| Vercel/SpaceWeb runtime | 🟡 | latest commits remain source-verified until READY deployment/runtime smoke |


## 2026-10-07 — Pass 28A: Question Library UUID propagation

| Контур | Статус | Результат |
|---|---|---|
| Question Library frontend | 🟢 | передаёт subject_id, если UUID известен |
| Legacy slug-only context | 🟢 | безопасный auto-resolve только при единственном matching subject_id |
| Ambiguous subject slug | 🟢 | не угадывается; пользовательский выбор остаётся доступен |
| Full legacy entry-point migration | 🟡 | требуется отдельный cleanup по старым ссылкам |


## 2026-10-07 — Pass 29: Smart grading state machine

| Контур | Статус | Результат |
|---|---|---|
| Deterministic grading | 🟢 | exact/normalized path before AI |
| Optional AI fallback | 🟢 | AI does not define whether a test can be completed |
| Pending/error semantics | 🟢 | completion is allowed; unresolved answer remains stored |
| Normal test retry | 🟢 | dedicated regrade endpoint + score recalculation |
| Preparation retry | 🟢 | dedicated retry endpoint for one/all unresolved answers |
| Frontend authority | 🟢 | Test/Preparation UI reads server grading result |
| AI review after preparation | 🟢 | separate optional analytics, not a completion dependency |
| Real test E2E | 🟡 | requires target-runtime authenticated smoke |


## 2026-10-07 — Pass 30: file visibility security alignment

| Контур | Статус | Результат |
|---|---|---|
| FileRepository server authorization | 🟢 | group-null no longer means global access |
| Supabase files RLS | 🟢 | owner/public/active-member semantics aligned |
| B2 presign boundary | 🟢 | presign follows server access check |
| Security advisor | 🟢/🟡 | file-policy issue cleared; leaked-password warning remains |
| Runtime authorization smoke | 🟡 | owner/public/group/inactive/unrelated cases still require target environment |


## 2026-10-07 — Pass 31: Histology material viewer access

| Контур | Статус | Результат |
|---|---|---|
| Histology material viewer | 🟢 | MBH specialty check added before physical-file delivery |
| Generic Materials | 🟢 | specialty filtering already present |
| Direct viewer bypass | 🟢 | authenticated user without MBH can no longer use the Histology viewer endpoint |
| Physical media runtime | 🟡 | final SpaceWeb HTTP/browser smoke remains |


## 2026-10-08 — Histology Lecture 05 / practical cross-links

| Контур | Статус | Результат |
|---|---|---|
| Lecture 05 body | 🟢 | «Кровь и лимфа» опубликована в site_content |
| Curriculum link | 🟢 | module/topic UUID привязан к canonical теме Недели 5–6 |
| Preparation links | 🟢 | 8 существующих карточек «Кровь мазок» связаны как учебные cross-links |
| Electronograms | 🟢 | нейтрофильный фагоцитоз + капилляр записаны как релевантные ЭМ |
| Materials | 🟢 | «4.Кровь» + source-backed методический материал связаны |
| Test | 🟢 | «Гистология — общая: кровь», 20 вопросов |
| Exam questions | 🟢 | подтверждённые IDs записаны в lecture metadata |
| Production/browser smoke | 🟡 | требуется target-runtime проверка |
| Automatic related-content UI | ⬜ | следующий product step; пока есть явные ссылки внутри лекции |

Лекция теперь строит не только теоретический текст, а маршрут занятия: **теория → препарат → признак → ЭМ → тест → экзаменационный вопрос**.

Важно: существующие trainer-карточки не были переназначены на другой plan_topic только ради этой связи. Cross-link не меняет canonical учебную принадлежность контента.


## 2026-10-08 — Histology Lecture 05 / Mermaid rendering repair

| Контур | Статус | Результат |
|---|---|---|
| Mermaid source | 🟢 | 11 Mermaid-блоков в `body_md` проверены; лишнее экранирование обратных кавычек и кавычек удалено |
| LectureRenderer | 🟢 | добавлена нормализация импортированного Markdown перед разбором блоков |
| Live Supabase content | 🟢 | `escaped_backticks=0`, `escaped_quotes=0`, `mermaid_blocks=11` |
| Production/browser smoke | 🟡 | требуется после публикации нового frontend commit |


### 2026-10-08 — Lecture 05: links + visual references
- 🟢 Fixed Markdown link rendering in `LectureRenderer`: internal lecture links such as «Микропрепараты» and the 20-question test now become actual clickable anchors.
- 🟢 Added 9 visual blocks to Lecture 05: 5 existing MEDBIOHIM blood-smear preparation images + 4 independent University of Utah WebPath images.
- 🟢 External images are used only as a visual cross-check; canonical MEDBIOHIM trainer cards remain the primary practical material.
- 🟢 Live Supabase lecture updated and verified; only Lecture 05 was touched.
- 🟡 Runtime/browser smoke on deployed Vercel build remains to be confirmed.
\n## 2026-10-08 — Histology Lecture 05: production link/media repair\n\n🟢 По iPhone/Safari smoke со скриншотами подтверждены две реальные причины регрессии:\n- ссылки Markdown в production всё ещё показывались текстом, потому что предыдущая версия regex в LectureRenderer была некорректно экранирована;\n- 5 собственных фото лекции обращались напрямую к /content/histology на Vercel, хотя физические файлы Histology находятся на SpaceWeb и должны проходить через authenticated trainer-media pipeline.\n\n🟢 Исправлено:\n- LectureRenderer получил корректный Markdown-link parser для внутренних и внешних URL;\n- изображения собственных препаратов Lecture 05 переведены на canonical trainer IDs;\n- ImageBlock теперь получает authenticated trainer image через существующий getTrainerImageUrl(), поэтому Authorization не теряется на обычном <img>;\n- live Supabase Lecture 05 обновлена: старых прямых /content/histology/... URL в этих пяти блоках больше нет;\n- создана воспроизводимая миграция database/migrations/20261008_histology_lecture_05_trainer_images_fix.sql;\n- 4 внешних WebPath-фотографии остаются прямыми HTTPS-источниками и продолжают работать без авторизации.\n\n🟡 Не ставить production DONE до нового Vercel READY + повторного iPhone/Safari smoke: ссылки, 5 MEDBIOHIM-фото, 4 WebPath-фото, Mermaid и тестовый переход должны быть проверены именно в deployed build.
 
## 2026-10-08 — Histology Lecture 05: learning UX / photo-text / mini-tests / Atlas viewer

**Статус: 🟡 IN PROGRESS**

| Область | Статус | Факт |
|---|---|---|
| Lecture 05 source | 🟢 | `site_content(key=lectures)`, id `lec-histology-blood-20261008` |
| Curriculum | 🟢 | module/topic canonical UUID сохранены |
| Markdown renderer | 🟢 | headings, bold, tables, blockquotes, links восстановлены |
| Mermaid | 🟢 | 11 блоков Lecture 05 |
| Canonical trainer photos | 🟢 | 5 lecture photo blocks используют trainer IDs |
| Photo ↔ text | 🟢 | название/метаданные берутся из trainer card |
| Visual checkpoints | 🟢 | изображения распределены по смысловым местам, старый photo wall удалён |
| Mini-tests | 🟢 | 6 блоков после логичных разделов, вопросы из `public.questions` |
| Mini-test grading | 🟢 code/live API | server-side check, answer key не передаётся клиенту |
| Atlas viewer | 🟢 code | centered viewport modal + zoom + close + fullscreen fallback |
| WebPath | 🟢 | 2 external cross-check images |
| Vercel production | 🟡 | нужен READY/build smoke после последних commits |
| SpaceWeb | 🟡 | новые mini-quiz endpoints нужно развернуть |
| iPhone Safari | 🟡 | нужен реальный authenticated smoke |
| Cross-page regression | 🟡 | проверить лекции/атлас/тренажёр/материалы |

### Full ledger
- Lecture 05 curriculum/content sync;
- 8 trainer cross-links;
- 2 EM links;
- 20-question blood test link;
- 9 exam-question links;
- 5 protected trainer image repairs;
- Markdown link repair;
- Mermaid normalization;
- Markdown renderer regression repair;
- canonical trainer-image flow;
- viewport-centered image lightbox;
- Atlas zoom/fullscreen behavior;
- 6 database-backed mini-tests;
- photo-text deduplication;
- contextual visual checkpoints;
- removal of old duplicate photo wall;
- documentation in ROADMAP / SYNC_STAMP / dedicated learning UX document.

### Release gate
До 🟢 DONE проверить deployed/authenticated runtime:
1. Lecture 05 opens;
2. Markdown/table/link rendering;
3. 6 mini-tests load and grade;
4. 5 MEDBIOHIM photos load;
5. photo card text matches canonical trainer card;
6. image viewer is centered on viewport;
7. zoom/close/fullscreen work on iPhone Safari;
8. WebPath images work;
9. 11 Mermaid blocks work;
10. full 20-question blood test still opens.

 
### 2026-10-08 — новое дополнение Lecture 05: возрастные нормы

| Пункт | Статус |
|---|---|
| Возрастная временная шкала | 🟢 |
| Таблица лейкоцитарной формулы по возрастам | 🟢 |
| Гемограмма новорождённого / грудного / взрослого | 🟢 |
| Экспресс-алгоритм возрастной карточки | 🟢 |
| Мини-тест из существующей БД гистологии | 🟢 |
| Различия референсов сохранены как варианты | 🟢 |
| Runtime Safari / production smoke | 🟡 |

Lecture 05 теперь содержит **8 database-backed mini-test blocks** после логичных учебных разделов.


## 2026-10-08 — Image viewer controls

- 🟢 В src/components/media/ImageLightbox.tsx добавлены явные пользовательские кнопки: «Открыть на весь экран», «Уменьшить», «Увеличить», «Сбросить», «Полный экран», «Закрыть».
- 🟢 Кнопка открытия вынесена непосредственно на карточку изображения, чтобы действие было очевидно на мобильном устройстве.
- 🟢 Нативный Fullscreen API используется как дополнительный режим; fixed viewport-lightbox остаётся fallback для Safari.
- 🟡 Не считать production/runtime DONE до Vercel READY и реального iPhone Safari smoke.
- Commit: 7735ff1ccdc21b509ca6e61bb8267d81a3a1a4bf.


## 2026-10-08 — Unified Media Viewer audit / correction

| Контур | Статус | Фактическое состояние |
|---|---|---|
| Atlas outer modal | 🟢 FIXED IN BRANCH | удалён вложенный 90vh + overflow-auto слой |
| Unified viewer | 🟢 CODE | 100dvh, safe-area, controls, zoom/pan, desktop wheel/double-click, touch Pointer Events |
| Native fullscreen | 🟡 ENHANCEMENT | используется только если браузер разрешает; viewer без него остаётся полноценным |
| Lecture viewer | 🟡 | использует общий ImageLightbox, нужен regression smoke |
| Trainer viewer | 🟡 | общий компонент используется, нужен regression smoke |
| Materials viewer | 🟡 | отдельный document/photo modal ещё требует отдельного UX-аудита |
| Windows desktop | 🟡 | обязательный реальный browser smoke |
| iPhone Safari | 🟡 | обязательный реальный authenticated smoke |
| Android Chrome | 🟡 | обязательный touch/pinch smoke |
| Cross-page regression | 🟡 | lecture → atlas → trainer → materials |

Правило: наличие кода не переводит эти пункты в DONE; нужен target-runtime/browser evidence.


### 2026-10-08 — viewer regression cleanup
- 🟢 literal escaped-newline source artifact устранён из `HistologyTrainerParts.tsx`;
- 🟢 legacy photo-rendering ветка Materials удалена после перехода на unified viewer;
- 🟢 image-file preview в Materials использует unified viewer;
- 🟢 retry для недоступного trainer photo добавлен;
- 🟢 blob URL lifecycle для Materials document/PDF/image preview приведён к управляемому состоянию;
- 🟡 CI/Vercel остаются инфраструктурными release blockers: GitHub jobs создаются, но завершаются без steps/logs; Vercel отвечает `build-rate-limit`.
\n## 2026-10-08 — Unified Media Viewer: viewport/stacking correction\n\n| Viewer portal / viewport | 🟢 CODE PATCHED | `ImageLightbox` moved to `document.body` portal; explicit 100vw/visualViewport sizing and top-level z-index; glass colors made explicit |\n| iPhone Safari smoke | 🟡 | must confirm viewer covers MobileNav, fills visible viewport, centers image and prevents page scroll |\n| Cross-platform viewer smoke | 🟡 | Windows/macOS/iPhone/Android + Lecture → Atlas → Trainer → Materials |\n| Production DONE | 🔴 | blocked until target-runtime proof for exact commit |\n
2026-10-08 — launch-blocker sweep: fixed a real PHP source artifact (`Router;\\nuse`) in `backend/config/routes/questions_rest.php` on the existing `fix/unified-media-viewer-desktop-mobile` branch. No new branch. GitHub Actions still terminates before steps/logs, while Vercel reports the external build-rate-limit blocker; source/runtime acceptance remains pending.


## 2026-10-08 — Final pre-launch sweep

| Контур | Статус | Фактическое состояние |
|---|---|---|
| Materials physical delivery | 🟢 CODE | canonical B2 presigned URL + authenticated legacy Histology fallback |
| Vercel media proxy | 🟢 CODE | media redirect/cache/disposition headers preserved |
| Materials URL negotiation | 🟢 CODE | dedicated `file-url` JSON endpoint avoids browser opaque redirects |
| Schedule DB integrity | 🟢 LIVE | 309/309 entries have `session_id`; duplicate index removed |
| Question/test integrity | 🟢 LIVE | 479/479 published active Histology questions linked; duplicate/orphan links 0 |
| Homework backend syntax | 🟢 CODE | confirmed/fixed PHP SQL string quoting defect |
| Atlas unified viewer | 🟢 CODE | portal + viewport + zoom/pan/fullscreen/close; runtime pending |
| Vercel deployment | 🔴 BLOCKED | external build-rate-limit on current period |
| SpaceWeb runtime | 🟡 | exact backend commit + media HTTP smoke required |
| Browser acceptance | 🟡 | iPhone/Android/desktop required after deployment |
| AI providers | 🟡 | external credentials/network; optional for base grading path |

Правило неизменно: production DONE только после exact-deployment + authenticated runtime evidence.

## 2026-10-08 — Pre-launch security/deployment gate

- 🟢 Removed the hardcoded Supabase anon key from src/lib/supabase.ts.
- 🟢 Removed the same hardcoded key fallback from the Vercel API proxy; deployment now requires the configured environment variable.
- 🟢 Vercel successfully built the preceding branch commit 87c13f01eb5fb983dd063cf90d0c0e5744f27ef0 (READY).
- 🟡 The next source commit is not yet represented by a new Vercel deployment; Vercel API access available in this session cannot create a fresh deployment for the project.
- 🟡 GitHub Actions MEDBIOHIM code checks currently fails both backend/frontend jobs immediately with zero steps executed; this is an Actions runner/infrastructure gate, not a reported PHP/TypeScript test failure.

## 2026-10-08 — Atlas viewer visual baseline restored

- 🟢 `ImageLightbox` now uses the `main` branch visual composition as the source of truth: dark translucent viewport, centered image, compact top controls, no large white modal card.
- 🟢 New functionality remains: portal to `document.body`, viewport/safe-area handling, external/open-on-mount use, title/details, fullscreen, zoom controls and background scroll lock.
- 🟢 The viewer must not alter Atlas page layout or inherit the position of the source card.
- 🟡 Target-device smoke test remains required before production sign-off.


## 2026-10-07 — Pass 32: Schedule → exact lesson → homework → photos
| Exact lesson homework binding | 🟢 | `homeworks.schedule_entry_id` implemented in API/repository/UI; live column + index verified |
| Homework photo attachments | 🟢 source | Multi-photo creation UI + `homework_attachments` + B2 delivery implemented; authenticated runtime E2E still pending |
| Starosta homework creation | 🟢 source | UI and backend now recognize group `starosta`; ordinary student cannot publish shared homework |
| Homework due_date persistence | 🟢 | Primary repository now writes `due_date` |
| Private test env inventory | 🟢 | Variable families documented; secret values remain outside GitHub |
| Target runtime deployment smoke | 🟡 P0 | Latest branch still needs READY Vercel/SpaceWeb authenticated smoke |

| Materials physical delivery semantics | 🟢 source | live audit explains 80 Histology source_path-only rows; unified viewer fix is in draft PR #16; runtime HTTP smoke still pending |

| File & Storage Center foundation | 🟢 source | checksum/provider/processing metadata + non-destructive reference audit UI/API implemented |
| Physical object reconciliation | 🟡 | B2/SpaceWeb existence/head checks still required |
| Media optimization pipeline | 🟡 | quality-gated image/video derivatives remain next implementation stage |

## 2026-10-07 — Pass 34: complete B2 reconciliation foundation

| Контур | Статус | Результат |
|---|---|---|
| B2 metadata keyset | 🟢 | строится по всем active B2-backed files, независимо от UI limit |
| B2 pagination | 🟢 | audit проходит страницы B2 до завершения |
| Missing physical objects | 🟢 source | DB B2-backed records отсутствующие в B2 считаются отдельно |
| B2 orphan objects | 🟢 source | объекты без соответствующего B2 metadata key считаются отдельно |
| Provider isolation | 🟢 | SpaceWeb/unknown не ошибочно считаются B2 |
| Storage Center UI | 🟢 source | показывает «нет в B2» и «нет в БД» |
| SpaceWeb reconciliation | 🟡 | нужен target-runtime/host доступ к физическому дереву |
| Media optimizer | 🟡 | следующий implementation pass |
| Target runtime | 🟡 | GitHub source changed; production verification blocked by deployment/runtime gates |


## 2026-10-07 — Pass 35: media derivative metadata foundation

| Контур | Статус | Результат |
|---|---|---|
| file_variants schema | 🟢 | dedicated parent/variant metadata table added |
| Variant uniqueness | 🟢 | one variant key per parent file |
| Processing state | 🟢 | ready/queued/processing/failed/skipped |
| Variant visibility | 🟢 | RLS follows parent file access boundary |
| Physical derivative generation | 🟡 | not yet implemented; requires runtime capability/worker verification |
| Existing binaries | 🟢 | untouched by this pass |


## 2026-10-07 — Pass 36: content-aware media quality gate

| Контур | Статус | Результат |
|---|---|---|
| Content classification roles | green | policy has distinct gates for text/diagram/scan and specimen/EM/atlas |
| Downscale protection | green | rejects overly aggressive derivative dimensions |
| Text readability gate | green | rejects candidates below readability threshold for text-heavy media |
| Detail/edge gate | green | protects EM/micropreparation/atlas/diagram detail |
| Artifact gate | green | rejects candidates with excessive compression artifact score |
| Video ladder policy | green | 1080p preserved, 720p/480p fallbacks available |
| Actual encoder | yellow | requires runtime capability/worker integration |
| Perceptual metrics | yellow | requires real generated candidates and validation samples |


## 2026-10-07 — Pass 37: safe derivative processor foundation

| Контур | Статус | Результат |
|---|---|---|
| FileVariantRepository | 🟢 source | upsert/list/status для производных |
| MIME detection | 🟢 source | фактический MIME через finfo |
| WebP/AVIF generation | 🟡 | выполняется только если GD encoder реально доступен на runtime |
| Quality policy integration | 🟢 source | generated candidates проходят MediaQualityPolicy |
| Original preservation | 🟢 | оригинал не удаляется и не переписывается |
| Admin processing endpoint | 🟢 source | strict-admin ручной запуск для B2-backed image |
| Automatic queue/worker | 🟡 | намеренно не заявлен до target-runtime verification |
| Perceptual quality metrics | 🟡 | пока отсутствуют реальные text/detail/artifact measurements |
| Target runtime smoke | 🟡 | требуется реальный SpaceWeb/B2 image processing test |


## 2026-10-08 — Histology lectures

🟢 **Lecture bodies:** выполнено. 20 опубликованных canonical records в `site_content`; 19 тел собраны из source-backed `materials` (`Гистология.zip`) + ранее существовавшая полноценная Lecture 05. Добавлена отдельная supplementary лекция по гистотехнике. Legacy пустые stubs переведены в `is_published=false`.

🟢 **Reproducibility:** добавлена `database/migrations/20261008_histology_full_lectures.sql`.

🟡 **Не считать финальным production gate:** browser/Vercel smoke и физическая media reconciliation остаются отдельными проверками.

## 2026-10-08 — Histology lecture-plan learning links

| Контур | Статус | Результат |
|---|---|---|
| Exact lecture titles | 🟢 | 16/16 текущих лекций совпадают с названиями curriculum 1:1 |
| Plan ordering | 🟢 | LectureService::listPublished() сортирует по curriculum.order_index |
| Word methodics | 🟢 | 16/16 имеют конкретный source-backed methodic/section |
| Page ranges | 🟢 source / 🟡 legacy .doc | Надёжные страницы указаны; для старых .doc показывается проверенный section title без выдуманной пагинации |
| Scheme/file attachments | 🟢 | 16/16 имеют связанные схемы/файлы |
| Micropreparations | 🟢 | 16/16 имеют связанные препараты; для Lecture 01 добавлены 3 клеточных препарата как явные визуальные cross-links |
| Electronograms | 🟢 source-backed | Подключены только там, где есть канонические cards текущей темы |
| Topic ownership | 🟢 | Исправлены выявленные cross-topic trainer mappings |
| Lecture UI | 🟢 source | На странице лекции показываются methodics/files/preparations/EM с открытием |
| Runtime Word delivery | 🟡 | Физическое наличие legacy .doc на SpaceWeb и authenticated browser smoke ещё требуется подтвердить |

### Canonical sequence
**План → точное название лекции → методичка → страницы/раздел → схемы/файлы → микропрепараты → ЭМ → тесты/вопросы.**

Репродуцируемые миграции: database/migrations/20261008_histology_lecture_plan_learning_links.sql и database/migrations/20261008_histology_lecture_01_preparations.sql.


## 2026-10-08 — Rich lecture editor / Lecture 05 standard

| Контур | Статус | Результат |
|---|---|---|
| Lecture 05 canonical format | 🟢 | сохранены исходные 11 Mermaid + 7 image + 8 quiz blocks и source-backed tables |
| Lossless editor round-trip | 🟢 source | body_md special blocks открываются как редактируемые placeholders и сериализуются обратно |
| Mermaid builder | 🟢 | конструктор узлов/связей + raw Mermaid режим |
| Table builder | 🟢 | табличный ввод с Markdown round-trip |
| Mini-quiz builder | 🟢 | выбирает существующие question IDs без переноса эталонных ответов в лекцию |
| Formula / chemistry / chart / video | 🟢 | отдельные вставляемые block types |
| Trainer / EM picker | 🟢 | выбор канонических карточек из атласа/ЭМ |
| Lecture learning-link editor | 🟢 | methodics + pages/section + files + preparations + EM |
| Admin API | 🟢 | related_learning разрешён в lecture PATCH |
| Remaining lectures rich layer | 🟢 | 15 лекций получили source-backed scheme + preparations + mini-test |
| Full parity with Lecture 05 depth | 🟡 | ещё нужен отдельный source-backed content expansion pass |
| Vercel production verification | 🟡 | текущий Vercel gate — build-rate-limit, не ошибка TS/build |


## 2026-10-08 — Canonical lecture editor cleanup

| Контур | Статус | Результат |
|---|---|---|
| Single admin editor | 🟢 | legacy embedded RichEditor удалён; используется RichLectureEditor |
| Lossless special blocks | 🟢 | Mermaid / image / quiz / chart / chem / video / formula сохраняются через block serialization |
| Tables | 🟢 | Markdown table round-trip + direct cell editing |
| Scheme creation | 🟢 | визуальный конструктор узлов/связей + raw Mermaid |
| Learning links | 🟢 | methodics/pages/files/preparations/EM редактируются из admin form |
| Curriculum title invariant | 🟢 | current Histology save принудительно оставляет plan title |
| Vercel gate | 🟡 | build-rate-limit остаётся внешним ограничением Vercel; source-side check продолжен independently |


## 2026-10-08 — Lecture 05 leukocyte differential trainer

🟢 В Лекцию 05 lec-histology-blood-20261008 встроен интерактивный тренажёр лейкоцитарной формулы.
- проценты: запоминание учебной нормы взрослого;
- ↑/↓: распознавание нейтрофилии/нейтропении, лимфоцитоза/лимфопении, эозинофилии, базофилии, моноцитопении и сдвига влево;
- мазок: распознавание клетки по изображению;
- два визуальных источника: локальные canonical MEDBIOHIM trainer cards и независимая внешняя сверка WebPath;
- внешний лабораторный reference-check отделён от учебной нормы Lecture 05 и помечен как вариант, зависящий от лаборатории;
- тренажёр является отдельным переиспользуемым блоком leukocyte в RichLectureEditor / LectureRenderer.

Важно: Lecture 05 уже редактируется через единый RichLectureEditor; новый тренажёр теперь также доступен как вставляемый блок редактора.


## 2026-10-08 — Unified Media Viewer refinement + branch audit

| Контур | Статус | Результат |
|---|---|---|
| Cursor/touch anchored zoom | 🟢 | масштабирование сохраняет точку под курсором или в центре pinch-жеста |
| Pinch/pan | 🟢 source | Pointer Events + двухпальцевый zoom + bounded drag/pan |
| Responsive controls | 🟢 source | компактные touch controls, safe-area, viewport через portal |
| Shared viewer | 🟢 | Atlas, Lecture, Materials и Trainer используют один `ImageLightbox` |
| Viewer branch reconciliation | 🟢 | `fix/unified-media-viewer-desktop-mobile` содержит 0 уникальных коммитов относительно `main` |
| Stale divergent branches | 🟡 | `beta`, `fix/chem-rendering-tests-rdkit`, `fix/lecture-service-schedule-home` требуют selective port/review, не wholesale merge |
| Target-runtime smoke | 🟡 P0 | exact `main` deployment + iPhone/Android + Windows/macOS + cross-page regression |


## 2026-10-08 — Leukocyte practical case-card trainer

| Контур | Статус | Результат |
|---|---|---|
| Source norms | 🟢 | возрастные колонки взяты из `4.Кровь.docx` |
| Cell recognition | 🟢 | карточка показывает учебный мазок, ответ вводится вручную |
| Age norm | 🟢 | ответ вводится вручную по возрастной колонке |
| Result transcription | 🟢 | процент показывается на карточке, студент переписывает его в 3-е поле |
| Conclusion | 🟢 | сравнение результата с нормой + термин из методички |
| Grade 2 | 🟢 | любая ошибка в одном из первых 4 полей |
| Grade 4 | 🟢 | первые 4 поля полностью верны |
| Grade 5 | 🟢 | первые 4 поля верны + функция клетки связана с учебной диагностической гипотезой |
| Mobile / desktop | 🟢 source | адаптивная карточная сетка + общий ImageLightbox |


### ✅ 2026-10-08 — практическая карточка: один лейкоцит в кадре

**Статус: готово в main.**

Распознавание клетки теперь проверяется только по однозначному визуальному примеру: одиночные локальные trainer-карточки для нейтрофила, лимфоцита и моноцита; сфокусированные изображения для эозинофила и базофила. Общие кадры вроде HEME002 больше не выбираются как исходное изображение для случайной клетки. Viewer умеет открывать такой сфокусированный кадр и дальше увеличивать/перемещать его.


### ✅ 2026-10-08 — фото + учебные рисунки в карточке лейкоцитов

**Статус: готово в `main`.**

Тренажёр теперь разнообразит визуальные примеры: случайно выдаётся реальный препарат или проверяемый учебный SVG-рисунок. Для одного и того же лейкоцита возможны два варианта рисунка; для части клеток доступны также локальный препарат и сфокусированный WebPath-кадр. В рисунках сохранены ключевые морфологические признаки из `4.Кровь.docx`, поэтому рисунок не является декоративной заменой, а служит самостоятельным учебным примером.


### ✅ 2026-10-08 — сборщик одного и нескольких тестов

В `/admin/tests` добавлен полноценный сборщик: выбор учебного контекста и пула вопросов, сбор одного теста или нескольких вариантов, автоматическая нумерация вариантов, `Сброс для нового теста`, предварительное отключение публикации и понятное описание структуры теста/вопроса.


### ✅ 2026-10-08 — уточнение п/я и с/я на карточках общего мазка

Для общего мазка тренажёр теперь прямо сообщает, требуется ли определить общую популяцию или конкретную клетку. В карточке «Нейтрофилы всего» добавлено объяснение, что п/я и с/я считаются вместе, а также краткое правило различения палочкоядерной и сегментоядерной формы. Ответ «сегментоядерные»/«палочкоядерные» не засчитывается как «нейтрофилы всего».


### ✅ 2026-10-08 — single-cell only для практической карточки

Тренажёр теперь выдаёт только карточки, где студент действительно должен сам определить конкретную клетку. Общие мазки, требующие определения популяции «нейтрофилы всего», убраны из рабочего режима. До ответа название клетки нигде не раскрывается.


### ✅ 2026-10-08 — возврат к предыдущим ответам в лейкоцитарном тренажёре

Теперь студент может возвращаться к уже открытым карточкам. Сохраняются собственные введённые ответы и результат проверки; навигация доступна кнопкой «Предыдущая карточка» и по номерам открытых карточек. При переходе назад карточка не пересоздаётся случайно.


### ✅ 2026-10-08 — расширенная памятка по морфологии клеток крови

В практическую карточку добавлена разворачиваемая подробная подсказка с признаками основных лейкоцитов и тромбоцитов, различением п/я и с/я нейтрофилов и экспресс-алгоритмом опознавания.


### ✅ 2026-10-08 — орфография не влияет на оценку

Проверка текстовых ответов теперь отделена от проверки чисел. Студент может писать `базофил` вместо `базофилы`, использовать другой регистр, дефис/пробел или иметь небольшую опечатку — при сохранённом смысле ответ принимается. Значения нормы и результата исследования по-прежнему проверяются численно.


### ✅ 2026-10-08 — тренажёр «Нормы крови»

**Статус: готово в `main`.**

Добавлен отдельный практический тренажёр заполнения возрастной таблицы лейкоцитарной формулы из `4.Кровь.docx`. Студент самостоятельно вписывает все 35 значений, после чего получает самопроверку по каждой ячейке и общий процент правильных ответов. Формат чисел нормализуется без изменения самой нормы: запятая/точка, тип тире и необязательный знак приблизительности не влияют на проверку.


### ✅ 2026-10-08 — тренажёр «Ответ по смыслу»

**Статус: готово в `main`.**

Добавлен свободный текстовый тренажёр по материалу `4.Кровь.docx`. Студент отвечает без вариантов, затем получает смысловую самопроверку по ключевым идеям, подсказку о пропущенных элементах и эталонный ответ. Проверка не зависит от орфографии и дословной формулировки.


### ✅ 2026-10-08 — фото-препараты крови

**Статус: готово в `main`.**

Добавлен тренажёр **«Препараты крови»** с реальными фотографиями из существующего контента. Он связывает изображение с морфологией, функцией и алгоритмом определения: сначала самостоятельный ответ, затем разбор и самопроверка. Для сравнительных фотографий явно указано, какие клетки на них сопоставляются.


## 2026-10-08 — blood sources + SpaceWeb textbooks integration
- BloodPreparationTrainer.tsx теперь использует реальные trainer-фото через защищённый API/ImageLightbox, а не прямые frontend-пути к изображениям.
- В карточках препаратов добавлены источник, ориентир «куда смотреть», пошаговый алгоритм определения, морфология, функция и признаки для дифференциации.
- Карточки опираются на 4.Кровь.docx и дополнительную учебную памятку; сравнительные фото остаются именно сравнительными.
- Для SpaceWeb добавлен защищённый каталог PDF: content/histology/source-materials/Учебники/.
- Frontend раздела «Материалы» автоматически показывает PDF из «Учебники» с сохранением исходных имён файлов; запись в Supabase для самого PDF не требуется.
- Доступ к книгам ограничен авторизацией и специальностью МБХ; путь к файлу проверяется на traversal и выдаётся inline как PDF.
- Точная проверка конкретных atlas-файлов не подменена догадкой: в предоставленных архивах отдельные atlas-картинки с таким именем не обнаружены, поэтому в тренажёр не добавлены выдуманные «atlas» источники.


## 2026-10-09 — admin database console / external SQL connections
- Добавлена защищённая админская консоль /admin/database.
- Основная БД Supabase отображается как встроенное подключение; её server-side реквизиты не выдаются браузеру для редактирования.
- Добавлены профили SpaceWeb: PostgreSQL pg4.sweb.ru:5433, БД ryazansev3, пользователь ryazansev3; MySQL 8 127.0.0.1:3308, БД ryazansev3, пользователь ryazansev3.
- Из сайта доступны настройка подключения, проверка соединения, просмотр таблиц и схем, чтение/поиск строк, вставка, изменение и удаление строк, а также SQL editor.
- Изменяющие SQL-операции требуют явного подтверждения; разрешён один SQL-оператор за запуск; опасные операции чтения файлов/выгрузки запрещены.
- Пароли внешних БД не показываются обратно и хранятся на backend только в зашифрованном виде.
- В Supabase создана отдельная public.admin_db_connections; RLS включён, прямой доступ anon/authenticated закрыт.
- Реальные подключения SpaceWeb пока не тестировались без пароля: профили заполнены по предоставленным реквизитам, поле пароля остаётся пустым до ввода секрета администратором.


## 2026-10-09 — общая отработка по гистологии

**Статус: 🟡 частично выполнено.** В Supabase сохранены 33 записи на 09.10.2026–29.01.2027: понедельник 16:30–18:00 и пятница 15:30–16:00. Фактически обновлено только активное расписание МБХ-201 (semester 3; schedule ID 4cc2d535-4da4-43fa-93f7-bcb3cff471d4). Запрос пользователя — для всех групп первого семестра. Охват других групп и отображение на сайте пока не подтверждены; задача остаётся IN PROGRESS. Отдельно сверить смысл «первого семестра» с выбранным semester 3 до распространения записей. Подробности: docs/HISTOLOGY-MAKEUP-SCHEDULE-2026-10-09.md.


## Pass 41 — функциональная сверка 2026-10-09

- 🔴 P1: trainer `question.options[].correct` доступен в опубликованных карточках через текущие API/публичную SELECT policy. Требуется полный fix across Supabase Data API, PHP, Next fallback и training snapshots; не скрывать только UI.
- 🔴 CI: GitHub Actions повторно закончил до первого шага (`runner_id=0`, `steps=[]`, нет логов). TypeScript/build/PHP checks остаются неподтверждёнными, а не «упавшими на тестах».
- 🟡 Admin Database Console: исправлены два PHP syntax дефекта в `fb4eed97`; runtime smoke ожидает восстановления CI/target access.
- 🟡 Media/source: 28 EM paths требуют сопоставления с физическими файлами; физическое наличие не выводить из DB metadata.
- 🟡 Вопросы/лекции: duplicate/blank-answer candidates и два источника лекций требуют сверки с методичками; массовое удаление/публикация запрещены без content comparison.
- 🔴 AI Tutor остаётся заблокированным до проверки работоспособного провайдера в целевой среде.

Подробности, ссылки на code/CI и последовательность работ: [FUNCTIONAL-AUDIT-2026-10-09-PASS41.md](docs/FUNCTIONAL-AUDIT-2026-10-09-PASS41.md).


## Pass 42 — trainer answer-key mitigation (2026-10-09)

- 🟢 Live Supabase Data API: base trainer_feed_cards is no longer readable by anon/authenticated; trainer_feed_cards_public exposes only sanitized published cards.
- 🟢 Verified using an active MBH membership context: 206 cards visible; 0 correctness flags and 0 answer-bearing fields in the safe view.
- 🟢 Direct client privileges on trainer_feed_answers, trainings and training_answers revoked; submit_trainer_feed_answer RPC added for authenticated server-side scoring.
- 🟢 PHP response boundary and Next.js proxy sanitize newly created/unanswered training snapshots while preserving review data after a question is answered or skipped.
- 🟡 End-to-end flow is not yet accepted: GitHub Actions runner has not run steps; verify latest Vercel frontend and SpaceWeb PHP deployments, then test feed → training → answer → review → complete.
- 🟡 Media, duplicate question review, lecture source reconciliation and AI provider runtime checks remain open.

Details: [SECURITY-FIX-2026-10-09-PASS42.md](docs/SECURITY-FIX-2026-10-09-PASS42.md).


## Pass 43 — API reliability (2026-10-09)

- 🟢 Source: API timeout now combines internal timeout and caller abort; stale cache fallback is marked with stale=true.
- 🟡 Production: latest observed Vercel READY deployment predates commit 77b0f4a1, so this fix is not yet confirmed live.
- 🔴 CI runner: latest code-check jobs still terminate before checkout (runner_id=0, steps=[]).

Details: [RELIABILITY-FIX-2026-10-09-PASS43.md](docs/RELIABILITY-FIX-2026-10-09-PASS43.md).


## Pass 55 — CI + Histology media traceability (2026-10-10)

- 🟢 Reviewed the active Actions workflow source and rechecked latest run/job metadata. Current workflows define frontend/backend tests and SpaceWeb deployment guards, but the job still terminates before steps. No test result is inferred from that failure.
- 🟢 Read-only Supabase audit: 28 Histology electronogram cards; captions on all 28; 28/28 `source_file_id` NULL; five basename mismatches between `source_key` and `preparation.imageUrl`.
- 🟡 Physical files on SpaceWeb/B2 remain unverified; do not rewrite URLs until object existence is checked.
- 🔴 GitHub Actions runner and production/runtime gates remain blocked/unverified.
- Details: `docs/CI-MEDIA-TRACEABILITY-WORKSTREAM-2026-10-10-PASS55.md`.


## Pass 56 — database least-privilege + quality-gate reconciliation (2026-10-10)

- PostgreSQL 17.6 read-only audit: effective MAINTAIN/TRUNCATE/REFERENCES/TRIGGER privileges exist on 71/83 public tables for `anon` and 78/83 for `authenticated`.
- Proposed migration now covers all four privileges and default ACLs for `postgres` and `supabase_admin`; it is not applied.
- Added read-only post-migration verification SQL and corrected stale quality-gate claims: latest Actions runs are pre-step failures, not current green checks.
- Report: `docs/DATABASE-LEAST-PRIVILEGE-STATUS-RECONCILIATION-2026-10-10-PASS56.md`.

## Pass 57 — CI runner retry + DB migration preflight (2026-10-10)

- 🔴 GitHub Actions smoke retry failed again before any step/log (`steps: null`, `logs_url: null`). PHP/frontend tests did not run; no green status claimed.
- 🟡 Reviewed workflow triggers/runner config; evidence still points to runner/platform initialization, with root cause unknown.
- 🟡 Read-only Supabase audit reviewed default ACLs for both observed table owners and role switching for PostgREST. Migration remains prepared, unapplied; no production DDL/DML.
- Next: owner-side Actions usage/permissions/support escalation; identify staging and migration role; run post-migration privilege checks and browser-flow regression only after approved staging validation.
- Report: [Pass 57 CI + DB preflight](docs/CI-DB-PREFLIGHT-WORKSTREAM-2026-10-10-PASS57.md).

## Pass 58 — source-level release gate audit (2026-10-10)

- 🔴 CI still cannot execute steps; no test/build success claimed.
- 🔴 Missing package lockfile means npm install can resolve different dependency versions over time. Must generate and validate a real lockfile in an environment with npm registry access, then switch CI to `npm ci`.
- 🟡 ESLint flat config has no rules; TypeScript errors are ignored by Next's own build, although the predeploy audit separately invokes typecheck. These checks need a working execution environment and remediation before release confidence improves.
- 🔴 FTPS certificate verification is disabled in the deploy workflow. Confirm the hosting certificate/hostname and test before enabling verification.
- 🟡 Existing remote backup is verified before upload, but no tested rollback after partial deploy is present.
- Report: [Pass 58 release-gate source audit](docs/RELEASE-GATE-SOURCE-AUDIT-2026-10-10-PASS58.md).


## Pass 59 — 2026-10-10
- **CI runner:** BLOCKED. Four current-head workflows (code checks, smoke, backend archive, source package) ended in failure; all inspected jobs return `steps: null`. No test command is confirmed to have run.
- **Frontend/PHP validation:** UNVERIFIED; require actual executable Actions results.
- **Lockfile/ESLint quality gates:** OPEN. Do not fabricate a lockfile or enable untested rules without registry-enabled validation.
- **SpaceWeb FTPS:** OPEN; certificate verification remains disabled in deploy workflow and must be validated safely before changing transport settings.
- **Production database/deployment:** unchanged by this pass.
- Evidence: `docs/CI-RUNNER-RECONCILIATION-2026-10-10-PASS59.md`.


## Pass 60 — 2026-10-10
- **CI noise reduction:** source changes in four workflow trigger blocks now skip Markdown-only pushes/PRs where applicable.
- **Verification:** source edits committed; execution of path filters not yet confirmed. Runner initialization blocker remains open; no green checks claimed.
- **Production:** no deployment, secret change, or DB write.
- Report: `docs/CI-DOCS-ONLY-FILTERS-2026-10-10-PASS60.md`.


### Pass 60 verification update
The four workflow-definition commits triggered Actions, as expected; all four latest inspected runs still failed with `steps: null`. Subsequent Markdown-only status commits did not create newer runs in the latest Actions list, consistent with docs-only filters working. CI execution remains blocked/unverified.


## Pass 61 — 2026-10-10
- **Actions diagnosis:** no steps are exposed for code-check backend/frontend; job-log downloads return `BlobNotFound`. Repository is not archived and integration has admin-level access; this does not explain the failure.
- **Required external action:** repository owner must inspect Actions settings/usage/run UI and escalate to GitHub Support if logs remain absent.
- **Tests:** frontend/PHP commands still not confirmed to have executed; no green checks claimed.
- Report: `docs/CI-JOB-LOG-DIAGNOSTICS-2026-10-10-PASS61.md`.


## Pass 62 — 2026-10-10
- **Vercel:** one recent docs-only production deployment observed READY; a newer deployment was BUILDING when inspected, final state unconfirmed.
- **Runtime observability:** log API returned 403; deployment event logs returned 404. This is an access/query blocker, not evidence of no runtime errors.
- **Production smoke:** still required; no application-health or release-green claim.
- Report: `docs/VERCEL-RUNTIME-OBSERVABILITY-2026-10-10-PASS62.md`.




## Pass 63 follow-up — Actions retry (2026-10-10)
- The pre-deploy audit now warns when ESLint config has no recognizable rules/presets; this is a heuristic and does not replace a proper lint baseline.
- The four workflows triggered by the source commit all failed before exposing steps or logs: [code checks](https://github.com/MISTACEN/medbiohim/actions/runs/38019157502), [smoke](https://github.com/MISTACEN/medbiohim/actions/runs/38019157491), [backend archive](https://github.com/MISTACEN/medbiohim/actions/runs/38019157478), [package](https://github.com/MISTACEN/medbiohim/actions/runs/38019157470). No tests are confirmed to have executed.
- Details: [Pass 63 report](docs/PREDEPLOY-AUDIT-STATUS-RECONCILIATION-2026-10-10.md).


## Pass 64 — archive security + pass inventory (2026-10-10)
- Hardened source/backend/SpaceWeb archive workflows to exclude root and nested `.env*` files and added an archive-list guard before upload.
- Recursive repo inventory: 38 documentation files named PASS<number>.md, highest numbered report Pass 64; this is not 62 sequentially completed passes because numbering has historical gaps.
- Unfinished registry currently has 22 closed legacy blockers (C-01…C-22) and 7 broad open workstreams (R1–R7), plus release blockers for CI execution, dependency lockfile/lint, FTPS validation, and DB migration staging.
- Validation caveat: four latest workflow attempts still failed before exposing executable steps/logs; archive guard has not yet run in CI.
- Report: [Pass 64 archive security and inventory](docs/ARCHIVE-SECURITY-AND-PASS-INVENTORY-2026-10-10-PASS64.md).


### Pass 77
- 🟢 Added fail-fast shell mode to SpaceWeb archive creation (`4d37b00438ebfe4a73291e1176e942f0da8f00f1`).
- 🔴 CI execution still unverified: Actions jobs fail before steps with no logs. Do not mark PHP/frontend checks passed until a runner executes them.


### Pass 78
- 🟢 Added regression test for `AccountSettingsService::getPreferences()` and safe defaults; hooked into CI and deployment preflight.
- 🔴 Test execution not verified: GitHub Actions still fails before steps, without logs.


## 2026-10-11 — Product intent and integration contract

- Added canonical product contract: [docs/MEDBIOHIM-PRODUCT-INTENT-AND-INTEGRATION-CONTRACT.md](docs/MEDBIOHIM-PRODUCT-INTENT-AND-INTEGRATION-CONTRACT.md).
- Product direction clarified: standalone student self-preparation platform, not official university site; retain current approved structure and improve in place rather than redesigning.
- Real imported questions must retain provenance and be distinguished from AI-generated/unverified content.
- Homework entry from students, Telegram and future extension import must converge on one shared group workflow; any authenticated member of the same group is intended to be able to add homework, with server-side group-membership checks.
- Telegram has two roles: site registration/login + Web App/Mini App, and group-chat homework ingestion. Current full registration/linking/Mini App flow is not proven end-to-end.
- Open implementation checks: UI/API homework permission mismatch; PHP Telegram webhook secret must fail closed when unset; unify/verify bot and PHP ingestion paths; safely validate Telegram identity and initData.
- These are recorded requirements and findings, not claims of implementation completion. GitHub Actions remains blocked before steps, so CI results are unverified.

## 2026-10-11 — Telegram/homework implementation started

- 🟢 PHP webhook secret now fails closed when either configured or supplied secret is missing; shared validator added at `backend/src/Support/TelegramWebhookSecret.php`.
- 🟢 Added `backend/tests/TelegramWebhookSecretTest.php` and wired it into `.github/workflows/code-check.yml`.
- 🟢 Homework POST API no longer requires a non-staff student to be starosta; authenticated students still pass through `AcademicContextResolver::requireGroup()` so group membership remains the authorization boundary.
- 🟢 Schedule UI now exposes homework creation to signed-in users in the existing selected-subject flow; edit/delete controls were not broadened by this change.
- 🟡 Validation pending: Actions has historically failed before job steps; do not claim PHP tests passed until a runner actually executes. End-to-end homework and Telegram runtime tests remain open.
- No production deployment, database write or secret changes performed.

## Project checkpoint — 2026-10-11

Full hand-off snapshot: [docs/STATUS-2026-10-11.md](docs/STATUS-2026-10-11.md). Read this before resuming; CI is not green and the Telegram flow is not end-to-end verified.

## Контрольный снимок перед паузой — 2026-10-11
Сводка того, что реализовано в исходниках, что не проверено, что отсутствует и как продолжить без потери контекста: [docs/PROJECT-CONTROL-SNAPSHOT-2026-10-11.md](docs/PROJECT-CONTROL-SNAPSHOT-2026-10-11.md).

## Контрольный снимок перед паузой — 2026-10-11
Сводка того, что реализовано в исходниках, что не проверено, что отсутствует и как продолжить без потери контекста: [docs/PROJECT-CONTROL-SNAPSHOT-2026-10-11.md](docs/PROJECT-CONTROL-SNAPSHOT-2026-10-11.md).

### Pause checkpoint — 2026-10-11

The complete status and handoff is in [`docs/UNFINISHED-REGISTRY.md`](docs/UNFINISHED-REGISTRY.md), section “Full checkpoint — 2026-10-11”. Do not mark the Telegram flow or CI green: the relay and validation tests have not been executed successfully in CI or verified against deployed services.

### Telegram group homework relay — implementation update 2026-10-11

- 🟢 Node webhook now has an optional HTTPS relay for group/supergroup updates to the existing PHP `/api/v1/telegram/webhook` endpoint.
- 🟢 Relay reuses the secret header, does not log payloads or secrets, and preserves the one-webhook-per-bot model: Telegram points to Node; Node optionally forwards group updates to PHP.
- 🟢 Added Node regression tests for relay success and unconfigured fallback; test execution is pending because the GitHub runner is not starting.
- 🟡 Requires `TELEGRAM_HOMEWORK_WEBHOOK_URL`, matching `TELEGRAM_WEBHOOK_SECRET` in Node/PHP, valid PHP `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USER_ID`, a mapped group, and end-to-end runtime validation.

### Hosting resilience / free tiers — 2026-10-11

- 🟢 Architecture and candidate shortlist documented in `docs/HOSTING-RESILIENCE-AND-FREE-TIERS.md`.
- 🟢 Current Vercel + Supabase + SpaceWeb + B2 stack explicitly retained as primary; no hosting migration performed.
- 🟡 Measure the slow Vercel → SpaceWeb/API/media path before optimization.
- 🟡 Cloudflare Workers is the first candidate for a separate Telegram webhook PoC; Cloudflare Pages/compatible Next.js hosting is a candidate secondary foreign frontend; a Russian static/read-only emergency snapshot is the last fallback.
- 🔴 No secondary deployment, failover, cross-provider test, or current free-tier verification has been completed. These are plans, not live infrastructure.

### Telegram Web App entry — implementation update 2026-10-11

- 🟢 Added `/app` command and Web App button on `/start` in the existing Node bot; button opens the current MEDBIOHIM site using `MEDBIOHIM_APP_URL`.
- 🟢 Added command-level regression coverage for the Web App URL.
- 🟡 Still requires BotFather domain configuration, webhook registration, mobile Telegram smoke test and correct production URL configuration.
- 🔴 Telegram identity validation, account linking and registration are not implemented by this button; do not describe the account flow as complete.
- Cost target: Telegram Bot API is free; Vercel Hobby may host the small webhook and current site subject to current platform limits; existing PHP group ingestion remains on the existing backend/hosting. AI-provider usage is optional and may cost money, so baseline behavior must remain useful without a paid AI API.

### Hosting resilience and free-tier plan — 2026-10-11
- 🟢 Architecture documented in `docs/HOSTING-RESILIENCE-AND-FREE-TIERS.md`.
- 🟡 Current primary remains Vercel + SpaceWeb PHP API + Supabase + existing media storage.
- 🟡 Next: restore CI, measure network/API/media latency, test Cloudflare Worker webhook PoC, audit Next.js compatibility for a secondary foreign host.
- 🔵 Russian emergency static snapshot is lower priority and must be read-only, public-data-only, and show its last-updated timestamp.
- 🔴 No failover deployment or free-tier quota/card requirement has been verified yet.

### Full continuation checkpoint — 2026-10-11
- A detailed project handoff, known issue list, current Telegram/hosting status, next-step order and copy/paste prompt are stored in `docs/UNFINISHED-REGISTRY.md` under `SESSION HANDOFF SNAPSHOT — 2026-10-11`.
- Treat CI/runtime status as unverified until actual jobs run steps. No production migration or live Telegram setup was performed.


## Browser extension requirements agreed — 2026-10-11

- 🟢 Recorded complete functional specification: [trusted sources, answer lookup, first-test learning pipeline and admin journal](docs/BROWSER-EXTENSION-TRUSTED-SOURCES-ANSWER-LEARNING-SPEC-2026-10-11.md).
- 🟢 Product decisions: infer subject; compact side panel; lookup on supported tests; capture first-seen questions as candidates; acquire answer only from post-test/source evidence; trusted sources are automatically usable within configured capabilities; unknown sources remain in beta/review.
- 🟢 Admin requirements: approve/disable sources, sort/filter the dated journal, edit all imported fields, preserve provenance/history and review/merge duplicates.
- 🟡 Existing browser-extension MVP has not yet been modified for these requirements. No implementation, browser integration, API wiring or test pass is claimed.
- 🔴 Next: inspect current extension, existing question search/import endpoints and schema before implementation; keep writes server-authorized and do not embed privileged keys in the extension.


## Browser extension — first implementation slice (2026-10-11)

- 🟢 Added compact Manifest V3 side panel and service worker under integrations/browser-extension/.
- 🟢 User-triggered page extraction, heuristic subject inference/manual override, editable question/options, copy-to-clipboard, MEDBIOHIM search handoff and preserved quick links.
- 🟢 Permission boundary: activeTab, scripting, sidePanel; no host permissions, cookies/history permissions, or automatic page-content upload.
- 🟡 Direct authenticated question lookup, answer provenance, candidate persistence, post-test result capture, approved-source registry, beta queue and admin journal are not implemented yet.
- 🟡 CI checks are configured but not verified; the known Actions runner dispatch issue remains. No real-browser acceptance is claimed.


## Telegram account linking — 2026-10-11
- Source pass committed: private one-time link tokens (10-minute expiry, SHA-256 hash storage), authenticated Settings endpoints for start/status/unlink, transactional PHP confirmation through the existing webhook secret, Cloudflare Worker `/start link_<token>` handling, and Settings UI.
- Migration: `database/migrations/20261011120000_telegram_account_linking.sql`.
- NOT live/verified yet: migration has not been confirmed applied; real SpaceWeb API origin is not identified; Worker variable `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL` must be set; PHP/Worker deploy and E2E tests remain pending.
- Telegram-only sign-in is a separate pending phase. Do not claim full Telegram login yet: a linked Telegram ID does not itself create a valid Supabase Auth session.
- Details and setup checklist: `docs/TELEGRAM-ACCOUNT-INTEGRATION-2026-10-11.md`.


## Telegram onboarding/menu and Cloudflare GitHub CI — 2026-10-11
- Worker onboarding now directs new users to sign in/register on the site, then open Settings → Telegram; private account data is not shown before linking.
- `/start` and `/help` register the Telegram native command menu with `setMyCommands` and show inline buttons for the site, login/registration, and linking settings.
- Added `.github/workflows/telegram-worker-checks.yml` to run `npm test` under `integrations/telegram-bot-cloudflare` on relevant pushes/PRs. The run result must be inspected before claiming tests pass.
- Wrangler target aligned to existing Worker name `medbiohim-telegram` to avoid creating a second Worker when GitHub auto-deploy is enabled.
- Deployment guide: `docs/CLOUDFLARE-GITHUB-TELEGRAM-DEPLOYMENT.md`.
- The user-provided PHP health URL is HTTP. Cloudflare Worker relays require HTTPS, and the HTTPS endpoint has not yet been confirmed reachable. Do not set a plain-HTTP relay variable.
- Telegram-only website login is NOT implemented/verified yet. The former `custom:telegram` Supabase OAuth link was removed from the login page because it is not a real login flow without a configured, verified OIDC provider. Existing Google/email login remains; after signing in, Telegram linking is the supported current flow.


## Hosting / HTTPS / CI audit checkpoint (2026-10-11)

- 🟢 Confirmed SpaceWeb HTTP health endpoint returns 200 and reports PHP 8.4.21, Supabase connected, extensions present and B2 configured.
- 🔴 HTTPS not usable safely yet: Windows reports SEC_E_UNTRUSTED_ROOT; with diagnostic-only certificate bypass, HTTPS responds 302 to HTTP. No sensitive API traffic over HTTP.
- 🟡 Hosting unchanged by decision. Future preference: A) secure Cloudflare route with controlled domain and secure origin; B) free PHP host with trusted HTTPS; C) move API while keeping SpaceWeb files; D) SpaceWeb as permanent API host is the absolute last resort.
- 🟢 Cloudflare account read-only inspection: zero DNS zones; existing Workers medbiohim-telegram and medbiohim-telegram-test remain present. No DNS or production Worker configuration changed.
- 🔴 Telegram account-linking migration is not applied to live Supabase; tables absent in schema inspection; no Supabase Edge Functions deployed. Account linking is source-only/unverified.
- 🔴 Telegram Worker checks run 38143942074 failed with runner_id=0 and steps=[]; the job never reached npm test. GitHub runner allocation remains the blocker; tests are not considered executed.
- ⚠️ Supabase advisors: 1 security ERROR (trainer_feed_cards_public SECURITY DEFINER view), 2 warnings (submit_trainer_feed_answer SECURITY DEFINER callable by authenticated role; leaked-password protection disabled), 44 unindexed foreign keys, 67 unused-index notices. Security review first; no blind index drops.
- Detailed notes: docs/HOSTING-HTTPS-DECISION-2026-10-11.md.


## Cloudflare API migration — shadow scaffold (2026-10-12)

- 🟢 Decision recorded: SpaceWeb remains the active PHP API host during preparation; no production traffic or frontend API base URL changed.
- 🟢 New isolated source directory: \`integrations/cloudflare-api/\` (\`src/index.js\`, \`wrangler.toml\`, \`package.json\`, \`test/index.test.js\`, \`README.md\`).
- 🟢 Safety behavior authored: allowlisted CORS; no-store responses; public health route explicitly marks itself as a migration scaffold; unmigrated API routes return 501 rather than proxying to SpaceWeb.
- 🟡 Tests are authored but **not executed/verified** in this environment. GitHub Actions runner dispatch is still a blocker; do not treat commits as test success.
- 🟡 No Worker deployment, secrets, DNS, production route, database migration, or frontend switch was performed.
- ⬜ Next: run \`npm test\` once runner allocation works; produce a complete PHP route inventory; specify auth/JWT, role/ownership, RLS, input-validation and error contracts; migrate routes incrementally with rollback.

- 🟢 Added route-family migration inventory and per-route checklist: `docs/CLOUDFLARE-API-ROUTE-INVENTORY-2026-10-12.md`. It explicitly marks exact route contracts and runtime behavior as pending review.

- 🔴 Latest verification attempt after adding the Cloudflare API scaffold: workflow run [38146062456](https://github.com/MISTACEN/medbiohim/actions/runs/38146062456) failed before executing any step; job metadata shows `runner_id: 0`, empty `runner_name`, and `steps: []`. The new `npm test` command therefore did not run. This confirms the runner-allocation blocker persists; it does not indicate a test assertion failure.


## Cloudflare API migration — Pass 1 (2026-10-12)

- 🟢 Shadow Worker implements contract-tested **GET /api/v1** and **GET /api/v1/ping** based on backend/config/routes/health.php; neither route calls Supabase or the current SpaceWeb API.
- 🟢 Isolated Node test suite: 7/7 passing locally, including metadata response contracts, trailing slash, non-GET handling, CORS allowlist, and confirmation that unmigrated routes are not proxied.
- 🟡 GitHub Actions result is still not verified due the previously documented runner allocation failure. Wrangler/Cloudflare deployment verification remains pending.
- 🔒 No production deployment, Vercel API URL change, DNS change, database/RLS change, or Telegram webhook switch.
- ⬜ Next: confirm Cloudflare Workers Builds runs from integrations/cloudflare-api (not the Telegram folder) and validate a dry run. Keep the Worker isolated until explicitly approved for staging traffic.


## Cloudflare API authentication foundation — Pass 2 (2026-10-12)

- 🟢 Added a Supabase Auth validation utility for future Cloudflare routes. It verifies Bearer tokens through `/auth/v1/user` over HTTPS; missing config fails closed, redirects are rejected, the request is timed, and upstream errors do not leak implementation details.
- 🟢 Added seven auth regression tests. Combined isolated Worker tests passed locally **14/14** after correcting the Bearer-regex escaping and checking source syntax; repository CI has not independently confirmed the result.
- 🔒 The helper is not attached to routes yet. It does not trust client-supplied IDs or roles, and it does not use the Supabase service-role key.
- 🟡 No API Worker deployment exists yet; the current Cloudflare script list contains the Telegram production/test Workers only. No build configuration was found associated with the production Telegram script tag during this check.
- ⬜ Next: review route-by-route auth/SQL/RLS contracts, then add a protected read only after negative-authorization tests and staged Wrangler validation are available.


## Branching policy — SpaceWeb maintenance vs Cloudflare migration (2026-10-12)

- 🟢 Created branch `spaceweb-backend` from the current `main` head to preserve a maintenance line for the existing SpaceWeb PHP backend.
- 🔵 `main` is the forward migration line for the Cloudflare API implementation in `integrations/cloudflare-api/`; the Telegram Worker remains a separate project in `integrations/telegram-bot-cloudflare/`.
- 🔒 SpaceWeb remains the live backend until a route-by-route verification and an explicitly approved cutover. No production DNS, Vercel API URL, Supabase policy, or Telegram webhook changes are allowed as part of ordinary code migration.
- ⚠️ The maintenance branch is a source snapshot, not yet a verified rollback/release branch. Keep fixes there when needed for the live PHP backend and port shared critical fixes intentionally.



## Cloudflare API migration — Pass 4 (2026-10-12)

- 🟢 Added `POST /api/v1/auth/refresh` in `integrations/cloudflare-api/src/index.js`, using the new Supabase Auth refresh helper.
- 🟢 Session normalization mirrors the PHP service's key fields; role is derived only from server-controlled `app_metadata`, not editable `user_metadata`.
- 🟢 Added tests for missing token, HTTPS/config requirements, token exchange, normalized response, invalid refresh token, wrong method and unconfigured Worker.
- 🟡 New tests are written but not yet confirmed by a successful GitHub Actions run. Cloudflare Worker is not deployed.
- 🔒 No live settings, production API URL, DNS, database policy, or Telegram webhook changed.
- ⬜ Next: confirm CI execution and continue with the next auth route only after reviewing rate limiting and profile-side effects in the PHP login/register handlers.



## Cloudflare API migration — Pass 5 (2026-10-12)

- 🟢 Added `POST /api/v1/auth/recover` backed by Supabase Auth over HTTPS, with a fixed callback path on the configured HTTPS app origin.
- 🟢 Normalizes Supabase 4xx responses to avoid revealing whether an email exists; handles throttling and upstream errors separately. Request body is limited to 16 KiB.
- 🟢 Added helper tests for callback safety, anti-enumeration behavior, throttling and upstream failure; route tests cover input validation, method and fail-closed configuration.
- 🟡 Tests are written but have not been confirmed by a successful Node/GitHub Actions run. No Worker deployment has occurred.
- ⚠️ Before production, add Cloudflare edge rate limiting for recovery; current code relies on Supabase's built-in limits, matching the absence of an app-level limiter in the PHP handler.
- 🔒 SpaceWeb remains production. No frontend API URL, DNS, Supabase policy or Telegram webhook changed.



## Cloudflare API migration — Pass 6 (partial login)

- 🟢 Added `loginSupabaseUser()` and `POST /api/v1/auth/login` with HTTPS-only Supabase password exchange, bounded input, generic invalid-credential responses and upstream error handling.
- 🟢 Login tests cover input/configuration, session normalization, invalid credentials, throttling and upstream failures; route tests cover missing/denied rate limiter.
- 🟡 Login route intentionally returns 503 until Cloudflare binding `AUTH_LOGIN_LIMITER` is configured. Do not expose it before then.
- 🟡 Not contract-complete: PHP login may return DB-backed `profile` and `roles`; Worker has not yet migrated this profile synchronization because RLS/DB credential safety must be confirmed first.
- 🟡 Tests remain authored but not verified by a successful full Node/GitHub Actions run.
- 🔒 Production stays on SpaceWeb; no frontend API URL, DNS, database policies, or Telegram webhook changed.



## Cloudflare API migration — Pass 7 (partial registration)

- 🟢 Added `registerSupabaseUser()` and `POST /api/v1/auth/register` with HTTPS-only signup, bounded input, name/email/password validation, generic signup errors and email-confirmation handling.
- 🟢 Added helper tests and route tests for required rate limiting.
- 🟡 Route deliberately returns 503 until Cloudflare binding `AUTH_REGISTER_LIMITER` is configured.
- 🟡 Not contract-complete: PHP also creates a DB profile and assigns the default student role. This remains blocked on RLS/database write strategy review.
- 🟡 Test cases are authored but not verified by a successful full Node/GitHub Actions run.
- 🔒 Production stays on SpaceWeb; no frontend URL, DNS, database policy or Telegram webhook changed.


## Histology archive integration — 2026-10-12

- 🟢 Audited the user-provided `content.zip`: 444 entries (~202.46 MiB), 178 preparation-photo paths, 33 canonical electronogram paths, 33 legacy `em/` paths, 28 caption-map topics and 52 DOCX source documents.
- 🟢 Updated `tools/import_histology_media.py` to accept both legacy `features.zip` and the uploaded `content.zip` layout, decode legacy `#UXXXX` filenames, preserve canonical and compatibility paths, emit a SHA-256 manifest, and reject conflicting normalized paths.
- 🟢 Added `tools/test_import_histology_media.py` with path normalization, traversal rejection, duplicate, alias and conflict cases; connected these tests to the optional-integrations GitHub Actions workflow.
- 🟢 Generated a separate SpaceWeb media deployment archive with 178 photos, 33 canonical electronogram paths, 33 `em/` aliases and the 28-topic caption maps. Binary assets are intentionally not committed to Git.
- 🟡 The new importer tests still need a confirmed CI or local run; GitHub runner allocation has previously failed before any step.
- 🔒 No Supabase data, trainer-card records, DNS, frontend API base URL or live SpaceWeb files were changed by this archive preparation.
- 📄 Details: `docs/HISTOLOGY-CONTENT-ARCHIVE-2026-10-12.md`.



## Cloudflare API migration — Pass 8 (profile bundle)

- 🟢 Added `GET /api/v1/auth/me` to the Worker with Supabase Auth token verification and caller-JWT PostgREST reads for the profile, role assignments and active group memberships.
- 🟢 Response shape includes PHP-compatible `user`, `roles`, `groups`, `current_group`, `course` and `semester` fields; no service-role key is used.
- 🟢 Added helper and route tests for user-scoped filters, response normalization, missing token and method handling. Cloudflare API suite now contains 50 authored Node test cases; importer suite contains 6 Python test cases.
- 🟡 Tests are authored but not yet verified by a successful full run.
- 🟡 Before cutover, validate live RLS permissions and PostgREST relationship names. Login/register DB profile writes and default student-role assignment remain unported.
- 🔒 Production remains on SpaceWeb; no DNS, frontend API base URL, Supabase policies or Telegram webhook changed.



## Cloudflare API migration — Pass 9 and content archive (2026-10-12)

- 🟢 Confirmed the Worker source includes `GET /api/v1/auth/me` and a Supabase REST profile-bundle helper. It validates the caller's Supabase token, uses the caller JWT plus anon key (no service-role key), filters data by the authenticated user, and returns user/roles/groups/course/semester fields.
- 🟡 Live RLS behavior and PostgREST embedded relationship names still need staging verification; tests are authored but the full suite has not been confirmed by a successful CI run.
- 🟢 Inspected the uploaded `content.zip` and produced a normalized asset package with Unicode filenames, duplicate-entry removal, a SHA-256 manifest, and repaired document-to-image map paths.
- 🟢 Added `docs/HISTOLOGY-CONTENT-ARCHIVE-2026-10-12.md` with safe SpaceWeb extraction instructions and validation limits.
- 🟡 The cleaned media archive is prepared for download but has not been uploaded to SpaceWeb or switched into production.
- 🔒 SpaceWeb remains active. No production API URL, DNS, Supabase policy, Cloudflare deployment, or Telegram webhook was changed.



## Cloudflare API migration — Pass 10 (authenticated search)

- 🟢 Added `GET /api/v1/search` to Worker source, supporting `q/query`, limit, subject and type filters, ranked results and facets.
- 🟢 Uses the authenticated caller JWT plus Supabase anon key for REST queries; no service-role key and no proxy to SpaceWeb.
- 🟢 Added helper tests for blank queries, caller-scoped published question search, facets, invalid type and generic RLS failure; route tests cover auth/method guards.
- 🟡 Tests are authored but the full suite has not been confirmed by successful CI. Live RLS and table/column compatibility must be verified before cutover.
- 🔒 Production remains on SpaceWeb; no API URL, DNS, Supabase policy, Worker deployment or Telegram webhook changed.



## Cloudflare API migration — Pass 11

- 🟢 Added PHP-compatible `GET /api/v1/me` alias for the authenticated profile bundle.
- 🟢 Added a regression test confirming the alias requires authentication.
- 🟡 Live RLS/table relationship compatibility remains unverified; the Worker is not deployed and SpaceWeb remains production.



## Cloudflare API migration — Pass 12

- 🟢 Added authenticated `GET /api/v1/subjects/{id}` with caller-JWT/anon-key Supabase REST reads for subject details and modules.
- 🟢 Added helper tests for authentication, subject ID validation, response shape, missing subjects and RLS-denied reads; route tests cover auth and method handling.
- 🟡 Full test run and live Supabase RLS/schema behavior are not yet verified. No deployment or production cutover occurred.


## Cloudflare backend migration — full product scope (2026-10-12)

- 🟡 Cloudflare shadow Worker `medbiohim-api-shadow` is deployed and connected to the existing Supabase project using only `SUPABASE_URL` + `SUPABASE_ANON_KEY`; the service-role key is not used. SpaceWeb PHP remains the active backend.
- 🟡 Added read routes for dashboard aggregation, schedule ranges, group homework, and published test catalog; added route guards/tests. Source uploaded to the shadow Worker, but external HTTP smoke tests and GitHub Actions execution are still unverified.
- 🟡 Dashboard now reads site settings and announcements through RLS-protected `site_content`; full response parity and live role-specific behavior remain to verify.
- 🟡 Schedule read range + calendar metadata are implemented; ⬜ mutations: create/update/cancel lessons, attendance states, and full calendar/week/month/semester parity.
- ⬜ Homework mutations and submissions, completion tracking, photo/file attachments, private media permissions and storage integration.
- 🟡 Published exam-question bank GET + subject summary, published lecture list/detail, subject catalog and subject-plan reads are implemented; ⬜ remaining routes: modules/materials, mini-quiz and test attempts, trainer feed/media, progress/SRS, academic plan, calculators, community, settings, presence, AI, Telegram admin, imports and admin panels.
- 🔒 Preserve the existing UI and its translucent Atlas viewer; this is a backend migration, not a redesign. No production frontend switch until tests, RLS, PHP contract parity, and file/media authorization are verified.
- Next pass: resolve GitHub Actions execution, run Node tests, validate schedule PostgREST filters against real authenticated users, and then implement schedule/homework writes only after confirming safe RLS policies.


## Dashboard + schedule migration pass — 2026-10-12

| Work item | Status | Evidence / gate |
|---|---|---|
| Dashboard nearest-lesson selection | 🟢 source fixed | Keeps ongoing/upcoming classes today; falls forward to the next day after today's classes end |
| Dashboard pending homework count | 🟢 source fixed | `returned` and `completed` are not treated as pending |
| Dashboard API data count | 🟢 source fixed | Published-test list raised from 20 to 200; explicit dashboard summary counts added |
| Schedule weekday labels | 🟢 source fixed | Double-escaped date regex corrected |
| Cloudflare versioned admin schedule read/save | 🟡 source + tests authored | `GET/PUT /api/v1/admin/schedule`; caller JWT and RLS; version staged inactive and activated after entries insert |
| Cloudflare individual schedule entry mutations | 🟡 source + tests authored | Create/PATCH/soft-cancel endpoints; not deployed |
| Node tests | 🟡 authored, not run | GitHub Actions explicitly left untouched; local execution unavailable in current tool runtime |
| Live API/Cloudflare smoke test | ⬜ pending | No deployment or production frontend cutover in this pass |
| Real authenticated editor test | ⬜ pending | Must verify a manager-role account can save and a student is denied |


## Progress + test/question catalog migration pass — 2026-10-12

| Work item | Status | Evidence / gate |
|---|---|---|
| Cloudflare `GET /api/v1/progress` | 🟡 source + tests authored | Caller JWT; group/subject scope; homework + attempt aggregation; not runtime-tested |
| Progress failure behavior | 🟢 source | Upstream/RLS failure is an error, not a fabricated `0%` success |
| Test catalog `questions_count` | 🟢 source | Joins `test_questions`; response field matches current UI |
| Test catalog subject name | 🟢 source | Returns `subject_name` via subject relation |
| Question bank read routes | 🟢 existing source reviewed | Published `exam_questions`, pagination/filtering, answer inclusion explicit |
| Live test/question counts | 🟢 read-only audit | tests 33/32 published; questions 855/660 published-active; test_questions 854; exam_questions 876/776 published |
| Broken links to unpublished/archived questions | 🟢 read-only audit | 0 found among `test_questions` links |
| Published unlinked `questions` | 🟢 read-only audit | 0 found in current query |
| Interactive test attempts / grading | ⬜ pending | Detail/start/save/finish/history/retry routes not migrated |
| Test execution and Worker deployment | ⬜ pending | No tests run; no deploy; Actions untouched |


## Progress + tests/question bank — 2026-10-12

| Work item | Status | Notes |
|---|---|---|
| `GET /api/v1/progress` | 🟡 Source + tests authored | Homework and test attempt totals; active-group scoping; no live HTTP verification |
| Progress metric UI | 🟢 Source updated | No fabricated 0% for missing test averages/no activity; degraded data is not rendered as real metrics |
| Published test catalog | 🟢 Source + regression tests | Subject visibility filter, question counts, module/topic and optional source metadata |
| `GET /api/v1/tests/{uuid}` | 🟡 Source + tests authored | Published questions/options only; answer keys stripped from the Worker response |
| `GET /api/v1/my/attempts` | 🟡 Source + tests authored | Authenticated user's selected-group history; excludes snapshot projection |
| Test attempt start/save/finish | 🔒 Intentionally blocked | Live grants permit authenticated selection of `test_attempts.question_snapshot` and `questions.answer/options`; caller-JWT writes must not be exposed until private snapshot storage/guarded RPCs are in place |
| AI semantic grading/regrade | ⬜ Not migrated | Keep distinct from deterministic MCQ/exact-match fallback |
| Runtime tests | 🟡 Authored, not executed | Clone blocked by unavailable network; GitHub Actions intentionally untouched |
| Shadow deployment / frontend cutover | ⬜ Not performed | Current PHP/SpaceWeb backend remains active |


## Progress + tests/question bank — update 2026-10-12

| Work item | Status | Notes |
|---|---|---|
| Dashboard next lesson + homework counts | 🟢 Source fixed | Skips already-ended lessons; returned homework remains requiring student follow-up |
| Progress aggregates and UI | 🟡 Source + tests authored | Caller/group-scoped homeworks and attempts; no fake zero metric when average/activity is absent |
| Published test catalog | 🟢 Source updated | Filters subject-bound tests by caller-visible subjects; adds subject/module/topic/source metadata and linked-question counts |
| Test detail `GET /tests/{uuid}` | 🟡 Source + tests authored | Removes correct-choice flags and answer text from its response |
| Curriculum map `GET /tests/curriculum-map` | 🟡 Source + tests authored | Group, course/specialty, modules/topics, published question/test counts, planned dates |
| Chemistry bank `GET /tests/chemistry-master` | 🟡 Source + tests authored | Live document read, kind/formula/search filters and pagination; live document contains 436 entries |
| Full-bank progress `GET /tests/{id}/bank-progress` | 🟡 Source + tests authored | Published-question total and own sequential session/result summary |
| Attempt history `GET /my/attempts` | 🟡 Source + tests authored | Own-user and active-group scope; safe projection excludes question snapshot |
| Test attempt start/save/finish | 🔒 Not enabled on Worker | Needs narrow RPCs / grants to prevent clients changing score/status and to keep snapshots out of the exposed REST projection |
| Node tests and end-to-end runtime | 🟡 Not run | 12 JS modules/tests passed static syntax parsing only; no npm test / live HTTP confirmation |
| Worker deployment and frontend cutover | ⬜ Not performed | Existing PHP/SpaceWeb backend remains production |


| Test bank response contract | 🟡 Source updated | Bank screen uses `getTestBank` with `view=bank`; ordinary test detail remains sanitized. Production PHP path is preserved; Cloudflare query dispatch is source-only |
| Test catalog group/course scope | 🟡 Source + test authored | Selected group is validated as an active membership; group specialty and course filter subject-bound tests |
| Static JS syntax check | 🟢 | 12 Worker/test JS files parsed; Node tests and HTTP smoke are still not executed |

## Cloudflare candidate archive — review pass (2026-10-13)

- [x] Corrected candidate role queries to use `roles(code)` for homework grading, presence, group/domain authorization and file role checks.
- [x] Candidate archive tests: **59/59 passed locally** on Node 22 after the correction.
- [x] Static syntax parse for candidate `src/*.js` and `test/*.js`: passed.
- [ ] Candidate source modules merged into `main`: not yet done.
- [ ] GitHub Actions runner execution restored: blocked; workflows fail before any steps/runner name are recorded and logs are unavailable.
- [ ] Live Supabase RLS/PostgREST checks: not performed.
- [ ] R2 binding and upload/download: blocked because R2 is not enabled in the connected account.
- [ ] Academic-state SQL migration: not applied; security and remote migration history review required.
- [ ] Cloudflare deployment / runtime smoke test / Vercel cutover: not performed. SpaceWeb remains production; `MEDBIOHIM_CF_FIRST` remains off.

The downloadable review ZIP contains the role fixes plus a corrected status/cutover note. The local unit tests use mocked responses and do not substitute for live integration testing.

## Cloudflare deployment request — preflight (2026-10-13)

- [x] Inspected Cloudflare account and Worker list; `medbiohim-api-shadow` is deployed but bundle contains only `src/index.js` and `src/supabase-auth.js`.
- [x] Inspected Vercel environment-variable names/targets without exposing secret values.
- [ ] Full candidate Worker deployment: blocked; candidate modules are only in the reviewed ZIP, not tracked under `integrations/cloudflare-api/src/` in GitHub `main`.
- [ ] Cloudflare-first + SpaceWeb fallback: blocked; `CLOUDFLARE_API_ORIGIN` and `MEDBIOHIM_CF_FIRST` are absent, and `SPACEWEB_API_ORIGIN` is configured as an empty value in all targets.
- [ ] Verified HTTPS SpaceWeb origin: blocked; only known host is `ryazansev3.temp.swtest.ru` via historical HTTP URL. Current proxy correctly refuses insecure HTTP upstreams.
- [ ] R2 bucket/binding: blocked because R2 is not enabled in the Cloudflare account. Auth rate-limit bindings are also absent from the shadow Worker.
- [x] No deployment/cutover/env changes made; current production routing was left untouched.

Production remains on the existing configuration until the HTTPS fallback origin and complete Worker bundle are available and tested.

## Cloudflare Workers Builds: fix missing build script — 2026-10-13

- 🔴 Observed actual Cloudflare build log from 2026-10-12: dependency install completed with “No packages!”, then configured Build command `npm run build` failed with `Missing script: "build"`. This is a package-script mismatch, not a GitHub connection failure.
- 🟢 Updated `integrations/cloudflare-api/package.json` on `main` (commit `5f23331d35ee7b7038862a6c90148987f7d9c844`) to add a deterministic `build` script using `npx --yes wrangler@4.149.0 deploy --dry-run`, plus a pinned Wrangler `deploy` script. This makes the configured Build command perform an actual bundle/config validation before deployment.
- 🟡 The uploaded Cloudflare dashboard screenshot confirms the GitHub repo `MISTACEN/medbiohim`, production branch `main`, root `integrations/cloudflare-api`, Build command `npm run build`, and Deploy command `npx wrangler deploy`. Thus GitHub is connected and Workers Builds is configured; earlier API lookup error 12040 was not sufficient to conclude the dashboard configuration was absent.
- 🔴 A new build/deploy run after commit is still required. Do not treat the code change as a successful build or deployment until Cloudflare logs show dry-run success and deploy success. Then verify live Worker modules and smoke tests. Production Vercel routing remains unchanged.

## Post-fix runtime smoke check — 2026-10-13

- 🟢 Live Worker `/health` and `/api/v1/health`: HTTP 200; response remains `mode=shadow`, `role=migration-scaffold`, `productionTrafficEnabled=false`.
- 🟢 Disallowed CORS preflight from `https://evil.example`: HTTP 403 `ORIGIN_NOT_ALLOWED`.
- 🟢 Unknown route: HTTP 501 `ROUTE_NOT_MIGRATED`, fails closed.
- 🟢 Empty login and registration requests: HTTP 422 validation errors.
- 🔴 Protected `GET /api/v1/subjects` with a deliberately invalid bearer token: HTTP 502 `AUTH_UPSTREAM_ERROR` (“Could not reach Supabase Auth”), still not the expected 401. Investigate Supabase Auth reachability/configuration without exposing secret values.
- 🟡 GitHub commit status for build-script commit `5f23331d35ee7b7038862a6c90148987f7d9c844` reports Vercel success only; it does not confirm Cloudflare Workers Builds. Live health responses also cannot prove the latest source bundle was deployed.
- 🔴 Need Cloudflare Builds log for a run after `5f23331d` showing successful `npm run build` and `npx wrangler deploy`; then inspect deployed module list and re-run auth/rate-limit tests.
- 🔒 No production route, Vercel environment, Supabase schema/RLS, or secret was changed. Production cutover remains blocked.

## Cloudflare runtime follow-up — 2026-10-13

- Confirmed active Worker has both native rate-limit bindings and all six expected source modules; previous two-module deployment drift is resolved for the currently deployed bundle.
- Smoke tests: health 200, blocked CORS 403, unmigrated route 501, empty login/register 422.
- Invalid bearer still returns 502 from Supabase Auth instead of expected 401. Added safe internal error-name/network-cause logging in commit `4074659aa0e0a5261175358e63d22c7c8b6c801a`; deployment of this diagnostic change is not yet confirmed.
- Rate limiting is provisioned, but the quick test did not demonstrate 429; perform a controlled test after deployment and inspect runtime logs. Do not switch production until authentication and limits are verified.


## Runtime diagnosis continuation — 2026-10-13

- 🟢 Re-checked the live Worker bundle after commit `4074659a`: the safe auth-fetch diagnostic marker is now present, along with all six expected modules. This supersedes the earlier note that deployment was unconfirmed.
- 🔴 Live HTTPS smoke tests still return HTTP 502 `AUTH_UPSTREAM_ERROR` for both an invalid bearer on a protected read and a login attempt with deliberately fake credentials. The login test does not create an account. Root cause is not yet established; do not assume the Supabase URL or key is wrong without diagnostic evidence.
- 🟡 Cloudflare Observability telemetry query returned zero events, and Worker settings reported `logpush=false` with no tail consumers. Therefore the diagnostic log was not yet available through the queried telemetry path.
- 🟡 Added `[observability]` with `enabled = true` and full head sampling to `integrations/cloudflare-api/wrangler.toml` in commit `961e2b8ee3b08e1b992982b0d83847a7b7497c49`. This is a config change intended to make safe runtime logs queryable; deployment and actual log visibility still need confirmation.
- 🔴 Next: confirm Cloudflare Workers Build and deployment after `961e2b8`; re-check settings and query logs for `supabase_auth_upstream_fetch_failed`; identify the network cause without reading or logging secret values. Then re-run auth and rate-limit checks.
- 🔒 Production routing and Vercel environment remain unchanged. Do not enable Cloudflare-first production traffic until auth, required read/write paths, and rate limits pass.


## Latest verification after observability config commit — 2026-10-13

- 🔴 Repeated seven login requests using deliberately fake `.invalid` email addresses; all seven still returned HTTP 502 `AUTH_UPSTREAM_ERROR`, and none returned 429. No account was created. Rate limiting remains unverified and may not be enforcing the configured threshold.
- 🟡 The live Worker settings still show `logpush=false` and no tail consumers after commit `961e2b8`; therefore the new `[observability]` config has not been confirmed active. The temporary tail session could not establish a WebSocket connection and was deleted afterward.
- 🟡 GitHub combined status currently reports Vercel `failure` with a build-rate-limit/upgrade link for the config and docs commits. This is not evidence of a Cloudflare build result. Cloudflare's build-trigger API lookup returns no triggers for the script, despite the previously supplied dashboard screenshot showing a configured build UI; reconcile this mismatch before relying on auto-deploy.
- 🔴 Remaining blockers are still auth upstream reachability, a proven 429 rate-limit test, and verified Cloudflare build/deploy. Production remains on its existing routing; no cutover was performed.


## Cloudflare auth fix and post-deploy verification — 2026-10-13

- 🟢 Root symptom isolated: with `redirect: "error"`, the Worker raised a `TypeError` classified as a redirect failure while calling Supabase Auth. With redirect following still blocked but response inspection enabled (`redirect: "manual"`), the same HTTPS origin returned normal Supabase HTTP responses.
- 🟢 Updated only the six Supabase Auth operations to use manual redirect handling. Any unexpected 3xx response is rejected with generic HTTP 502; telemetry logs only status and safe booleans/categories (same origin, HTTPS, Supabase domain, expected project, and path category), never the Location URL. Other Supabase REST calls retain `redirect: "error"`.
- 🟢 Uploaded and deployed the source from GitHub main to the isolated shadow Worker as version 26: version ID `09e2db48-2621-4085-a54e-7df798da415b`, deployment ID `8f2a3bb7-bda7-4042-aca6-94e2a9f876fa`, source annotation commit `dd8833c5561abde7d14e98cd6bdbad3e051ec8bb`. Cloudflare accepted all six ES-module source files; all existing bindings were preserved, and no secret values were read.
- 🟢 Post-deploy smoke checks: `/api/v1/health` HTTP 200; missing bearer HTTP 401; deliberately invalid bearer HTTP 401 `UNAUTHORIZED`; fake/nonexistent login HTTP 401 `AUTH_INVALID_CREDENTIALS`; disallowed CORS HTTP 403; wrong-method schedule request HTTP 405; unmigrated route HTTP 501. These tests do not create a user or rely on a real user's token.
- 🟢 Targeted test suite `node --test test/supabase-auth.test.js`: 53/53 passing after fixing two test-suite defects (missing `getSupabaseSubjectDetail` import and an overly broad `attempt` substring assertion that incorrectly matched the allowed `max_attempts` field).
- 🟢 Worker rate-limit bindings exist and have the expected configured thresholds: login 5 attempts/60 seconds; registration 3 attempts/60 seconds. 🟡 A post-fix live HTTP 429 check has not been confirmed; do not claim enforcement solely from bindings.
- 🟢 Enabled Cloudflare Observability for diagnosing the shadow Worker, then disabled invocation logs to avoid collecting full request-header records. Persisted custom diagnostic logs remain enabled with safe fields only.
- 🔴 The Vercel homepage still returns HTTP 200, but `/api/v1/health` still returns HTTP 503 `INSECURE_BACKEND_ORIGIN` because production routing remains configured to reject the legacy HTTP SpaceWeb origin. This remains an unresolved site/API integration blocker.
- 🟡 Cloudflare Worker Build automation is not yet proven to track the latest commits reliably; the verified source was deployed directly to the shadow Worker. Continue fixing/confirming the GitHub-to-Cloudflare build flow.
- 🔒 Production Vercel routing remains unchanged; `MEDBIOHIM_API_MODE=cloudflare` was not enabled. Auth is repaired in the shadow Worker, but production cutover is still blocked on verified API reads/writes, rate-limit enforcement, and build/deploy automation.


## Full Worker regression pass and test-write safety gate — 2026-10-13

- 🟢 Ran the complete Cloudflare Worker unit test set from the current `main` source in a Node 25.9 environment: **124 tests passed, 0 failed** across auth, routes, schedule/admin schedule mutations, test catalog, attempts/progress, and curriculum/chemistry handlers.
- 🟢 Fixed a real oversized-body reader stall in `src/index.js`: `readJsonLimited` previously read a clone branch and awaited its cancellation, which could hang for oversized JSON. It now reads the one-shot request body directly; the existing oversized-refresh test completes and the full suite exits normally.
- 🟢 Restored the intended fail-closed test-attempt write gate in `src/test-attempts.js`. Start, save-answer, and finish immediately return HTTP 503 `TEST_ATTEMPT_SECURITY_NOT_READY` until private answer-snapshot storage and guarded scoring are ready. Added regression coverage that verifies no upstream request is made by those disabled write operations.
- 🟢 Added `[observability.logs]` configuration with invocation logs disabled, while keeping persisted custom diagnostics enabled. The goal is to avoid retaining full request/header records while preserving the safe auth error classification.
- 🟢 `npm run build` / `npx wrangler@4.149.0 deploy --dry-run` passed against a fresh local materialization of current source/config. Wrangler reports the two intended rate-limit bindings (login 5/60s, registration 3/60s) and no configuration/module build error. This is a local dry-run, not evidence that Cloudflare's GitHub-linked Build pipeline executed.
- 🟢 Uploaded the current source modules from GitHub `main` and deployed the isolated shadow Worker as version **37**, version ID `2fe3e2af-2929-44ab-9d0e-296435dcaeeb`, deployment ID `9f380d36-5250-4303-a8ef-0ea7e61832b5`, annotation commit `1facb9b0355dc7cba076d109f3868d6f9d5ce8a1`. Existing plain-text, rate-limit, and secret bindings were preserved without reading any secret values.
- 🟢 Post-deploy live smoke checks: health 200; missing bearer 401; invalid bearer 401; test-attempt start/save/finish each 503 `TEST_ATTEMPT_SECURITY_NOT_READY`; disallowed CORS 403; unmigrated route 501. This confirms unsafe answer writes remain blocked rather than accidentally opening the feature.
- 🟡 Runtime enforcement of rate limits is still not demonstrated by a controlled HTTP 429 test; the correct native bindings and thresholds exist, but do not mark the limiter phase fully verified.
- 🔴 Production integration is still blocked: Vercel homepage returns 200, while `/api/v1/health` returns 503 `INSECURE_BACKEND_ORIGIN` because the production API route still rejects the legacy HTTP SpaceWeb origin. The GitHub-to-Cloudflare automatic build configuration remains unconfirmed; current shadow deployment was performed directly after local source and tests were checked.
- 🔒 No production Vercel routing/environment, Supabase schema/grants, or Telegram webhook was changed. Do not enable `MEDBIOHIM_API_MODE=cloudflare` until live read paths, approved write paths, rate-limit enforcement, and the automated release process are verified.


## Correction: Cloudflare Workers Builds automation verified — 2026-10-13

- 🟢 Resolved the earlier API lookup ambiguity: Cloudflare's Builds API expects the Worker's system tag `3f7f446562fe43bdb19164b283d5a924`, not the script name `medbiohim-api-shadow`. The prior HTTP 12040 / empty-trigger result came from querying with the wrong identifier; it did not mean the dashboard build setup was absent.
- 🟢 Read the existing build configuration by the correct tag. It points to GitHub `MISTACEN/medbiohim`, branch `main`, root directory `integrations/cloudflare-api`, build command `npm run build`, deploy command `npx wrangler deploy`, with automatic builds enabled.
- 🟢 Confirmed Cloudflare Build runs reporting outcome `success` for commits `cf1ca28`, `d16e1c5`, `3ccd640`, `1facb9b`, `71c97af`, and `63525d6`. The latest checked build (`74ff2673-95bf-4384-8bf3-4fb1e75341b0`, commit `63525d6`) completed with outcome success; its logs did not contain the earlier `Missing script: "build"` error or failure markers.
- 🟢 After that automatic build, the active Worker bundle was confirmed to contain the fail-closed attempt-write gate, direct one-shot request-body reader (no cloned-stream cancel stall), and safe Auth redirect diagnostics. Runtime settings retained both native rate-limit bindings and `observability.logs.invocation_logs=false`.
- 🟡 Automatic build/deploy is now verified at least through the latest observed commit. Continue checking new source commits on `main`; do not use the earlier incorrect API lookup as evidence that automation is absent.
- 🔒 Production Vercel routing remains unchanged. This resolves the Cloudflare build-pipeline verification item only; it does not clear the separate production API 503, live read/write validation, or rate-limit 429 verification blockers.


## Rate-limit enforcement probe and auth fail-closed guard — 2026-10-13

- 🔴 Controlled live probe: 18 sequential POSTs to the shadow Worker's login endpoint using a made-up `.invalid` email and non-real password all reached Supabase Auth and returned `401 AUTH_INVALID_CREDENTIALS`; none returned HTTP 429. This does not prove the Cloudflare native rate-limit binding is broken in every colo, but it proves enforcement has **not** been demonstrated and the current login path must not be treated as protected.
- 🟢 Added an explicit `AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED` gate before both login and registration rate-limit checks. Unless the environment value is exactly `"true"`, both endpoints return HTTP 503 `RATE_LIMIT_ENFORCEMENT_UNVERIFIED` before reading credentials or calling Supabase. Wrangler config defaults this flag to `"false"`; do not flip it until a reproducible HTTP 429 test and binding behavior are understood.
- 🟢 Updated route tests to require the explicit flag for limiter behavior. Full Worker suite after this change: **124/124 passed, 0 failed**.
- 🟢 Live shadow smoke after the automatic build picked up the new commit: health HTTP 200; login HTTP 503 with `RATE_LIMIT_ENFORCEMENT_UNVERIFIED`; registration HTTP 503 with the same code. The registration probe used a synthetic `.invalid` email and was rejected before account creation.
- 🟢 Confirmed the active Worker bundle includes the new auth gate, the fail-closed test-attempt write gate, the direct request-body reader, and safe auth diagnostics.
- 🔴 Production still has a separate API outage: `https://medbiohim.vercel.app/` returns HTTP 200, but `/api/v1/health` returns HTTP 503 `INSECURE_BACKEND_ORIGIN`. Production was deliberately not switched to the incomplete shadow API.
- 🟡 Vercel management connector currently denies access to environment/deployment listing for the known project scope (404/403). No production environment variables were changed; proceed with the available GitHub/Cloudflare checks and resolve Vercel scope/permissions before a safe cutover.


## Current live progress — RPC-backed attempts enabled, 2026-10-13



- 🟢 Cloudflare Workers Builds auto-deployed current `main` commit `1aa040eab6af990e63aa81365606a0def4480cd8`. Build `c9b324ff-c6f5-4cfc-a61b-5fae2febc3c6` outcome `success`; deployment `481e1a26-3121-4723-8e30-5a84623c7571` serves version `7da54e49-70cf-4f50-89f7-6c50c5c005b3` at 100%.
- 🟢 Auth rate limit enforcement flag is active `true`; live shadow route probes confirmed login throttling (six malformed body probes → 422, then 429) and registration throttling (four malformed body probes → 422, then 429). The probes carried no passwords, created no accounts, and were checked against the exact configured namespaces (login 1001, 5/60s; registration 1002, 3/60s). Cloudflare’s distributed limiter can permit small overshoot between locations; this is not a strict global counter.
- 🟢 Verified the live Supabase migration `secure_test_attempt_rpc_20261012` exists (version `20261012062330`). Its three `SECURITY DEFINER` RPCs exist with fixed `search_path=pg_catalog, public, pg_temp`. SQL privilege checks confirmed `authenticated` can execute start/save/finish, `anon` cannot; authenticated users cannot read `test_attempts.question_snapshot`; anon cannot select attempts or answers; RLS has owner-only policies.
- 🟢 Enabled test attempt start/save/finish in `src/test-attempts.js` only after the live migration, grants and RLS had been checked. These operations call `medbiohim_start_test_attempt`, `medbiohim_save_test_answer` and `medbiohim_finish_test_attempt` RPCs; the Worker does not accept client-supplied score/status or directly write private snapshots.
- 🟢 Targeted unit tests for test-bank and attempt routes: **5/5 passed**, including an RPC contract test verifying exact function names, arguments and that returned public objects do not contain `question_snapshot` or answer keys.
- 🟢 Live unauthenticated probes for test-attempt start, answer save and finish all return HTTP 401, so removal of the maintenance gate did not permit anonymous writes. A full end-to-end start/answer/finish with a real student JWT has not yet been executed.
- 🟡 Score logic is now handled by the database RPC. AI semantic grading/regrade and PHP-compatible profile/default-student-role creation at registration remain separate integration tasks.
- 🔴 Vercel homepage still responds HTTP 200, but production `/api/v1/health` returns HTTP 503 `INSECURE_BACKEND_ORIGIN` because production remains in legacy mode against the old HTTP SpaceWeb origin. SpaceWeb HTTPS is unavailable; the target is Cloudflare-only.
- 🟡 Preview env variables `MEDBIOHIM_API_MODE=cloudflare` and `CLOUDFLARE_API_ORIGIN` are configured only for Preview. A new Vercel deployment was rejected by the API’s daily deployment quota (`api-deployments-free-per-day`; retry after 24 hours), so those env settings have not yet been exercised by a newly built Preview. Production env and routing are unchanged.
- 🔒 No authenticated student test was created; no real credentials, Supabase schema changes, production routing changes or HTTP fallback bypass were used in these probes.



## 2026-10-13 — Cloudflare Shadow migration checkpoint

**Verified source/build:** \`236b12f4261e4aa523c894a1d3f131c123bc1d35\` / Build \`5c5c4227-9002-4116-8c7c-912f9f5a3bd0\` / Worker version \`d77cb3da-9ff3-46cf-8f3f-b991f9ad7709\`. The build completed successfully with **176 tests passed, 0 failed**; Wrangler dry-run and the gated Shadow deployment passed.

- 🟢 **Materials reads:** \`GET /api/v1/subject-materials\`, \`GET /api/v1/materials\`, \`GET /api/v1/materials/{id}\`.
- 🟢 **Source metadata:** \`GET /api/v1/content-sources/{id}\`; source metadata only, with specialty/group access checks. Text-keyed source IDs are supported.
- 🟢 **Trainer reads:** \`GET /api/v1/trainers/feed\` and \`GET /api/v1/trainers/feed/{id}\` use the sanitized \`trainer_feed_cards_public\` view; answer/correctness fields are removed defensively.
- 🟢 **Trainer answer submission:** \`POST /api/v1/trainers/feed/answer\` passes the caller token to the existing authenticated scoring RPC. It does not insert directly into the answer table.
- 🟢 **Security and regression tests:** bearer/method guards, MBH active membership and fail-closed behavior, Unicode search, bounded validation and safe RPC error mapping.
- 🟡 **Binary/media delivery:** still on the existing backend pending a designed private file-delivery binding. No B2/R2 signing binding or SpaceWeb filesystem is available in the Worker; \`download_url\` intentionally stays null.
- 🟡 **Live RLS acceptance:** a real authenticated student-token smoke test remains outstanding; mocked-token tests are not proof of live membership/grants.
- 🔒 **Production remains unchanged:** no frontend API-mode switch, Vercel Production deployment, DNS cutover, Supabase schema/RLS or credentials mutation, or Redis resource creation.

See \`docs/CLOUDFLARE-API-ROUTE-INVENTORY-2026-10-12.md\` for route-by-route contracts and acceptance blockers. Full API parity and production cutover are **not** complete.


## 2026-10-13 — private media route implementation

- 🟡 **Material file URL:** Worker route now validates published material, active subject, specialty/group access and active file record before signing a 10-minute B2 download URL.
- 🟡 **Trainer image URL:** Worker route reads the safe public trainer view only, checks active MBH membership and returns a 302 to the signed URL to preserve the frontend's Blob contract.
- 🟢 **B2 signer tests:** HTTPS/host validation, redirect refusal, bounded expiry, object-key validation and missing-secret behavior are covered in tests.
- 🟡 **B2 runtime configuration:** build logs show no B2 binding in the Worker. Configure \`B2_KEY_ID\`, \`B2_APPLICATION_KEY\`, \`B2_BUCKET\` (and optionally \`B2_BUCKET_ID\`) through Cloudflare secrets/variables; do not commit credentials. Until then, file URL requests fail closed with 503.
- 🟡 **SpaceWeb-only files:** \`/api/v1/materials/{id}/file\` and \`/api/v1/histology/source-file\` remain on the guarded PHP backend because their source files live on SpaceWeb. Do not claim all media has migrated.
- 🟢 **Final source build:** commit `18e4af15e616dc213c73774ad882471ce94c959f`, build `530dd56a-a902-41b7-9879-06451f1382f5`, Worker version `0709ef4f-3d7d-474a-af27-c1198e60a1e1`; **225/225 tests passed**, Wrangler dry-run passed, and Shadow deployment succeeded. The trainer image route preserves the 302/binary-fetch contract.
- 🔒 **Production:** unchanged; no Vercel API-mode switch, DNS change, Supabase schema/RLS mutation or credential values were committed.

See \`docs/CLOUDFLARE-API-ROUTE-INVENTORY-2026-10-12.md\` for the route contract and exact remaining acceptance gates.


## Verified checkpoint — 2026-10-13 (latest successful Shadow build)

**Build:** \`64f4be30-63ca-483f-8e62-c644f2a5e424\` · **source:** \`462d1d3fdb2168b05f9b7afb437acb280c29f075\` · **Worker version:** \`dbc06ade-10ea-4b09-b8ca-969dfb9de6c4\`. Gate result: **225 pass / 0 fail**, Wrangler dry-run passed, Shadow deployment succeeded.

- 🟢 **Deployed and test-gated:** material list/detail/source metadata; trainer feed/detail/answer grading; personal notes/favorites; lecture mini-quiz; published-question reports.
- 🟡 **Private media handlers deployed, media delivery not accepted:** \`/materials/{id}/file-url\` and \`/trainers/feed/{id}/image\` require verified B2 credentials and live file/object mappings. Cloudflare settings currently expose **no \`B2_*\` bindings/secrets**, so don't claim working downloads.
- 🟡 **Legacy binary sources:** \`/materials/{id}/file\` and \`/histology/source-file\` remain on the guarded PHP/SpaceWeb backend.
- 🔒 **Test-attempt writes:** start/answer/finish are deliberately blocked pending a private question snapshot and narrow scoring RPC/grants.
- 🟡 **Live RLS acceptance:** no real student bearer-token smoke test was run; the unit suite used mocked requests.
- 🔒 **Production untouched:** no Vercel API-mode switch, DNS/Production cutover, Supabase schema/RLS change, or storage-secret creation.

This checkpoint verifies the stated Worker build only; full API parity and full media migration are not complete. See the route inventory for the exact remaining acceptance criteria.


## File API read pass — 2026-10-13

- 🟡 \`GET /api/v1/files/{id}\`: source added with safe metadata and owner/group/public visibility checks.
- 🟡 \`GET /api/v1/files/{id}/download\`: source added with a 10-minute private B2 URL and access checks.
- 🟢 Tests added for metadata redaction, non-member denial, MBH specialty membership, B2 signing and route guards.
- 🟡 **Build not yet verified:** latest code commit \`4c8d25f43ab851e9f25b78e7d1b5ce1498d10a7f\` remains queued. Do not count these routes as deployed until the build succeeds.
- 🔒 File upload, SpaceWeb-only media and B2 secret provisioning remain open; Production is unchanged.


## Histology media hookup — 2026-10-14

- 🟢 Uploaded-object inventory: 358 Blob keys; extension counts match the 357-entry histology archive plus one folder marker.
- 🟢 Code committed to `main`: trainer-photo alias resolution, `content_sources.source_path` → private Blob material lookup, private Blob textbook list/download, and strict allow-listing for streamed signed-download hosts.
- 🟡 Tests added for photo alias resolution and private Blob documents; CI/build execution is not yet confirmed.
- 🟡 One ambiguous filename mapping remains: `photos/5. Эмалевый орган.jpg` has no exact archive basename.
- 🔴 Live Worker connection remains blocked until `UPSTASH_BLOB_TOKEN` is added to `medbiohim-api-shadow` through Cloudflare Dashboard. No secret was copied to Git/chat and no production cutover was made.


## Verified training lifecycle on Cloudflare + live Supabase — 2026-10-15

**Implementation status: complete in the isolated Shadow Worker; Production routing remains unchanged.**

- Applied live Supabase migration `secure_histology_training_lifecycle_rpc_20261015` and committed the source migration `database/migrations/20261015120000_secure_histology_training_lifecycle.sql`.
- Follow-up migration `persist_histology_training_score_20261015` persists the completion percentage in `trainings.score`; the rolled-back live-schema smoke verified the persisted value matches the session history listing.
- Added owner-bound `SECURITY DEFINER` RPCs for create, list, get, answer, complete and cancel. Every RPC derives the owner from `auth.uid()`, requires active MBH membership and is executable by `authenticated` only; `anon`/`PUBLIC` have no execute privilege.
- Verified `authenticated` has no direct SELECT/INSERT on `public.trainings` or `public.training_answers`. Do not restore table grants as a workaround.
- Snapshots remain private in database tables. The get RPC strips correctness fields and (when required by the session label mode) preparation names/captions for unanswered cards; review data appears only after answer/skip. Correctness is computed server-side, not trusted from the request.
- Worker routes are now connected: `GET/POST /api/v1/trainings`, `GET /api/v1/trainings/{id}`, `POST /answer`, `POST /complete`, `POST /cancel`. Frontend create payload now carries selected layout mode.
- Live-schema transactional smoke passed for create → get hidden snapshot → answer → get review → complete → create → cancel → list. The transaction was rolled back, so smoke sessions are not retained.
- Latest Worker source/deployment checkpoint at time of verification: commit `8fc117fd8f74f3848bcc110fe3477a5430dd244e`, build `4dfae369-a941-44e3-b05a-8ab0ec258e3f`, **328 tests passed / 0 failed**, Wrangler dry-run and Shadow deployment succeeded; Worker version `50b913a6-9002-46c8-9d2c-eb489e7fcc57`.
- Remaining gate before calling the whole user flow accepted: a signed-in browser/API smoke with a real student bearer JWT. The SQL transaction smoke sets a test claim and is not a substitute for that HTTP/Auth test. Vercel reports `build-rate-limit`; frontend production deployment and routing cutover are not confirmed.


## 2026-10-15 — Training lifecycle hardening and verification follow-up

- 🟢 Applied Supabase migration `secure_histology_training_lifecycle_reconcile_20261015` to reconcile the committed SQL source with the live database; the completion RPC persists `trainings.score`.
- 🟢 Rechecked all six RPC grants: `authenticated` can execute them; `anon` cannot. Direct grants on `trainings` and `training_answers` remain revoked.
- 🟢 Live Supabase lifecycle smoke passed: create, get (no answer-key leak before response), answer/skip, complete, list history, create and cancel. The two temporary smoke sessions and their answer rows were explicitly removed afterward.
- 🟢 Added regression tests for malformed session IDs and non-object creation preferences; Cloudflare build `c8b8e66e-e43c-49f8-a5b8-1b199ff0315c` completed with **330 pass / 0 fail**, Wrangler dry-run passed, and Shadow deployment `52d04056-7a83-471f-ad37-4cee4599c598` serves Worker version `5ba30477-dd73-4b37-a466-9b52d8be6931` at 100%.
- 🟡 Remaining acceptance gate for this feature: a browser/API request using a real signed-in student JWT has not been run end-to-end. The database smoke set JWT claim context inside PostgreSQL and does not prove the frontend's real bearer token and Worker-to-Supabase HTTP path.
- 🔒 Production routing remains unchanged; Vercel still reports `build-rate-limit`. Do not treat the feature as production-accepted until the real JWT HTTP smoke succeeds.

## 2026-10-15 — canonical trainer RPC reconciliation and deployment verification

- 🟢 Worker restored to the established RPC contract: `histology_training_list`, `histology_training_create`, `histology_training_get`, `histology_training_answer`, `histology_training_complete`, and `histology_training_cancel`. The Worker authenticates the bearer with Supabase Auth and then sends the same caller JWT to the RPC; it does not query the protected session tables directly.
- 🟢 Applied `remove_duplicate_histology_training_rpc` to remove six temporary parallel RPC names from the live schema. The canonical six RPCs remain SECURITY DEFINER, owned by `postgres`, EXECUTE granted to `authenticated` and denied to `anon`; direct table grants on `trainings` and `training_answers` remain absent.
- 🟢 Repeated the live-schema smoke in a rolled-back transaction: start returned an answer-key-free question; get preserved redaction; answer exposed review only after submission; another user received `NOT_FOUND`; complete persisted `trainings.score` and the history list returned it; cancel transitioned a separate session. No test sessions were retained.
- 🟢 Cloudflare Build `31ae9afd-1466-4e12-ad13-bf2132a6d829`, source commit `adda422197b70912a5cca3cc159bb0f9809b1e5d`: **330 tests passed / 0 failed**, Wrangler dry-run passed, deploy command completed. Shadow deployment `d6fa407b-ce7b-459a-83eb-2359e3abe66e`, version `88d4a621-31e1-4f10-ad10-6246f6ffad4e` at 100%.
- 🟡 Still required for full acceptance: use a real signed-in browser's bearer JWT against the deployed Worker and run feed → create → answer/skip → review → complete/cancel. This transaction smoke sets JWT claim context inside PostgreSQL, not the actual HTTP token transport.
- 🔒 Production API routing remains on PHP/SpaceWeb. Shadow deploy success is not a production cutover.


## Checkpoint — 2026-10-15: Cloudflare archive reconciliation

- 🟢 Reviewed the three Cloudflare variants against current `main` and the legacy PHP archive. Detailed evidence and conflict decisions: `docs/CLOUDFLARE-ARCHIVE-RECONCILIATION-2026-10-15.md`.
- 🟢 Restored `GET/POST /api/v1/sessions` and `GET/PATCH /api/v1/sessions/{id}` in `integrations/cloudflare-api/src/index.js`, reusing the existing caller-JWT/RLS `src/sessions.js` implementation and tests. No migration was required; the existing `learning_sessions` table/policies already cover owner-only reads/inserts/updates.
- 🟢 Confirmed live Supabase has the canonical histology training lifecycle RPCs and that client roles have no direct table grants for `trainings` / `training_answers`. This is schema-level verification, not authenticated UI acceptance.
- 🟡 Tests are **not verified after this commit**. GitHub Actions runs for commit `9fc2afebc8b07244647958eb8120c38fda7295e7` failed before running any steps: runner ID 0, blank runner name, zero steps across smoke/code/package/optional jobs. This is an Actions runner/infrastructure blocker, not a demonstrated source-test failure.
- 🔒 No Cloudflare deploy, Supabase schema change, Vercel production setting, DNS, Telegram webhook, or production routing switch was made. Do not mark this pass test-green or production-ready until tests/build and signed-in Worker acceptance run successfully.


## Checkpoint — 2026-10-15: alternate archive test fixture repair

- 🟢 The archived Cloudflare package's one failing test was caused by obsolete mock data (`user_roles.role`) rather than the current `roles(code)` contract.
- 🟢 Corrected only test fixtures in an isolated archive copy; full suite: **59 passed / 0 failed**. Syntax checks passed for 54 JS files.
- 🟡 This result applies only to the alternate archive. The current GitHub Worker has not been proven green by this action, and no alternate source modules were merged from this test-only repair.
- 🔒 R2 remains rejected for the selected architecture unless explicitly reconsidered; no production deploy/cutover, DNS, Vercel production, Telegram webhook, or Supabase schema changes.
- Details: `docs/CLOUDFLARE-ARCHIVE-VALIDATION-2026-10-15.md`.


## Cloudflare production API — live account check (2026-10-15)

- 🟢 **Verified:** Shadow Worker deployed; native auth rate-limit bindings exist; private Upstash Blob bucket and active EU Redis database exist; no Cloudflare R2 dependency is required.
- 🟡 **Not done:** production Worker `medbiohim-api` has not been created; no Worker custom domain is attached; Upstash Redis token binding was not present in the live Shadow binding list; Blob object inventory and all 206 histology mappings remain unverified.
- 🟡 **Acceptance not proven:** mocked tests and deployment status do not replace signed-in student/admin checks against real Supabase RLS, schedule/homework/test/SRS flows, AI, and private media delivery.
- 🔒 **Traffic:** do not mark production traffic enabled. Shadow's 100% version assignment is scoped to the Shadow Worker only; it is not a production cutover.
- Next: test exact GitHub `main`, verify required secrets and storage objects, complete signed-in acceptance, then deploy `medbiohim-api` and switch frontend routing with rollback ready.
- Evidence: [live Cloudflare account state](docs/LIVE-CLOUDFLARE-ACCOUNT-STATE-2026-10-15.md).


## 2026-10-15 — production API gateway live

- 🟢 Cloudflare account now contains `medbiohim-api`; workers.dev subdomain is enabled. It forwards through a Cloudflare service binding to `medbiohim-api-shadow`.
- 🟢 Live smoke results: `GET /api/v1/health` 200; unauthenticated `GET /api/v1/schedule` 401; unknown route 501; Vercel-origin `OPTIONS` preflight 204. All gateway responses included `x-medbiohim-api-gateway: production`.
- 🟢 Source/config/report committed: `integrations/cloudflare-api/production-gateway.js`, `integrations/cloudflare-api/wrangler.production.toml`, `docs/PRODUCTION-API-GATEWAY-2026-10-15.md`.
- 🟡 Status is **production gateway online / independent production API pending**. The proxied health JSON remains `mode=shadow` and `productionTrafficEnabled=false` by design.
- 🔒 No frontend routing or DNS change. No claim of full production cutover or independent secret provisioning. The gateway can be disabled without affecting the current frontend route or Shadow Worker.
- Next gate: deploy current app source independently with securely provisioned secrets, then real signed-in student/admin acceptance before routing cutover.


## 2026-10-15 — additional production gateway acceptance

- 🟢 Live unauthenticated smoke: schedule, planner, subjects, tests, materials, auth/me, sessions, trainer feed, and admin schedule return 401 through the production gateway, preserving the upstream auth boundary.
- 🟡 `GET /api/v1/homework` returns 501 `ROUTE_NOT_MIGRATED` through both Shadow and gateway. This is an existing migration gap, not a gateway forwarding bug; the new hostname is not feature-complete versus the legacy backend.
- 🟡 Independent deployment is still blocked: secret values cannot be read back from Cloudflare settings, and the connected build box could not clone the repo due unavailable GitHub clone credentials. No frontend routing cutover was made.
- Evidence updated in `docs/PRODUCTION-API-GATEWAY-2026-10-15.md`.


## 2026-10-15 — Vercel 503 routing fix (pending deployment verification)

- 🟢 Root cause identified: the proxy defaults to legacy mode unless Cloudflare is explicitly opted in; absent `SPACEWEB_API_ORIGIN` then returns 503 `BACKEND_NOT_CONFIGURED`.
- 🟢 Cloudflare gateway dispatches the reported routes: `/auth/me`, `/subjects/:id`, `/subjects-catalog`, and POST `/presence/heartbeat` return expected auth/method guards without a token instead of 503. Actual authenticated Supabase/RLS behavior still requires a signed-in smoke test.
- 🟡 Source/test change defaults Vercel Production and Preview to the `medbiohim-api` gateway if no explicit origin is set; `MEDBIOHIM_API_MODE=legacy` remains the explicit rollback. Local development is unchanged.
- 🟡 Awaiting Vercel build/deploy and public frontend smoke test. Do not claim resolved until deployment is observed; route parity gaps elsewhere remain separate.


## 2026-10-15 — live status after routing fix merge

- 🟢 Source fix is in `main` (`453f19b504e014a9e222a6d02654462c64641f91`).
- 🔴 Production still runs build `ff737a17fe95beae06e53d65f79931a1d0f123cc` and still returns HTTP 503 `BACKEND_NOT_CONFIGURED` on health/auth/me/subjects-catalog/presence-heartbeat. Thus the browser error is not resolved in the live deployment yet.
- 🟡 Vercel Git status is pending; deployment/environment operations from the connected Vercel tool return authorization/scope errors. Next required acceptance: observe new production build marker, then confirm API calls route to Cloudflare and check auth/login plus subject/catalog/presence in browser.


## 2026-10-15 — Dashboard API transport indicator

- 🟡 Added a compact dashboard status pill that displays the source reported by the latest same-origin API response: Cloudflare, SpaceWeb/legacy, fallback, unavailable, or unknown. This is the backend/API transport, not the login provider (Google/Telegram/email).
- 🟡 The Next.js API proxy emits a non-secret `x-mbh-api-source` response header for proxied requests and configuration failures; the frontend listens for it and shows the latest observed request path. It does not infer an upstream from the OAuth provider or local token storage.
- 🟡 Source changes and regression behavior still require CI/build and production deployment verification. No production routing or environment settings were changed by this pass.



## 2026-10-15 — Admin API log and histology incident

- 🟡 Added `/admin/api-logs` for current-tab API telemetry: method, sanitized path, reported upstream, HTTP status, duration, request ID, filters and CSV export. This is not durable cross-user server logging.
- 🔴 Histology media remains unresolved: supplied console export has 236 image endpoint 503s. The current Upstash Blob inventory now contains 358 `histology/` objects (~432.7 MB); the earlier empty-bucket note is stale. Physical presence is confirmed, but the full 206-card-to-object mapping and signed-in HTTP/MIME delivery are not yet verified.
- 🟡 API log now captures response and network/timeout failures and persists up to 1,000 entries in the current browser tab's sessionStorage. It remains browser-local, not a durable cross-user server audit.
- 🟡 Next gates: confirm Worker secret *presence* without exposing values; reconcile all 206 cards against the actual `histology/`-prefixed keys; verify authenticated signed URLs and MIME; run frontend/Worker tests. No production cutover performed.
- 🟡 Live Cloudflare metadata check (2026-10-15): `medbiohim-api` is a gateway with `MEDBIOHIM_UPSTREAM` service binding and no secret bindings; `medbiohim-api-shadow` has `UPSTASH_BLOB_TOKEN`, B2 credentials, and Supabase settings. `UPSTASH_REDIS_REST_URL` exists as a plain-text binding, but `UPSTASH_REDIS_REST_TOKEN` is absent from the shadow secret list. No secret values were read or changed. Redis cache can therefore be unavailable (the code is designed to fail open), but this alone does not explain missing Blob objects.
- 🟡 Local test run on the uploaded `medbiohim-cloudflare-api 2.zip` passed the histology key-map checks and 58/59 Node tests; one unrelated homework grading test failed (`test/homework-mutations.test.js`, grade teacher-role case). This archive is not the exact current branch checkout, so it is evidence for that archive only, not a passing test result for the PR.


## 2026-10-16 — Histology image delivery root-cause fix

- 🔴 Root cause found in the code path: the browser requests `GET /api/v1/trainers/feed/{id}/image` as a Blob, but the Worker returned HTTP 302 to a private Upstash/B2 signed URL. Browser `fetch()` follows that cross-origin redirect; if the storage host does not grant CORS to the app origin, the browser rejects the response even when the object exists and the URL is valid. This explains why merely uploading objects and adding key aliases did not restore the images.
- 🟡 Fix in PR #23: Worker now fetches the internally generated signed URL server-side and streams the image bytes back from the same API origin with upstream content type, `private, no-store`, and `nosniff` headers. It returns a controlled 503 if the signed URL cannot be fetched, rather than exposing the cross-origin redirect.
- 🟡 This fix addresses the browser CORS/redirect contract; it does not by itself prove that every card maps to an existing object or that the deployed Worker has this commit. Live HTTP checks from the current execution environment were blocked by DNS resolution failure, so end-to-end deployed verification remains pending. Do not claim fully fixed until authenticated browser acceptance passes.
- 🟡 Upstash inventory remains 358 objects under `histology/` (~432.7 MB). The 206-card reconciliation and the complete Worker acceptance suite remain pending; no production cutover was performed.


## 2026-10-16 — Second histology media pass: signed URL redirect handling

- 🔎 Queried the live Supabase metadata for the failing card `feed-prep-ec11e91b7d`: it is published, has no `source_file_id`, and its image URL points to `5_Фотографии препаратов/частная гистология/5.Эндокринная система.Околощитовидная железа.jpg`. The matching object exists in Upstash Blob at `histology/5_Фотографии препаратов/частная гистология/5.Эндокринная система.Околощитовидная железа.jpg`. So this specific 503 is not explained by the object being absent.
- 🔎 Live metadata confirms 206 published histology cards, all 206 have source keys and image paths, and 0 use `source_file_id`; many preparation cards keep a legacy hash in `source_key`, so resolving via `preparation.imageUrl` is required.
- 🛠️ Updated the Worker media stream to follow signed-storage redirects **server-side**. Some signed object URLs can redirect to a CDN; refusing redirects turns that legitimate hop into a 503. The browser receives the final image bytes from the Worker origin, avoiding browser CORS.
- 🧪 Added `integrations/cloudflare-api/test/media-stream.test.js`; both redirect-following and unavailable-object tests passed locally with Node.
- ⚠️ This source change is on PR #23 and is not yet verified on the deployed Worker. The supplied browser log shows a 503 at the Vercel endpoint, but does not include the response JSON, so it cannot distinguish `MEDIA_NOT_MIGRATED`, `MEDIA_URL_UNAVAILABLE`, or an upstream storage failure. Next acceptance must inspect the response body/request ID and verify the deployed shadow Worker path; do not call this resolved until the live URL returns image bytes.

- 🔧 The frontend's raw `getTrainerImageUrl()` fetch previously bypassed `/admin/api-logs`. It now logs the image endpoint's sanitized status/source/request ID and, for JSON errors only, `errorCode`; successful binary bodies are not read for telemetry. This makes the next live 503 distinguishable without logging tokens or response bodies.

## Live 503/subject-data incident — 2026-10-15

- Read Cloudflare persisted Worker telemetry for the actual shadow API requests (not just browser console). Confirmed `GET /api/v1/subject-plans/histology` fails because the optional curated `site_content` read returns HTTP 403 under the student's JWT; the old handler propagated this as `SUBJECT_PLAN_UNAVAILABLE`. This is an RLS boundary, not a reason to loosen table access.
- Confirmed `GET /api/v1/subjects/{id}` logs PostgREST error `42703` for `modules`. Read-only schema inspection shows `modules.order_index` exists while `modules.sort_order` does not. The Worker had tried `sort_order` first and was not successfully recovering.
- PR #23 now queries the live `order_index` schema first and uses a title-only fallback if no ordering column exists. The optional `site_content` curated-plan lookup now treats only 401/403/404 as unavailable and continues to the existing caller-JWT `curriculum_items` fallback; RLS remains unchanged.

- Additional telemetry showed bursts of `authenticate` timeouts while many trainer-image requests were retried concurrently. The frontend now limits each image lookup to two attempts and immediately stops retrying deterministic 401/403/404/410/422 responses, reducing avoidable request amplification. This frontend change has not yet passed a Vercel build because the project is still blocked by the Vercel `build-rate-limit` status.
- Added regression fixtures for the actual `order_index` schema and `site_content` 403 case. Targeted Node regression suite `test/supabase-auth.test.js` passed 60/60 against the exact PR-branch source and test files in an isolated Node environment. Full Worker suite, GitHub Actions status, and deployed shadow acceptance remain pending; this source change is not yet claimed live-fixed. Keep production routing unchanged until these gates pass.


## Reverse contract pass — frontend → API → storage (2026-10-16)

This pass treats the existing frontend as the behavioral specification instead of assuming the legacy PHP implementation is correct.

### Browser-observed critical contract

| Frontend request | Expected responsibility | Current evidence / next verification |
|---|---|---|
| `GET /api/v1/subjects-catalog` | Subject list and catalog metadata | Worker route exists; verify Supabase schema/query and envelope against UI consumption |
| `GET /api/v1/tests?subject_id=…&group_id=…` | Published tests filtered by selected subject/group | Worker route exists; verify membership/RLS, published-only filtering, and empty-state shape |
| `GET /api/v1/lectures?subject=histology` | Lecture list with title/topic/summary/media count | Worker route exists; verify live rows and subject slug mapping |
| `GET /api/v1/progress?subject_id=…&group_id=…` | Current user's progress for selected scope | Worker route exists; verify caller JWT and group scoping |
| `GET /api/v1/subject-plans/histology` | Histology plan, with safe curriculum fallback | Worker route exists; optional CMS/RLS denial must not become a global 503 |
| `GET /api/v1/tickets` | Ticket bank list | Worker route exists; verify schema and visibility rules |
| `GET /api/v1/trainings` | User's training list/session entry point | Worker route exists; verify auth, create/read/finish lifecycle |
| `GET /api/v1/trainers/feed/{id}/image` | Private trainer image delivery | Route exists; verify metadata-to-object-key mapping, storage binding and concurrency |
| `GET /api/v1/settings/account` | Profile, preferences and linked identity settings | Route exists; 401 in browser means auth/session propagation must be checked end-to-end |

### Contract rules

- Preserve the frontend's same-origin `/api/v1` contract and standard `{ ok, data, requestId }` / `{ ok:false, error, requestId }` envelope where JSON is returned.
- Treat the browser log as evidence of failed requests, not proof that every backend handler is missing.
- A routed `503` is a dependency/schema/configuration failure until proven otherwise; a `501 ROUTE_NOT_MIGRATED` is an implementation gap. Do not hide either with fabricated success data.
- Supabase user data must use the caller JWT and remain subject to RLS. Never move service-role credentials into the browser or weaken RLS to make a screen load.
- Binary histology media must be verified independently from its metadata row. Test status, MIME type, object-key mapping, and authenticated access.
- Browser-extension exceptions and unsupported `Permissions-Policy` features are separate from API failures unless evidence links them.

### Added regression guard

`integrations/cloudflare-api/test/index.test.js` now checks that every critical route seen in the supplied browser log dispatches to a concrete handler rather than falling through to 404/501, and that the subject-catalog method contract remains explicit. This is a routing contract check, **not** a claim that live Supabase/storage dependencies are healthy.

### Next reverse-engineering sequence

1. Capture each frontend caller's expected response shape and loading/empty/error behavior.
2. Match it to the Worker handler and the actual Supabase table/RPC/storage contract.
3. Add handler-level fixture tests for data shape, RLS/ownership and error mapping.
4. Run live shadow checks with real student JWTs and configured secrets; keep production traffic unchanged until P0 checks pass.


## 2026-10-16 — Reverse pass: trainer image request pressure

- The supplied browser log shows a large burst of per-card image requests and a second wave of retry-query requests after 503 responses. The frontend helper used to start every image request immediately and automatically retried 503, multiplying load during an upstream outage.
- `src/lib/api.ts` now limits active trainer-image fetches to 6 and stops automatic retries on 503; the existing per-image manual retry remains available. Other transient statuses retain the bounded retry path.
- This mitigates request amplification; it does not repair a failing Supabase/RPC/storage dependency. Live runtime acceptance and frontend build remain unverified because the current Vercel status is `build-rate-limit`.


### Cloudflare deployment inspection (read-only, 2026-10-16)

- The production gateway Worker `medbiohim-api` has `APP_ENV=production` and a service binding to `medbiohim-api-shadow`; it does not run the API module directly.
- The shadow Worker exposes bindings for Supabase URL/anon key, Backblaze B2, Upstash Blob, Upstash Redis URL, AI provider keys, and auth rate limiters. Only binding names/configuration were inspected; secret values were not read.
- The currently deployed shadow bundle contains the `order_index` schema fallback and the secure training RPC client. Therefore the observed 503s should be diagnosed at the specific handler's upstream response/runtime path, not treated as proof that all routes are absent.
- Direct runtime requests from the connected Cloudflare tool were blocked by its outbound-request policy, so no live endpoint status is claimed from this inspection.


## 2026-10-16 — Reverse contract pass: staff grading of homework submissions

**Implemented on `main` (code changes only; no deployment/cutover):**
- Added `integrations/cloudflare-api/src/homework-grading.js` for `POST /api/v1/submissions/{id}/grade`.
- Registered the route in the Worker router and restricted it to POST.
- Role authorization is resolved server-side through `user_roles → roles(code)` using the caller JWT; client-supplied role fields are ignored.
- The update uses the caller JWT + Supabase anon key, and relies on Supabase RLS for the final write authorization. No service-role key is used.
- Added unit coverage for invalid IDs/grades, student-role rejection, teacher grading, missing submission, and route-level auth/method behavior.
- Added the route to the frontend-observed route contract guard.

**Verification status:**
- The uploaded alternate API archive was run locally: 58/59 tests passed. Its only failure is a stale test fixture returning `{ role: "teacher" }` while the implementation correctly reads the live-schema relation `roles(code)`; this archive result is not a test run of the current GitHub tree.
- The current GitHub Worker suite has **not yet been executed** against this commit. The repository is private to the available shell-clone path, so do not report the new tests as passing until a runner with repository access executes `npm test`.
- No live shadow/production smoke test, Supabase RLS acceptance test, or deployment was performed.

**Next:** run the actual GitHub-tree Worker test suite; then implement/verify the next frontend contract gap from the route matrix (file uploads/downloads and training lifecycle are higher priority than broad admin coverage). Do not enable production traffic.


## 2026-10-16 — Route fallback pass (optional CMS / RLS)

| Scope | Status | Evidence / note |
|---|---|---|
| `getSupabaseSubjectCatalog` when curriculum `site_content` is denied | **Implemented; runtime not checked** | Falls back to the previously loaded caller-visible subjects and marks curriculum unavailable/degraded. |
| `listSupabaseLectures` when CMS lecture JSON is denied/missing | **Implemented; runtime not checked** | Keeps published-only CMS filtering; histology continues through caller-JWT `histology_lectures`. |
| `listSupabaseSubjectPlans` when optional CMS list is denied/missing | **Implemented; runtime not checked** | Returns empty plans with `available:false`; does not weaken RLS. |
| Regression coverage | **Added; not locally executed** | Four tests cover 403 fallback and prove catalog 503 remains a failure. |
| GitHub Actions diagnostics | **TODO / blocked** | Workflows associated with commits `bce6a42451ad6bbda4b4319a476822f512077af1` and `647e38e7a372d29f2fb936c6e325cca8fd95b9eb` show failure within seconds; job steps/logs were unavailable via the current connector response. |
| Real Supabase student-JWT smoke | **Not checked** | Need authenticated end-to-end calls; never log JWTs or broaden RLS for compatibility. |
| Cloudflare production cutover | **Not changed** | This pass changed repository code only, not Worker deployment or production traffic. |

### Continuation
1. Obtain actionable CI step output or an alternate isolated test environment and run `node --test` under `integrations/cloudflare-api`.
2. Validate frontend expectations for catalogue, lectures, and plans against their components/hooks.
3. Continue with homework and schedule CRUD, then verify test/training answer persistence and completion through the intended Supabase RPCs.


## Reverse API contract pass — 2026-10-16 (continued)
- **Done:** added regression test `integrations/cloudflare-api/test/planner-homework.test.js` proving that a file belonging to another group is rejected before the atomic homework-with-attachments RPC. Commit: `b15e4aa0fb8f3698ea9ea168cee73544f1e15c12`.
- **Done:** supporting evidence note: `docs/migration/REVERSE_API_CONTRACT_PASS_2026-10-16.md` (commit `7f5d064dd8cfe0809eebff7672e07ae96f18f4ea`).
- **Not verified:** the new test has not been executed against the exact `main` checkout in this session; Vercel status for the documentation commit is pending. No production deployment/cutover was performed.
- **Next:** verify homework attachment upload/download end-to-end; run training lifecycle with student JWT; check account-settings behavior while authenticated; execute tests on exact `main` commit and record real outcomes.


## Pass 2026-10-16 — test answer regrade route

- [x] Compared frontend `retryTestAnswerGrading()` path with Worker dispatch.
- [x] Added `regradeSupabaseTestAnswer` using the caller JWT and an explicit RPC allowlist.
- [x] Registered `POST /api/v1/tests/attempts/{attemptId}/answers/{questionId}/regrade`.
- [x] Added route-level auth/method test plus module tests for RPC arguments, invalid IDs and safe output fields.
- [x] Whitelisted response fields to prevent arbitrary RPC columns such as `correct_answer` or `answer_snapshot` from reaching the browser.
- [ ] Verify `medbiohim_regrade_test_answer` exists in live Supabase and has authenticated-only EXECUTE grants; no SQL was applied.
- [ ] Run the updated repository's full tests and Worker dry-run against the exact main tree; CI/deployment is not verified.
- [ ] Next frontend-contract gaps to inspect: `POST /files/upload`, `GET /groups/{id}`, `POST /groups/{id}/members`.

**Implementation detail:** route is now registered, but functional regrading depends on the database RPC. A controlled 503 until that dependency exists is preferable to a fake success or client-side grading.


## 2026-10-16 — Cloudflare-only backend deployment checkpoint

- **Verified from live Cloudflare configuration:** `medbiohim-api` is currently a gateway Worker with `APP_ENV=production` and service binding `MEDBIOHIM_UPSTREAM → medbiohim-api-shadow`. It is not running `workers/api/src/index.ts` directly. Its current deployment is version `a78a8fc6-f9d1-42a6-8e2d-31fcecddc29e` at 100% traffic.
- **Verified source of the intended API:** `workers/api` contains the Hono API entrypoint, route modules, `package.json` and `wrangler.toml`; the frontend proxy `src/app/api/v1/[...path]/route.ts` is configured for Cloudflare-only and defaults to `https://medbiohim-api.ryazansevegor.workers.dev/api/v1`.
- **Blocking deployment gap:** the production Worker has no Supabase/Upstash/OpenAI bindings for the new API; the only non-secret var is `APP_ENV` and the service binding still targets Shadow. The Shadow Worker has some secret bindings, but no Redis REST token was confirmed. Secret values were not read or copied.
- **Vercel scope check:** the `medbiohim` project exists under team `MISTACEN` (`prj_85Mu4sV2fNkF8OGdKl1f4Ua4aPdk`), but environment management calls in the available connector return `Project not found` when scoped to that team, while the unscoped read works. Existing `CLOUDFLARE_API_ORIGIN` and `MEDBIOHIM_API_MODE` values currently target Shadow for Preview only. No Production environment value was changed.
- **Not completed in this pass:** direct deployment of the Hono bundle, secure binding installation, Vercel Production env update/redeploy, or live smoke tests. The connected Cloudflare API tool can inspect configuration but cannot fetch arbitrary public URLs for smoke tests, and no successful build/deploy was run. Do not mark Cloudflare-only production cutover complete until the direct Hono deployment and authenticated smoke suite pass.
- **Next execution order:** deploy `workers/api` to `medbiohim-api` using a real build path (Workers Builds or Wrangler with authenticated credentials); install only verified secret values via the secret manager; test `/health`, `/api/v1/health`, auth, schedule/dashboard/homework and training lifecycle; then set Vercel Production `CLOUDFLARE_API_ORIGIN` to the verified Worker origin and redeploy. Keep PHP/SpaceWeb out of production and do not use Shadow as the production API.

## 2026-10-16 — API error and histology media repair (main)

- Confirmed the production Worker secret **names** through Cloudflare API. `medbiohim-api` has Supabase URL/anon bindings, `SUPABASE_SERVICE_KEY` and `SUPABASE_SECRET_KEY`, `UPSTASH_BLOB_TOKEN`, B2 bindings, and several AI provider bindings. Secret values cannot be read back; presence does not prove that each value is current. The archive's Supabase URL and legacy anon key match the connected Supabase project's official URL/key. The code now accepts the existing service-key aliases instead of requiring only `SUPABASE_SERVICE_ROLE_KEY`.
- Verified private Upstash Blob bucket `medbiohim-files` contains 358 objects (432,658,572 bytes): 178 JPG, 62 PNG, 4 JPEG and 2 GIF images, plus source documents. All 206 published `trainer_feed_cards` rows have an image path, and all 206 image paths now match an object after the two incorrect preparation image URLs were corrected in Supabase.
- On `main`, pinned `@upstash/blob` to published version `0.0.11` (the prior `^1.0.0` dependency failed installation); corrected Blob reads to stream `BlobDownload.body`, corrected signed URL handling, mapped trainer feed/detail/image routes to the actual Supabase schema and `histology/` Blob prefix, and fixed mismatched paths for two preparation cards.
- Also aligned subject catalog, materials, lectures, test catalog, progress and ticket routes with tables/columns that actually exist in Supabase; restored the AI conversation endpoints with provider fallback. This removes known schema mismatches in the source, but these changes are **not yet accepted as live fixes** until the Worker build and authenticated smoke tests pass.
- Workers Builds now uses `npx wrangler deploy` after typecheck/tests. Build `4a78cefe-7d7d-441d-accb-7a514bbf449d` completed successfully for main commit `01e209f69453739557cf084514ad838fc27bfba0`; `tsc --noEmit` passed and deploy completed with Worker version `539671e5-d264-4f62-b365-b714d9a8c46d`. `node --test` currently discovers 0 tests, so the build is not a substitute for behavioral tests. Authenticated live image-endpoint smoke testing remains pending because the connected execution environment cannot directly request the public Worker URL.
- Secret values were not overwritten in this pass; Cloudflare rejected the bulk secret-write attempt. Redis REST URL/token and `OPENAI_API_KEY` are not present under those names. AI routes now fall back to configured Groq/OpenRouter/Mistral/Gemini bindings; Redis rate limiting still fails open when Redis is not configured. Rotate the Blob token previously pasted in chat after confirming a replacement.


## 2026-10-16 — regression recovery after Cloudflare cutover

- User reported a broad regression affecting both appearance/behavior and application features after the migration changes.
- Root cause identified in source history: commit `4b3e57c0` removed the SpaceWeb/legacy fallback from the Next.js API proxy and made Cloudflare the sole upstream, even though the production Worker was previously documented as a gateway to the migration Shadow Worker and the full authenticated smoke suite had not passed.
- Commit `8627b7c058434859824cb625dbba4aa296c79bc7` restores a **read-only** HTTPS SpaceWeb fallback for GET/HEAD/OPTIONS when Cloudflare is unavailable or returns a fallback-eligible server error. Mutating requests are deliberately not retried to avoid duplicate writes.
- This is a containment fix, not proof that all routes are healthy. Verify Vercel has a valid HTTPS `SPACEWEB_API_ORIGIN` before expecting fallback to work. The available Vercel connector currently returns 403 for project runtime logs, so live production smoke testing is still pending.
- Next: verify Vercel production deployment/build; then run authenticated smoke tests for login/me, dashboard, schedule, homework, trainer feed/images, tests/tickets and AI. Keep existing UI intact; no broad redesigns while restoring stability.


## 2026-10-16 — Academic planner / attendance
- Source committed on `main`: `planner.ts`, `academic.ts`, `attendance.ts`; `index.ts` mounts `/planner`, `/academic`, `/attendance`.
- `homework.ts` now includes schedule/subject relations and student task creation with optional schedule-entry linkage.
- Security checks in source: group membership for planner/attendance and for linked homework; attendance statuses allow present/excused/sick/unexcused.
- Status: source implemented, **not runtime verified**. CI status for latest commit reports Vercel build-rate-limit failure. Worker typecheck, tests, RLS and authenticated smoke tests remain TODO.


## 2026-10-16 — Homework lifecycle
- Source changes on `main`: `homework.ts`, new `submissions.ts`, route mount in `index.ts`, merge documentation.
- Implemented: create, scoped listing, submit, view submissions, staff grade, return for revision, personal progress.
- Authorization: user identity from auth middleware; roles resolved through `user_roles → roles(code)`; student submission and listing scoped to group membership/ownership.
- Status: source committed; typecheck, live Supabase RLS/schema validation, and authenticated smoke tests are still pending. Not marked production-complete.


## 2026-10-16 — Tests / preparation / answers / learning sessions
- Реализовано в `workers/api/src/routes/tests.ts`: опубликованный каталог/метаданные тестов, история попыток текущего пользователя, старт, сохранение ответа через `medbiohim_save_test_answer`, завершение через `medbiohim_finish_test_attempt`, regrade через отдельную RPC. Прямой INSERT fallback для попытки удалён.
- Ответ активной попытки очищается от ключей/оценки/feedback до завершения; поля попытки выдаются через allowlist.
- Реализовано в `workers/api/src/routes/sessions.ts`: полный CRUD-контракт legacy `learning_sessions` (GET list, POST, GET by id, PATCH) с проверкой владельца в каждом запросе и валидацией полей.
- Усилена валидация lifecycle тренажёров в `workers/api/src/routes/trainings.ts`; RPC остаётся обязательной границей доступа и проверки ответов.
- Подключён `workers/api/src/routes/preparation.ts` для старых путей start/resume, GET session, PATCH/save answer, finish, retry-grading и AI review. Он использует существующие серверные функции `integrations/cloudflare-api/src/planner.js`, которые собираются в canonical Worker, а не HTTP fallback к PHP/SpaceWeb/Shadow.
- **Проверка:** typecheck/тесты и живые RPC/RLS smoke не выполнены в этой сессии. Попытка клонировать приватный репозиторий в runner остановилась на отсутствии GitHub credentials; изменений окружения/деплоя не было.

- **Осталось проверить:** сборку (в том числе bundle JS compatibility module), typecheck и полный authenticated lifecycle через реальную Supabase-схему/RLS. Проверка не выполнена; production-ready не заявляется.

- Добавлен `workers/api/test/contracts.test.js`: регрессионные проверки монтирования маршрутов, server-only RPC, старых preparation endpoints, owner-scoped `learning_sessions` и валидации тренировок. Файл добавлен, но тесты ещё не запускались: приватный GitHub checkout в runner недоступен без credentials; Vercel check остаётся `build-rate-limit`.


## 2026-10-16 — Admin: questions, lectures, users, imports, Telegram

- Подключён canonical `/api/v1/admin/*` через `workers/api/src/routes/admin.ts`; role codes читаются через `user_roles → roles(code)`, не из несуществующего `user_roles.role`.
- Question management: `exam_questions` CRUD по legacy UI-контракту; `questions` bank edit с валидацией MCQ и best-effort snapshot в `content_versions`.
- Lecture management: JSON source `site_content(key=lectures)`, PATCH/publish/reject/delete и OpenAI generation в черновик на ручную проверку.
- User management: список, роли, active group; роль может назначать/снимать только admin. Добавлена защита от снятия собственной роли, если это последний admin.
- Imports: поддержан frontend workbook payload `tests/questions/test_questions/dry_run` плюс ограниченный package import. Исторический histology scope закреплён как `subject_slug=histology`, `specialty_slug=mbh`.
- Telegram: chats/bind/set-webhook; секреты не возвращаются в API response и не записываются в репозиторий.
- Добавлен `workers/api/test/admin.test.js` для регрессионных контрактов. Тесты/typecheck не запускались: GitHub checkout в runner недоступен в этой сессии, статус CI для коммита `04a690aa` не содержит проверок. Реальный RLS/DB smoke не выполнялся.
- Риск/следующий шаг: проверить точную схему Supabase (особенно `exam_questions`, `site_content`, `content_versions`, `modules/topics`, `telegram_bot_chats`), typecheck и import rollback. Не объявлять production-ready до этого.

## Auth token response + Telegram site chooser — 2026-10-16
- Fixed the frontend/backend auth contract: login and registration now accept the token session nested under `data.session` as well as legacy top-level tokens; Cloudflare auth login returns top-level token fields plus the nested session for compatibility.
- Registration API now accepts the frontend's `full_name` field as well as `name`, so the submitted display name is not silently discarded.
- Login now distinguishes Supabase `email_not_confirmed` from invalid credentials and shows an actionable confirmation message; the actual user account state still must be checked in Supabase if login continues to fail.
- Telegram `/start`, `/help`, `/site`, `/login`, and `/register` now offer exactly two destinations: the old site `medbiohim.vercel.app` and the new `main` deployment `medbiohim-git-main-mistacen1.vercel.app`. The SpaceWeb deployment is intentionally not exposed as a third button.
- Added/updated regression assertions for the three Telegram links. Test execution and Cloudflare Worker deployment are not confirmed in this change; Vercel status checks may be blocked by the existing build-rate-limit.


## 2026-10-16 — Auth: missing access token diagnosis
- Login and registration now accept session/token payloads in the canonical `{ data: { session } }`, `{ data: session }`, nested `data.data.session`, and camelCase token variants, without changing the server's security boundary.
- Login no longer incorrectly blames email confirmation when the API responds successfully but omits `access_token`; it displays a response-contract/deployment diagnostic and request ID. Explicit `needs_email_confirm` still gets the confirmation message.
- Supabase project is `ACTIVE_HEALTHY`. Recent auth logs include successful password-token requests and `invalid_credentials` failures; the queried log window did not show `email_not_confirmed`. This does not identify the user's account without its email and does not prove the currently used site deployment is on the latest frontend.
- Vercel deployment inspection was denied (403), so production deployment/build status is unverified. Do not mark the login issue resolved until the latest `main` deployment is ready and login is smoke-tested.


## Vercel build unblock — 2026-10-16

- Confirmed production build failure from the supplied Vercel log: root Next.js TypeScript check traversed `workers/api/src/index.ts` and failed resolving `hono`, which is intentionally a dependency of the separate `workers/api/package.json`, not the frontend root package.
- Updated root `tsconfig.json` on `main` to exclude `workers/api/**` and `integrations/cloudflare-api/**` from the frontend project typecheck. These Cloudflare API projects retain their own TypeScript/build configuration and must be checked independently in their respective directories.
- Commit: `02b586a68654a4d5d6a573bf474f8101a633f652`. This addresses the exact reported TypeScript error at source level; a successful Vercel build and login are not yet verified until the new deployment finishes and is smoke-tested.


## Browser API log review — 2026-10-16

- Reviewed uploaded `medbiohim-api-log.csv` (11 requests, timestamps 2026-10-16 06:32:17–06:32:40 UTC). `GET /auth/me`, `/dashboard`, `/subjects`, and `POST /presence/heartbeat` returned 200 through Cloudflare. This is evidence that a session was recognized for those calls; it does **not** prove the password-login request itself succeeded in this capture.
- `GET /academic/state`, `/settings/account`, `/settings/telegram/status`, `/admin/overview`, and `/admin/announcements`, plus `/admin/users`, returned 501. `GET /groups` returned 503. All rows show `source=cloudflare` and `fallback=false`, so these errors were not recovered by the frontend's read-only SpaceWeb fallback.
- This confirms an API route-parity/runtime issue after the frontend reaches Cloudflare, separate from the Vercel TypeScript build error. Do not treat 501 as invalid credentials. Compare each response contract against the frontend and deployed Worker before porting; protect admin endpoints with canonical role checks and do not weaken auth or RLS to silence errors.
- The log contains no login POST, no response body/error code, and no login request ID; password-login success/failure cannot be inferred from this CSV alone. Live production fix remains unverified.


## Worker build remediation from Claude patch review — 2026-10-16

- Applied the safe portions of the supplied patch directly to `main` (no branch): normalized Hono route params to `string` before UUID/identifier validation in admin, attendance, homework, sessions, submissions, tests, trainings and preparation handlers; kept the production typecheck enabled rather than bypassing it.
- Typed the enriched planner homework collection as `any[]` to avoid TypeScript narrowing failures on the enriched rows. The shared legacy planner JS import is now suppressed at the import declaration only; this is a temporary compatibility bridge, not a claim that the shared module has full type declarations.
- Fixed a confirmed homework-list defect: overlapping group/personal queries are deduplicated by ID before sorting and progress joins.
- Restored best-effort `POST /auth/logout` before local token clearing, and aligned the shadow Worker tests with current contracts: batch B2 signer import, settings API source inclusion, removed obsolete frontend `/schedule/entries` expectation, admin subject-slug casing, and group/subject POST validation expectations.
- Supabase `authenticated` USAGE on `private` was reported as already applied by the user; this pass did not rerun or broaden grants. No RLS policies or role gates were weakened.
- Validation limitation: repository edits were made through GitHub Contents API; no local install/build or production deployment was run in this pass. Do not mark Worker typecheck, full test suite, Vercel build, `/academic/state` live response, login, or trainer image delivery as verified until build/test/deployment checks complete. Keep the Vercel build-rate-limit blocker and live `UPSTASH_BLOB_TOKEN`/image logs as separate outstanding checks.


## 2026-10-16 — Supabase source-of-truth audit (Stage 1)

- Read-only live audit completed for Supabase project `gnobvyjywtqbdfeejxmf`; detailed evidence: [docs/SUPABASE-SOURCE-OF-TRUTH-AUDIT-2026-10-16.md](docs/SUPABASE-SOURCE-OF-TRUTH-AUDIT-2026-10-16.md).
- Observed 84 public tables, RLS enabled on all 84, 169 policies; latest registered migration `20261016075941`.
- Confirmed settings API schema mismatch: Worker uses nonexistent `user_settings`; live schema has `user_preferences`.
- Confirmed Telegram chat storage exists, but account/link-token tables do not; Telegram linkage needs an explicit schema/auth design before implementation.
- Likely academic-state failure identified: Worker embeds `topics(title)` from `student_academic_states` despite polymorphic `target_id` and no FK to `topics`. Capture runtime error and fix with type-aware lookups.
- Supabase advisors: one SECURITY DEFINER view finding, ten authenticated SECURITY DEFINER function warnings, and 44 unindexed-FK performance findings. These are queued for individual review; no security or index changes were made.
- No schema/data mutation, secrets access, deployment, or traffic cutover in this audit.
- Next: repair settings and academic state against live schema, then validate signed-in schedule/catalog/groups CRUD and API contract parity.

- **Migration parity remains unverified:** live Supabase reports migration `20261016075941` (`grant_private_schema_usage_to_authenticated`), but code search did not locate the migration file and the conventional `supabase/migrations/` path returned 404. Locate the repo's actual migration directory and compare all versions before applying further DDL; do not replay grants blindly. Details in the audit report.


## 2026-10-17 — Worker/Supabase contract fixes (source changed; runtime pending)

- Updated `workers/api/src/routes/settings.ts` to use the live `public.user_preferences` table instead of nonexistent `user_settings`.
- Added the canonical frontend route `GET /api/v1/settings/account` with the expected `user / identities / providers_available / preferences / sync` response shape, and `PUT /api/v1/settings/preferences` for owner-scoped preference persistence. Legacy `GET/PATCH /settings/` routes remain available.
- Updated `workers/api/src/routes/academic.ts` to remove `topics(title)` from the `student_academic_states` select. Topic names are now looked up separately by IDs only for rows where `target_type = 'topic'`; the existing subject FK embed and per-user filter remain.
- Added static regression guards in `workers/api/test/supabase-contract.test.js` for the table name, account/preferences route registration, and polymorphic topic lookup.
- Source commits on `main`: settings schema fix `2d822c43982cd02462a7b6585ae2c0ab9390f532`; academic lookup fix `de5f67109139fd394e51f2dd43bb14f463b7b423`; account/preferences contract `a03cd33ee674a945f9705f61188f2a183219f6cf`; regression guard `f3567b5e0f9c0a32c3a4c6ff7d3bf650a46a5c48`.
- Validation performed: re-fetched current source and confirmed no `user_settings` query remains, account route is registered, and the invalid topic embed is removed. The test file was inspected but **not executed**; no Worker typecheck/build, signed-in HTTP smoke test, or production deployment was run. Do not treat these routes as live-verified.
- Still outstanding: `PATCH /settings/profile`, password and identity link/unlink handlers, Telegram status/link/unlink (schema/auth design required), actual authenticated GET/PUT preferences, and GET `/academic/state` with real JWT. Migration parity for `20261016075941` remains unverified.


## 2026-10-17 — settings/academic follow-up

- Confirmed live schema columns: `public.user_preferences(user_id, preferences jsonb, created_at, updated_at)`; owner-only SELECT/INSERT/UPDATE/DELETE policies are present. `public.users` has `full_name`, `avatar_url`, `course_number`, and `semester`; its UPDATE policy requires `id = auth.uid()`.
- Added `PATCH /api/v1/settings/profile`: validates profile fields, writes `full_name/avatar_url` through the caller's Supabase JWT (RLS remains enforced), and changes email only through Supabase Auth's authenticated user endpoint. Added static contract assertions for this route and owner-scoped update. Commits: `48636fddd3a930ec18f4e76e229f01882750183d`, `b4442b53f4756c3b83b721e6f5dbf69e14c44b2d`, test `84a469f346bcff9eb191e0808ff3fdae6ad68b9c`.
- Academic state now treats errors from the primary state, topic-progress, and profile queries as errors rather than silently returning partial data. Commit: `0c3b7f6eb0780c207c624f403d6462dc331e7703`.
- Latest inspected source confirms the Worker mounts `/settings` and `/academic`. It has no dedicated `routes/telegram.ts`; Telegram account linking cannot be enabled safely yet. A candidate migration `database/migrations/20261011120000_telegram_account_linking.sql` exists in GitHub, but live Supabase still lacks both `telegram_accounts` and `telegram_account_link_tokens`. Do not run the migration until its grants, trigger/webhook contract, backup/recovery and schema parity are reviewed.
- Verification blockers: no `workers/api/package-lock.json` was found, no matching GitHub Actions test workflow was found, and the test file was inspected but not executed. The latest GitHub commit status reports Vercel failure with `build-rate-limit`; this is a hosting/build quota blocker, not proof that the Worker TypeScript build failed. No Worker build/deploy or authenticated API smoke test was run. No production traffic or live DB rows were changed.
- Next: establish a reproducible Worker test/build path (lockfile/package manager and CI runner), run `npm run check`, then use an authenticated session to verify account/profile/preferences and academic state. Telegram remains blocked on migration/schema and verified bot webhook flow.

- Follow-up hardening: profile update now checks that an owner row was actually updated (empty RLS-filtered update is not reported as success); regression assertion updated. Commits: `0319e2c2eeab0af2eed8e538391f970fdf1c2948`, `81f1deae506b17a8cd4ce8a8eeeddb0e38e8992b`. Latest status check: [{"context":"Vercel","state":"failure","target_url":"https://vercel.com/mistacen1?upgradeToPro=build-rate-limit"}] . Tests still have not been executed in a Worker build environment.

- Settings API follow-up: added authenticated `POST /settings/password` using Supabase Auth; added `POST /settings/identities/link` with provider allowlist and redirect-origin validation; added `POST /settings/identities/unlink` with ownership check and guard against removing the last identity. Regression guards now cover these routes. Commits: `83b679960dd2b77f5e232aae6d67c48d01b1b713`, `4405af3e31d7da97c5c2cb2bb27f8d476bd5cb65`, `2cea7953c355837b877377e9b599417622cc4021`. These are source-level changes only; not runtime-verified. Telegram routes remain intentionally unimplemented pending live schema migration review.


## 2026-10-17 — SpaceWeb → Cloudflare sync gate

- Fixed the literal escaped-newline defect in `workers/api/src/routes/academic.ts`; `workers/api` TypeScript check and 11 tests pass in the sandbox.
- Stabilized source-contract tests for settings/identity/password handlers; all 11 Worker tests pass.
- Migration Worker `integrations/cloudflare-api`: 390/390 tests pass; `wrangler deploy --dry-run` passes (823.54 KiB, gzip 137.79 KiB).
- Fixed frontend failover assertions to match the current production Cloudflare origin and HTTPS-only legacy fallback; 9/9 tests pass. Updated predeploy audit and CI source checks to test the actual current proxy contract.
- Fixed two PHP syntax defects found by CI: homework SQL now uses PHP nowdoc; SQL scanner correctly escapes backslash. CI then exposed another malformed SQL string in `AcademicContextResolver.php`, converted that filter to nowdoc. Continue following the latest CI PHP lint until all files pass.
- Current Cloudflare API live health is 200, but latest repository source has not deployed: GitHub Actions deploy failed because repository secret `CLOUDFLARE_API_TOKEN` is unavailable. Live unauthenticated probes on the old deployed Worker still show 501 for settings account, settings preferences GET, Telegram status and files. Do not describe source code as live until deploy verification succeeds.
- Private Upstash Blob `medbiohim-files`: 358 `histology/` objects / 432,658,572 bytes. SpaceWeb archive: 416 files / 146,911,169 bytes under `spaceweb_upload/content/histology/`. Counts differ and trees are not proven identical; exact missing count is unknown until path + SHA-256 manifest reconciliation. No objects deleted or overwritten.
- Added [SpaceWeb → Cloudflare synchronization audit](docs/SPACEWEB-CLOUDFLARE-SYNC-STATUS-2026-10-17.md). Cloudflare R2 remains disabled; keep private Upstash Blob as active media storage, Supabase as relational/auth source of truth, and Redis for cache only.
- **Gate before declaring synchronized:** configure the least-privilege GitHub Actions secret `CLOUDFLARE_API_TOKEN`; deploy exact tested source; run authenticated read/write smoke tests; compare histology manifests and upload only verified missing/changed objects. No production traffic switch or Telegram webhook change was made.


## 2026-10-17 — Supabase directory/group synchronization

- [x] Confirmed live Supabase data exists (5 users / 4 groups / 6 membership rows).
- [x] Fixed invalid group and membership column selections in `groups`, `auth/me`, `me`, `my`, and dashboard Worker routes.
- [x] Added and applied `20261016160523_admin_user_directory_rls` for admin-only user directory and role management, retaining self-only access for non-admin users.
- [x] Fixed admin assignment schema mismatch and reduced the chance of losing the previous membership if a new assignment fails.
- [x] Added source-contract regression test; Worker check passes (13/13), API failover tests pass (9/9), migration Worker tests pass (390/390), predeploy audit passes with a PHP CLI warning.
- [ ] Deploy exact source to production Cloudflare and verify authenticated dashboard, group dropdown, admin user list, and assignment read-after-write. Blocked by missing `CLOUDFLARE_API_TOKEN` GitHub Actions secret.
- [ ] Reconcile SpaceWeb histology archive and Upstash Blob path/hash manifests; do not declare full synchronization until exact match is verified.


## 2026-10-17 — Telegram linking and sync continuation

- Applied Supabase migration `telegram_account_linking_rpc_20261017`: private Telegram tables with RLS and explicit RPCs for user-scoped token creation/status/unlink plus service-role-only atomic webhook confirmation. Verified privileges and safe no-auth/invalid-token responses; no account rows were created.
- Ported Telegram settings routes to the canonical Worker and mounted `POST /api/v1/telegram/account-link/confirm`. Telegram token is random 24-byte hex, only SHA-256 hash is persisted, expires after 10 minutes, and token creation is capped at five per user per 15 minutes. Webhook secret is checked before body processing; service-role confirmation RPC is not callable by authenticated/anon.
- Pointed Telegram Worker config at the canonical Cloudflare confirmation URL. Added separate deploy workflows for the migration Worker and Telegram Worker. These are source/CI changes only; published Workers remain unsynchronized until the Actions secret `CLOUDFLARE_API_TOKEN` is configured.
- Verified: canonical Worker typecheck + 14/14 tests; Telegram Worker 14/14 tests; migration Worker 390/390 tests; frontend failover 9/9 tests; Next.js production build passes with `CIRCLE_NODE_TOTAL=2`; local predeploy audit PASS with one warning (PHP CLI absent in sandbox). GitHub PHP syntax CI passed after fixes in `HomeworkRepository.php`, `AdminDatabaseManager.php`, and `AcademicContextResolver.php`; rerun after the latest Telegram changes is pending.
- Required Cloudflare config before link flow can be live: set `TELEGRAM_WEBHOOK_SECRET` on `medbiohim-api` to the same value as the Telegram Worker secret; set `CLOUDFLARE_API_TOKEN` as a repository Actions secret; verify Upstash Redis URL/token and OpenAI configuration (active health still reports Redis/OpenAI unconfigured).
- Media parity remains unproven: Blob has 358 `histology/` objects / 432,658,572 bytes; SpaceWeb archive has 416 files / 146,911,169 bytes. Do not infer an exact missing count; path/hash manifest reconciliation and verified delta upload are still required.


## 2026-10-17 — latest verification delta

- `workers/api`: TypeScript + 15/15 tests PASS in the sandbox, including Telegram RPC contract and migration fixture checks.
- `integrations/cloudflare-api`: 390/390 tests PASS; Telegram Worker 14/14 PASS; legacy Telegram bot 15/15 PASS; frontend API failover 9/9 PASS; histology importer 6/6 PASS.
- Fixed a real media importer bug: `content/histology/5_Фотографии препаратов/...` paths now retain the `5_Фотографии препаратов/` segment. The importer still refuses conflicting normalized paths instead of overwriting.
- Full Next.js production build PASS with `CIRCLE_NODE_TOTAL=2`; full predeploy audit PASS with one environment warning (PHP CLI is absent from the sandbox; PHP syntax runs in GitHub CI). Optional-integrations CI passed after the importer fix.
- Supabase Telegram RPC migration is live and permission checks passed. The latest canonical API and Telegram Workers still have not deployed because GitHub Actions lacks `CLOUDFLARE_API_TOKEN`; the active Cloudflare Worker must not be described as synchronized until deploy and live smoke checks succeed.



### Additional checks
- [x] Added GET `/settings/preferences` compatibility route required by the frontend.
- [x] Current tests: Worker 15/15, frontend failover 9/9, migration Worker 390/390; Next.js build and predeploy audit pass with PHP CLI warning; Worker dry-run passes.
- [ ] Live Cloudflare still serves 501 on GET `/api/v1/settings/preferences`; primary deployment is older than current `main` and GitHub Actions has no `CLOUDFLARE_API_TOKEN` value. This remains a deployment gate, not a code-test failure.


### Histology media sync result (2026-10-17)
- [x] Reconciled 416 SpaceWeb archive files against private Blob by object path + MD5/ETag.
- [x] All 234 unique source file contents exist in Blob; all canonical path keys match. The 144 missing keys are encoded `#U...` aliases with content already present at canonical paths; database content tables contain zero references to those aliases.
- [x] Preserved 58 extra `histology/source-materials/` objects in Blob. No objects were deleted or overwritten.


## 2026-10-17 — files and admin storage parity

- Added canonical `/api/v1/files/upload`, `/api/v1/files/{id}`, and `/api/v1/files/{id}/download` handlers. Upload persists metadata in Supabase `files`, checks group access and MBH specialty access, and cleans up Blob objects if metadata/signing fails. Read/download relies on existing RLS and rejects files outside the user's allowed storage key scope.
- Added strict-admin `/api/v1/admin/files/capabilities` and read-only `/api/v1/admin/files/audit`, including reference counts for materials, trainer cards, homework attachments and submissions. Cloudflare Worker image processing is explicitly reported unsupported rather than returning false capability claims.
- Worker TypeScript + 17/17 tests pass locally. Live route smoke still returns 501 for file metadata and admin audit, so these source changes are not yet live.
- Current DB constraint `files_storage_provider_check` rejects `upstash_blob`; code uses allowed `unknown` until the additive constraint migration is applied. The migration file exists but was not applied; no constraint was bypassed.
- Deployment still requires `CLOUDFLARE_API_TOKEN` in GitHub Actions. Do not call the SpaceWeb → Cloudflare sync complete until the latest Worker code is deployed and these routes return their expected authenticated behavior.


## 2026-10-17 — live Cloudflare smoke and final deploy gate

- Live no-auth smoke: account settings, preferences, Telegram status and academic state return 401 (protected routes are mounted). Telegram confirmation returns 503 `BOT_NOT_CONFIGURED` because the canonical API Worker lacks `TELEGRAM_WEBHOOK_SECRET`.
- Live file metadata and admin storage audit still return 501; latest source handlers are locally typechecked/tested but not yet published.
- Live health returns 200 but `redisConfigured:false` and `openaiConfigured:false`. Cloudflare binding inventory shows `UPSTASH_REDIS_REST_URL` and `SUPABASE_SERVICE_KEY` on the production API, but no `UPSTASH_REDIS_REST_TOKEN` or `TELEGRAM_WEBHOOK_SECRET`. Telegram Worker already has its webhook secret and the canonical confirmation URL; the same secret must be added to the API Worker via Cloudflare Dashboard.
- Latest Worker deployment job: 17/17 tests passed, then Wrangler failed because `CLOUDFLARE_API_TOKEN` is empty in GitHub Actions. API, shadow and Telegram dry-runs pass locally; dry-run is not deployment.
- Histology path/hash parity and the provider constraint extension remain open. No data objects were overwritten/deleted, no production traffic was switched, and no secrets were printed.


## 2026-10-17 — corrected live route observation

- Latest live unauthenticated probes now return `401 UNAUTHORIZED` for `GET /api/v1/files/{id}` and `GET /api/v1/admin/files/audit`; those protected routes are mounted. The earlier 501 observation was from an older probe/version and is superseded.
- `POST /api/v1/telegram/account-link/confirm` still returns `503 BOT_NOT_CONFIGURED`, so account-link confirmation cannot work until `TELEGRAM_WEBHOOK_SECRET` is added to the canonical API Worker.
- The published Worker bundle contains the Telegram RPC and storage-audit code signatures, but GitHub Actions redeployment remains blocked because `CLOUDFLARE_API_TOKEN` is empty. Authenticated read/write tests are still required to prove runtime behavior end-to-end.


## SpaceWeb fallback/deploy status (2026-10-17)

- `deploy-backend.yml` failed at FTP root discovery because the expected `backend/public/index.php` was not found under any verified candidate root. No FTP upload/deployment was performed; the remote path was not guessed.
- Keep SpaceWeb fallback-only. Before changing that workflow, confirm the actual remote document root and compare its contents with the repo/archive. Cloudflare route coverage and media parity are tracked in `docs/SPACEWEB-CLOUDFLARE-SYNC-STATUS-2026-10-17.md`.


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


## Pass — curated subject plans through a scoped Supabase RPC (2026-10-17)

- 🟢 **Live Supabase DDL applied:** `medbiohim_get_student_subject_plan(text, integer, integer)`. Only allow-listed plan keys are readable; the function checks `auth.uid()`, active `group_memberships`/active `groups` with `specialty_slug='mbh'`, or an admin role, and resolves the requested course/semester to an active subject row.
- 🟢 **Live privilege/RLS spot-check:** `anon_can_execute=false`; `authenticated_can_execute=true`; `SECURITY DEFINER` with empty `search_path`. Existing `site_content` policy still gates plan rows to admins for direct table reads; no broad table grants or RLS policy changes were made.
- 🟢 **Source updated on `main`:** migration file, both Cloudflare Worker implementations, subject page fallback for title/workload fields, micro-preparation rendering, and regression test additions.
- 🟢 **CI verified:** source commit `faa36cf1f5501064fac762a29a5e48c1684bd952` passed `MEDBIOHIM code checks`; the API Worker test report was 391 tests / 0 failures, Next.js production build passed, and optional integrations checks passed. **Not yet verified:** live authenticated RPC invocation/page smoke using a real student session.
- 🔴 **Production activation is still unverified/blocked:** prior deployment audit recorded empty/missing GitHub Actions secret `CLOUDFLARE_API_TOKEN` and Vercel deployment HTTP 403. Keep the current production UI marked as not verified until worker version, frontend deployment, and signed-in read-after-write/page checks are confirmed.

Next: run canonical Worker typecheck/tests plus the integration Worker tests, inspect CI/deployment state, then verify the authenticated subject page and continue PHP-to-Worker route parity beyond this page.


## Pass — restore PHP-compatible test detail and question-bank contract (2026-10-17)

- 🟢 **Source updated on `main`:** Worker test catalog/detail now returns `{ test, questions }`, including ordered published/non-archived questions. Existing frontend `openTest()` and `getTestBank()` already expected that contract; the former Cloudflare handler returned only test metadata.
- 🟢 **Answer handling:** default test mode strips the answer and correctness flags; `view=bank` is the deliberate study-mode path for question answers. Subject-specific tests are scoped by the student's active group specialty. Unknown subject slug returns no tests rather than unfiltered results.
- 🟡 **Test gate:** regression assertions were added, but the latest commit's Action run summaries returned zero jobs and the Vercel check is failing; don't claim these new changes passed CI yet.
- 🔴 **Live activation pending:** live `medbiohim-api` contains the scoped subject-plan RPC but lacks the newest test-question response handler, so the source fix is not yet present in the inspected deployed bundle. Vercel preview creation was rejected with 403; existing status points at the build-rate-limit gate.

Next: get an authorized Vercel deployment path, verify typecheck and tests against current main, deploy canonical Worker and frontend, then smoke-test Histology plan (18 weeks / 144 h / 4 credits), billets, test mode, study-bank answers and preparation sessions with a legitimate MBH student session.
