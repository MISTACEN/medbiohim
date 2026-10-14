# MEDBIOHIM — uploaded backend archive and Vercel console log audit

Date: 2026-10-14 (UTC)
Repository: `MISTACEN/medbiohim`
Environment examined: production browser console export + Cloudflare shadow telemetry. This is an evidence report, not production acceptance.

## Legacy PHP backend is the current frontend contract baseline

The user confirms the older PHP backend is the version on which the latest frontend works best. Treat it as the **behavioral/API-contract baseline**, not as disposable legacy code:
- Preserve the current frontend and its existing response shapes, authentication/session behavior, status codes, media URLs, and study flows.
- Migrate route families one at a time into Cloudflare shadow, comparing old PHP responses with the new Worker on representative authenticated cases.
- Keep the current PHP/SpaceWeb API as production until each route family passes parity tests and media access/RLS is verified. Do not perform a bulk backend replacement or production cutover just because secrets are now configured.

## Additional legacy PHP archive — follow-up review

- The user also supplied `public_html-31.zip` (149,011,784 bytes), distinct from `medbiohim-cloudflare-api(2).zip`. It is the legacy PHP backend archive and is the behavior/API compatibility source of truth alongside the deployed PHP backend.
- The archive has been materialized into the working-file service, but local container execution currently returns a runtime `ClientError` even for simple `ls` commands. ZIP listing/extraction and PHP source inspection therefore have **not** been completed in this pass. Do not claim that credentials, routes or files were extracted from it.
- Current repo source review confirms `integrations/cloudflare-api/src/trainer-file.js` uses authenticated caller-JWT Supabase reads and has a private Blob-first/B2 fallback path; `src/b2-download.js` validates HTTPS B2 API/download hosts, validates object keys and produces bounded short-lived download authorization. This is a source review only; live B2 credentials, object inventory, and signed-download delivery still need runtime verification.
- Next archive-transfer pass: extract and inventory `public_html-31.zip`; identify PHP routes, response contracts, auth/session rules, SQL/RLS assumptions, media paths and provider integrations; compare each route family to the Worker; port missing behavior with parity tests; separately identify test credentials and never commit them. Keep the existing PHP backend intact and do not switch production routing until authenticated parity tests pass.

## Uploaded archive

- The uploaded `medbiohim-cloudflare-api(2).zip` is an older Cloudflare Worker scaffold. It contains source/tests and a Wrangler config, but no `.env` or populated runtime secret file.
- Values using `https://test-project.supabase.co` in tests are fixtures, not credentials for the current project. No OpenAI/Groq/provider API token or Cloudflare deployment token was found in the archive.
- Running its Node test suite locally: **58 tests passed, 0 failed**.
- Its Wrangler config declares a Cloudflare R2 `FILES_BUCKET` binding named `medbiohim-files`. This is not the existing Backblaze B2 bucket and must not be copied blindly into current configuration.
- Do not replace the current repository Worker with this archive: current `main` contains newer auth/RLS fixes and additional modules/routes.

## Browser console log findings

The uploaded log contains 250 API-request error records:
- **247 × HTTP 503**
- **3 × HTTP 501**
- Three duplicate console lines mean there are 247 unique error lines.
- **236 of the 247 503 responses** are requests to `/api/v1/trainers/feed/{id}/image` (preparation images and electronograms).
- Remaining 503s: `/api/v1/progress` (3), `/api/v1/subjects-catalog` (3), and one each for `/api/v1/search`, `/api/v1/subject-plans/histology`, `/api/v1/tickets`, `/api/v1/lectures`, and `/api/v1/tests`.
- 501 endpoints: `GET /api/v1/histology/source-materials?folder=Учебники`, `GET /api/v1/trainings`, and `GET /api/v1/settings/account`.
- The four unsupported `Permissions-Policy` feature warnings are not the cause of these API errors.
- The browser log does not include response bodies, so it cannot alone identify whether each 503 comes from auth/network timeout, RLS/schema, missing route, upstream configuration, or media-object lookup.

## Live configuration evidence

