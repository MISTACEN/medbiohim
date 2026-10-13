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
