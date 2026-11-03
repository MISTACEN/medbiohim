# MEDBIOHIM — Upstash, Blob, AI and RLS integration pass
Date: 2026-10-14

## Verified during this pass

- Upstash Redis database `medbiohimcache` is active in `eu-west-1`.
- Redis live smoke test passed using a short-lived namespaced key: SET returned OK, GET returned the expected value, DEL removed one key. No persistent application data was changed.
- Existing Upstash Blob bucket `medbiohim-files` is private. The bucket currently contains zero objects.
- Cloudflare Worker `medbiohim-api-shadow` remains the isolated migration target. Production routing and DNS were not changed.
- Supabase RLS is enabled on `files`, `file_variants`, `homework_submissions`, `question_reports`, and `user_roles`.
- Reviewed policies: files are readable to authenticated owners, public-visible files, or active group members; file variants inherit the parent-file access rule; question reports can be inserted only for the caller and read by reporter/admin; user_roles has a read-own policy.
- Added OpenAI as a supported server-side AI chat provider in `src/ai-chat.js`. It uses the OpenAI-compatible chat-completions request path and reads only the server-side `OPENAI_API_KEY` binding. Default model variable is `OPENAI_MODEL=gpt-4.1-mini`.
- Updated `wrangler.toml` to document `OPENAI_MODEL` and the required `OPENAI_API_KEY` secret. No secret values were committed.

## Remaining blockers (do not treat as done)

- Worker secrets `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_BLOB_TOKEN`, and `OPENAI_API_KEY` still need to be securely provisioned in the Cloudflare Worker. A secret write attempt was blocked by the connected security mechanism; do not work around it by putting values in Git.
- OpenAI API-key setup flow was opened for the connected Platform account, but key creation and Worker binding are not confirmed.
- Blob bucket is empty. No source archive bytes or a checksum manifest were available through the connected tools in this pass; therefore no photo/video/PDF was migrated. Inventory source storage first, then transfer and verify each object by size and SHA-256.
- Redis test verified the database endpoint, not the Worker's access, because the Worker token binding is not configured.
- RLS flags and policy definitions were inspected; no live student JWT was available for cross-user authorization tests. No schema or policy changes were made.
- The OpenAI provider source update and Wrangler config update are committed to main, but the Worker was not redeployed and the Node test suite was not executed here. Do not describe OpenAI as live until deployment, tests, secret binding, and an authenticated smoke test succeed.
- Production frontend, DNS, PHP/SpaceWeb backend and Vercel environment variables remain unchanged.

## Next execution checklist

1. Provision the three secrets through the Cloudflare Dashboard or authenticated Wrangler session, without committing them.
2. Confirm secret names exist on `medbiohim-api-shadow` without reading secret values back.
3. Run `npm test` and Wrangler dry-run from `integrations/cloudflare-api`.
4. Deploy only to the shadow Worker, then verify health, provider status, and one authenticated AI request.
5. Inventory legacy B2/SpaceWeb source files; transfer to the private Blob bucket with content type, size and SHA-256 manifest.
6. Add or update Supabase `files` metadata only after objects are verified; preserve RLS and never make private course media public.
7. Test RLS with two separate student accounts and a group outsider before considering production cutover.


## Follow-up verification — archive received 2026-10-14