- Supabase project `gnobvyjywtqbdfeejxmf` is reported `ACTIVE_HEALTHY`, region `eu-west-1`.
- The Cloudflare `medbiohim-api-shadow` Worker has bindings named `SUPABASE_URL` and `SUPABASE_ANON_KEY`; their stored secret values were not read.
- Shadow deployment reported at 100% on version `da9d77e7-ff47-43b5-8c41-121c99c655a6`, deployment `2ec91a22-de42-4c97-b697-4ac2ef3f5f6b`, created 2026-10-13 14:32 UTC. This is the shadow Worker, not a production cutover.
- Cloudflare Observability entries on 2026-10-13 14:37 UTC show `supabase_auth_upstream_fetch_failed`, operation `authenticate`, `TimeoutError`, reason `timeout`, while the configured Supabase URL was HTTPS and its hostname matched the expected project. Older login failures on 2026-10-12 were categorized as redirect-related. This proves upstream Auth fetch failures occurred; it does not prove that the stored anon key is currently wrong.
- Cloudflare's R2 API returns error 10042 (“Please enable R2 through the Cloudflare Dashboard”). The `FILES_BUCKET` binding in the old archive therefore cannot be assumed to exist in the live Worker. Backblaze B2 and Cloudflare R2 are separate storage services.
- Vercel environment values could not be verified via the connected project scope during this audit. No Vercel variables, DNS, production routes, or production traffic were changed.
- A runtime secret synchronization was not applied in this pass. Keep credential values out of GitHub and browser bundles; if re-entering secrets manually, use only the project's intended publishable/legacy anon key for `SUPABASE_ANON_KEY`, never a service-role/secret key.

## Follow-up implementation pass — 2026-10-14

Commits on `main`:
- `b73f623c` — authenticated AI message execution function (caller JWT, explicit owner filters, bounded message size, no provider-body leakage).
- `36291c25` — route `POST /api/v1/ai/conversations/{id}/messages` into the provider pipeline instead of returning the hard-coded 501.
- `b1621f16`, `f4d786ec`, `f83e99de`, `9976fc90` — private Upstash Blob adapter dependency and a staged trainer-media path: prefer a present private Blob object, preserve Backblaze B2 fallback, and permit a published MBH card's canonical `source_key` while `source_file_id` backfill is pending.
- `82b4b381`, `8a9242cc`, `f9644d4a`, `f9822e33` — optional user-scoped Upstash Redis cache for sanitized trainer-card metadata (15-second TTL), never image bytes or answer keys; shadow Worker config declares the Redis endpoint and AI model defaults.
- `4609e2f3`, `aba8407d`, `328745c1`, `943993a6` — configured-provider fallback, regex cleanup, Gemini direct API adapter, GigaChat OAuth/chat adapter, and provider tests.

