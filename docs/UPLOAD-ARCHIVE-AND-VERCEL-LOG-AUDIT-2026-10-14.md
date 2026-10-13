# MEDBIOHIM — uploaded backend archive and Vercel console log audit

Date: 2026-10-14 (UTC)
Repository: `MISTACEN/medbiohim`
Environment examined: production browser console export + Cloudflare shadow telemetry. This is an evidence report, not production acceptance.

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

## Additional live Supabase data evidence (2026-10-14)

Read-only queries against the current Supabase project found:
- 206 published `trainer_feed_cards`: **178 preparation cards + 28 electronogram cards**.
- All 206 have a non-empty `source_key` and a path in `preparation`, but **all 206 have `source_file_id IS NULL`**.
- `public.files` currently contains just 1 row, not a complete media manifest for these cards.
- `trainer-file.js` returns HTTP 503 `MEDIA_NOT_MIGRATED` when the published card has no `source_file_id`. If one is added, the signing helper still requires `B2_KEY_ID`, `B2_APPLICATION_KEY`, and `B2_BUCKET`; no B2 key bindings were present in the active Worker settings.
- `trainer_feed_cards_public` is intentionally group/specialty scoped for histology/MBH. A service-side query without an authenticated MBH membership sees 0 rows through that view; this must not be interpreted as evidence that the underlying 206 cards were deleted.
- Therefore, image repair requires **both** an asset/metadata migration (map each card to a real file row and ensure the object is actually present) and private B2 runtime credentials. Merely changing the Supabase anon key cannot repair these missing object links.

## Next corrective gates

1. Run a controlled live Supabase Auth connectivity probe from the deployed shadow Worker that reports only timing/status/reason category, never tokens, headers, raw URLs, or bodies; correlate it with Supabase Auth logs.
2. Verify the effective Vercel production deployment and API-mode environment separately from GitHub `main`. Do not assume the currently deployed production artifact matches latest source.
3. Repair trainer-image transport/object lookup first, because it accounts for 236 logged 503s. Inspect safe error codes, caller auth, DB media keys and physical file existence; do not rewrite keys/paths without inventory evidence.
4. Port or restore the three 501 route contracts (`histology/source-materials`, `trainings`, `settings/account`) only after comparing the PHP contract and current UI caller.
5. Enable/configure Cloudflare R2 only if that storage is intentionally selected. Otherwise wire the existing private Backblaze B2 configuration with server-only secrets and a verified signed-download path.
6. Repeat the browser smoke test and update this report only when live requests return verified expected responses.