- The user supplied `content(1).zip`. ZIP integrity check passed.
- Inventory: 357 entries / 432,658,572 uncompressed bytes; 246 image files, 4 PDFs, 102 Word files (`.docx` + `.doc`), plus metadata/readme files. SHA-256 of the uploaded ZIP: `4cbd44020f675a7232fe086e8e39c9c5d4a15652be810fb37758066180432b73`.
- A manifest with every archive path, object key, size, MIME type, SHA-256, and duplicate-content aliases was prepared outside the repository for download as `medbiohim-histology-blob-manifest.json`. It contains 357 file entries, 296 unique hashes and 61 entries sharing content with another path.
- Path compatibility: remove only the leading `content/histology/` prefix from archive member names. Existing DB references use keys such as `electronograms/images/apoptoz.png` and legacy `em/` aliases. Keep aliases as separate object keys even when SHA-256 is identical. Do not add synthetic prefixes that change existing `source_key` values.
- Supabase inventory was read without mutations: 206 histology/MBH trainer cards have non-empty `source_key`; 80 materials have non-empty `source_key`. No file metadata rows were inserted because the media objects have not been bulk-migrated yet.
- Private Blob PUT connectivity was verified from an Upstash Box using a temporary 60-byte probe object. The object was listed successfully and then deleted; no probe object is left behind. The bucket should therefore remain empty until the actual migration completes.
- **Bulk upload remains incomplete.** The user attachment is mounted in the local task sandbox, while the authorized Upstash Box is a separate filesystem; the local sandbox cannot resolve/reach the signed R2 upload host. The probe proves a correctly signed upload works from the Box, but the archive bytes are not present in that Box. Do not report any archive media as uploaded.
- The entire `integrations/cloudflare-api` package source (`src/`, `test/`, package config, and Wrangler config) was fetched from current `main` into an isolated Node environment because GitHub runners were not starting. `npm test`: **280 passed, 0 failed**. `npm run build` also completed successfully, including `wrangler@4.149.0 deploy --dry-run`; it reported 651.26 KiB upload size (108.89 KiB gzip) and exited in dry-run mode without deploying. These are local-equivalent tests/build checks, not a live authenticated OpenAI request or a live Worker deployment. The three migration-specific tests and a three-file dry-run fixture verified safe keys, Unicode paths, duplicate-hash accounting, and manifest generation.
- Added `integrations/cloudflare-api/scripts/migrate-histology-blob.mjs`, a resumable utility for the extracted `content/histology/` tree. It hashes each file, preserves relative object keys/aliases, attaches SHA-256 and source-archive metadata, uses multipart uploads for large files, skips matching verified objects, and fails closed on collisions unless `--overwrite` is explicit. Dry-run requires no credentials; live migration requires `UPSTASH_BLOB_TOKEN` from the existing private bucket.
- Latest Vercel production deployment on commit `d19455c74f76d0e936ee3cc87e3b32832c4b3944` was `READY`.
- GitHub Actions runs for the same commit continue to fail before any workflow step starts: jobs have `runner_id=0`, no runner name, and empty step arrays, including after retry. This is a runner/job scheduling failure rather than test output; inspect repository Actions/billing/runner availability from the GitHub UI.
- Still required before declaring this pass complete: bulk transfer the archive from a machine/network that can access the private Upstash Blob endpoint; verify each object size/hash; reconcile metadata/object paths; provision the missing Worker secrets `UPSTASH_BLOB_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, and `OPENAI_API_KEY`; run the full Worker test suite and Wrangler dry-run/deploy; then perform authorized-user media and RLS tests with real student sessions. Production PHP backend, frontend routing and DNS remain unchanged.

- Windows PowerShell runbook after extracting the supplied ZIP to its `content/histology` directory: from `integrations/cloudflare-api`, set `$env:UPSTASH_BLOB_TOKEN` in the current PowerShell session, run `node scripts/migrate-histology-blob.mjs "<extracted-folder>" --dry-run`, inspect the generated manifest, then run the same command without `--dry-run`. Do not commit the token. The utility is resumable and verifies every uploaded object, but the actual 357-file bulk transfer has not yet been completed in this agent environment.
- Added `integrations/cloudflare-api/scripts/migrate-histology-blob.ps1` to extract the supplied ZIP on Windows, run the inventory/dry-run, prompt for the private Blob token without echoing it, run the upload, and clean up the extracted temporary directory. It preserves any token that was already present in the environment. This prepares the upload path for a machine that can reach Upstash; it does not itself mean the archive has been uploaded.
- The 410,788,871-byte ZIP is present in the ChatGPT task filesystem at `/mnt/data/content(1).zip`, but that filesystem is isolated from the authorized Upstash Box. The Box can reach the signed Blob endpoint, while this task filesystem cannot resolve the storage host; no direct file-transfer action exists in the connected Box tools. Consequently the actual bulk upload is blocked here, not by the bucket. Current bucket remains empty after the probe cleanup.

## AI secret inventory follow-up (2026-10-14)

Cloudflare Worker `medbiohim-api-shadow` was inspected through the Cloudflare API without reading or exposing secret values. The Worker already has secret bindings named `GEMINI_API_KEY`, `GIGACHAT_CREDENTIALS`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `SUPABASE_ANON_KEY`, and `SUPABASE_URL`; its non-secret model configuration includes `AI_CHAT_PRIMARY_PROVIDER=groq`, `OPENAI_MODEL=gpt-4.1-mini`, `GROQ_MODEL=llama-3.3-70b-versatile`, `GEMINI_MODEL=gemini-2.0-flash`, `GIGACHAT_MODEL=GigaChat`, `MISTRAL_MODEL=mistral-small-latest`, and `OPENROUTER_MODEL=google/gemini-2.5-flash`. These are configured bindings, not proof that provider credentials are valid or that live inference succeeds.

The Worker does **not** currently expose an `OPENAI_API_KEY` secret binding, nor `UPSTASH_BLOB_TOKEN` / `UPSTASH_REDIS_REST_TOKEN`. The application code already supports `OPENAI_API_KEY` and defaults the model to `gpt-4.1-mini`. An OpenAI Platform key-setup flow was opened for `MEDBIOHIM Cloudflare Worker`; the generated key must be stored directly as a Cloudflare Worker secret and must never be committed to Git or printed in logs.

The newly uploaded legacy PHP archive `public_html-31.zip` is 149,011,784 bytes. The task's local execution service is currently returning an infrastructure error, so the archive's contents could not be extracted or searched in this pass. No values were guessed, copied from unrelated configs, or written into Worker secrets. Next step is to inspect its `.env`/config files locally, classify credentials as test-only, and migrate only required values into the appropriate secret store after validating provider/endpoint compatibility. Keep shadow/test and production credentials separated; rotate any credential that may have been exposed in a public repository.