Important limitations:
- These source changes are committed but **not yet verified by a successful current Worker Build/test run**. GitHub combined status for `f9822e33` reports only Vercel `failure` at the known `build-rate-limit` URL; the Cloudflare shadow deployment list still showed the earlier deployment from 2026-10-13 15:14 UTC. Do not call this a successful deployment.
- - 🔴 **Current shadow Worker secret inventory:** the Cloudflare API lists only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. No `B2_KEY_ID`, `B2_APPLICATION_KEY`, `UPSTASH_BLOB_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, or AI provider secret is configured.
- The Upstash Blob bucket `medbiohim-files` exists and is private but currently contains **0 objects**. The required `UPSTASH_BLOB_TOKEN` is not present in the legacy `.env` file and was not set.
- Upstash Redis `medbiohimcache` exists and is active in `eu-west-1`; its REST token is not set on the Worker. The code is fail-open until `UPSTASH_REDIS_REST_TOKEN` is added as a Worker secret.
- The legacy `.env` contains B2 and several AI provider credentials, but an attempt to transfer secret values from the file to Cloudflare was blocked by the connected security controls. **No B2/AI/Redis secret value was changed or installed.** Add these through the Cloudflare Worker secret manager; never place them in GitHub or frontend variables.
- Current AI execution source supports Groq, Mistral, OpenRouter, direct Gemini generateContent, and GigaChat OAuth + chat completions, with fallback among configured providers. Gemini remains region-gated. This is source-only until secrets are installed and live calls are tested.
- Media migration is not complete: the private Blob bucket is empty and the database still has 206 published cards with `source_file_id IS NULL`. The source-key fallback allows a staged B2/Blob lookup, but it does not create the missing objects.

## Additional live Supabase data evidence (2026-10-14)

Read-only queries against the current Supabase project found:
- 206 published `trainer_feed_cards`: **178 preparation cards + 28 electronogram cards**.
- All 206 have a non-empty `source_key` and a path in `preparation`, but **all 206 have `source_file_id IS NULL`**.
- `public.files` currently contains just 1 row, not a complete media manifest for these cards.
- `trainer-file.js` returns HTTP 503 `MEDIA_NOT_MIGRATED` when the published card has no `source_file_id`. If one is added, the signing helper still requires `B2_KEY_ID`, `B2_APPLICATION_KEY`, and `B2_BUCKET`; no B2 key bindings were present in the active Worker settings.
- `trainer_feed_cards_public` is intentionally group/specialty scoped for histology/MBH. A service-side query without an authenticated MBH membership sees 0 rows through that view; this must not be interpreted as evidence that the underlying 206 cards were deleted.
- Therefore, image repair requires **both** an asset/metadata migration (map each card to a real file row and ensure the object is actually present) and private B2 runtime credentials. Merely changing the Supabase anon key cannot repair these missing object links.

### Auth logs and storage details

- Supabase `auth_logs` aggregation for 2026-10-13 12:00–2026-10-14 12:00 UTC returned 3,438 events; the grouped results contained 3,433 status-200 events, two `bad_jwt` 403 events, one `invalid_credentials` 400 event and two login events without a status. A 14:30–14:45 UTC query returned 2,638 auth-log events, all grouped under status 200. This does not prove each Worker request reached Supabase, but it provides no evidence of a broad Auth 5xx outage during the sampled window.
- `integrations/cloudflare-api/src/b2-download.js` uses the Backblaze B2 native API; it requires `B2_KEY_ID`, `B2_APPLICATION_KEY`, and `B2_BUCKET`. It does not use the archived Cloudflare R2 `FILES_BUCKET` binding or the S3 endpoint string. Don't add dummy key values to `wrangler.toml`.
- The credential update was not applied; no current Cloudflare secret value was read or changed. Existing Supabase URL telemetry confirms HTTPS and expected hostname, while observed failure category was timeout, so replacing the anon key alone is not an evidenced fix.

## Shadow secrets configured from the uploaded legacy `.env` (2026-10-14)

The legacy file's Supabase URL was checked to match project ref `gnobvyjywtqbdfeejxmf`. The following names were saved as **Cloudflare Worker secrets on `medbiohim-api-shadow`**, without committing secret values to GitHub:

- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (anon/public role only; the service-role/secret DB keys were deliberately not copied).
- Backblaze B2: `B2_KEY_ID`, `B2_APPLICATION_KEY`; `B2_BUCKET=medbiohim-files` is a non-secret setting.
- AI: `GROQ_API_KEY`, `GEMINI_API_KEY`, `GIGACHAT_CREDENTIALS`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`. Default provider in the Worker source is Groq.
- Cloudflare API confirmed the named secret bindings were present after the update. This confirms secret storage/configuration only; a live authenticated AI generation and a real object download have **not** yet passed end-to-end smoke tests. Do not claim all provider credentials are valid until those tests succeed.
- The uploaded `.env` is treated as a legacy/test configuration. Rotate all provider and storage credentials before public production, and remove old copies from any public/accessible archive. No service-role key, database password, Firebase key or admin bootstrap secret was copied to the Worker.

## Upstash status

- Existing private Blob bucket `medbiohim-files` is empty. The Worker source has a private Blob adapter and `@upstash/blob` dependency, but `UPSTASH_BLOB_TOKEN` is not configured because the connected Blob tool does not expose the bucket token. Therefore image bytes have **not** been migrated to Upstash Blob.
- Existing Upstash Redis database `medbiohimcache` is active in `eu-west-1`; its 21 existing keys are under `mbhdeploy:v1:*` and appear to be deployment-source/cache artifacts. They were left untouched.
- Redis must not store image bytes. Intended split: Supabase stores metadata, RLS, relationships and study data; Upstash Blob (or existing private B2) stores image/document/video bytes; Redis is for bounded metadata/cache/counters only. Redis REST-token setup was blocked by the security system in this pass, so Redis is **not yet wired into runtime code**.
- Cloudflare's active deployment list still showed the prior 100% shadow deployment created 2026-10-13 15:46 UTC. New secret bindings are saved at script settings, but deployment/runtime consumption has not yet been proven with live calls.

## Next corrective gates

1. Run a controlled live Supabase Auth connectivity probe from the deployed shadow Worker that reports only timing/status/reason category, never tokens, headers, raw URLs, or bodies; correlate it with Supabase Auth logs.
2. Verify the effective Vercel production deployment and API-mode environment separately from GitHub `main`. Do not assume the currently deployed production artifact matches latest source.
3. Repair trainer-image transport/object lookup first, because it accounts for 236 logged 503s. Inspect safe error codes, caller auth, DB media keys and physical file existence; do not rewrite keys/paths without inventory evidence.
4. Port or restore the three 501 route contracts (`histology/source-materials`, `trainings`, `settings/account`) only after comparing the PHP contract and current UI caller.
5. Enable/configure Cloudflare R2 only if that storage is intentionally selected. Otherwise wire the existing private Backblaze B2 configuration with server-only secrets and a verified signed-download path.
6. Repeat the browser smoke test and update this report only when live requests return verified expected responses.


## Follow-up verification — 2026-10-14

### Worker build repaired

- Fixed the Redis REST cache test to inspect the plain-object `fetch` headers correctly and moved assertions outside the fail-open cache wrapper, so a test assertion cannot be mistaken for an upstream Redis outage.
- Main commit: `0b276721a20d80d623f414421dd83e5ea25dc4d8` (`test: read Redis auth from fetch init headers`).
- Cloudflare Build command completed successfully: **265 tests passed, 0 failed**; Wrangler dry-run succeeded; the Worker deploy command also succeeded.
- Shadow Worker `medbiohim-api-shadow` is deployed at 100% on version `1354ec51-762a-4434-b557-26e33af9d602`. This is still the isolated Shadow Worker, not a production API cutover.
- The user-uploaded old Worker archive independently passes **58 tests, 0 failed**. It remains a comparison/reference archive, not a replacement for newer `main`.

### Current storage and secret inventory (names/status only)

- Supabase project `gnobvyjywtqbdfeejxmf` is active in `eu-west-1`. Its Storage bucket `histology` is public with a 100 MiB per-file limit; audit its policies and object inventory before reusing it for any content that should be private.
- Upstash Redis `medbiohimcache` is active in `eu-west-1`; existing keys were not changed. The Worker contains a short-lived metadata-only cache; it explicitly excludes file bytes, raw tokens, and answer keys.
- Private Upstash Blob bucket `medbiohim-files` exists but is currently empty. Do not claim that histology images were copied there.
- Cloudflare Shadow has server-side AI secret bindings for `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, and `GIGACHAT_CREDENTIALS`, plus B2 and Supabase credentials. This confirms the binding names exist, not that every provider's live API key is valid or that a paid/external inference succeeds.
- Shadow Worker is missing `UPSTASH_REDIS_REST_TOKEN` and `UPSTASH_BLOB_TOKEN`. A secure credential transfer through the connector was blocked, so these must be added directly in Cloudflare Dashboard → Workers & Pages → `medbiohim-api-shadow` → Settings → Variables and Secrets. Do not commit them or place them in `NEXT_PUBLIC_*` variables.

### Compatibility gaps still open

The latest frontend's settings client calls `GET /api/v1/settings/account`, but the current Worker `src/index.js` does not register that route. The uploaded browser log also contains 501 responses for `GET /api/v1/trainings` and `GET /api/v1/histology/source-materials?folder=Учебники`; neither route is implemented in the current Worker. They must be migrated from the legacy backend contract and tested before any production routing change.

The dominant media failure remains `GET /api/v1/trainers/feed/{id}/image` (236 HTTP 503 responses in the uploaded log). The Worker has a staged private Blob → Backblaze B2 fallback, but neither remote object existence nor an authenticated production-like image read has yet been verified. Fixing build and deployment alone does not close the media incident.

### Next execution order

1. Add the missing legacy-compatible account-settings route and tests; then port the other legacy endpoints with their original response shape and authorization rules.
2. Add Redis and private Blob secrets in Shadow; verify Redis GET/SET with a harmless test key and never cache media bytes.
3. Verify a real published MBH card's image object exists in B2 or Blob, then test signed URL issuance with an authenticated user who has MBH membership.
4. Keep PHP/SpaceWeb as production until those checks and frontend API-parity smoke tests pass. No production domain, Vercel environment, DNS, or Supabase schema was changed during this pass.


## Latest verification — 2026-10-14, after route restoration

- Current passing Worker build: commit `bd787c12cd324c66dfcf5260b5753e74b8b60f0b`; build `02fbe186-11b9-4670-8c32-bcc81f025197`; **276 passed, 0 failed**; deployed version `f27f713e-e1cc-44ad-95b3-266f64a7885c`.
- Public `https://medbiohim.vercel.app/api/v1/health` returned `mode: shadow`, proving the live Vercel API proxy currently forwards to the Shadow Worker. Unauthenticated calls to `/api/v1/settings/account`, `/api/v1/trainings`, and `/api/v1/histology/source-materials?folder=Учебники` returned 401 instead of the prior 501. This verifies route recognition/authentication only, not authenticated account reads, training data or textbook delivery.
- Added the missing account-settings routes, a caller-scoped GET training list, and private B2 textbook listing/download routes, all in `main`. Added route-level tests. The training POST/detail/answer/cancel/complete routes are not yet fully ported; treat training write flows as still incomplete.
- Applied the additive Supabase migration `20261013171940_create_user_preferences`. RLS is enabled and only owner policies were confirmed. Repo migration filename was aligned with the applied version.
- The first PDF download test exposed a Unicode HTTP-header failure; the response now uses ASCII `filename` plus RFC 5987 `filename*` and the full suite is green. This is mock-backed test evidence; no real private PDF object has been downloaded yet.
- Current storage inventory shows the Supabase `histology` storage bucket and private Upstash Blob bucket are empty. `public.files` contains a single deleted stub; all 206 published histology cards lack `source_file_id`. The 178 preparation cards use hash keys such as `histology-photo-…` while their `preparation.imagePath` contains original JPEG filenames; the 27 normal electronogram keys use `electronograms/images/*.png`. A deterministic upload + object-key map remains required to close the historical 236 image 503s.
- Redis/Blob runtime credentials are still missing from Shadow: `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_BLOB_TOKEN`. The private Blob bucket remains empty; Redis remains reserved for short-lived sanitized metadata, not media bytes.
- Server-side secret bindings exist for Groq, Gemini, GigaChat, Mistral and OpenRouter, but no authenticated live generation was possible in this pass. Do not equate the existence of binding names with working provider credentials.
- Current Supabase security advisor results: `trainer_feed_cards_public` SECURITY DEFINER view (ERROR), four authenticated SECURITY DEFINER RPCs (WARN), and leaked-password protection disabled (WARN). The view definition explicitly strips answer-bearing keys and checks MBH membership; remediate only after reviewing underlying table privileges and RLS to avoid breaking the sanitized contract.
- Cloudflare R2 remains disabled in the account. Vercel runtime-log connector access returned 403; no fresh signed-in browser session could be tested. No new Git branch was created.

