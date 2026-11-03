# MEDBIOHIM integration checkpoint — 2026-10-14

This is a fresh, read-only verification checkpoint for the Supabase + Cloudflare Worker + Upstash integration. It supplements earlier audit notes; it does not authorize a production cutover.

## Verified live state

- Vercel project `medbiohim` is deploying from `MISTACEN/medbiohim` `main`. Latest observed Production deployment was READY for commit `3eb40687429537b06bf9ca1ce7d0e29ee4a26210` (`fix: persist account preference update timestamp`).
- `https://medbiohim.vercel.app/api/v1/health` returns HTTP 200 with `service=medbiohim-cloudflare-api`, `mode=shadow`, and `productionTrafficEnabled=false`. This proves the health endpoint responds, not that every frontend API route is migrated or user-accepted.
- Unauthenticated `GET /api/v1/ai/providers` and `GET /api/v1/trainers/feed` return HTTP 401 `UNAUTHORIZED`, which is the expected authentication guard. A valid user session was not available for end-to-end AI or trainer tests.
- Supabase project `gnobvyjywtqbdfeejxmf` is `ACTIVE_HEALTHY` in `eu-west-1`.
- Live SQL count: 206 published rows in `public.trainer_feed_cards`; all 206 have `source_file_id IS NULL`. `public.files` contains only one row.
- Upstash Redis `medbiohimcache` is active in `eu-west-1`. Keep Redis for short-lived, user-scoped metadata/cache and rate-limit counters; do not put image/video bytes, answer keys, bearer tokens, or personal message content into it.
- Upstash Blob bucket `medbiohim-files` exists, is private, and currently contains **zero objects**.
- Cloudflare Worker `medbiohim-api-shadow` has secret bindings named `B2_APPLICATION_KEY`, `B2_KEY_ID`, `GEMINI_API_KEY`, `GIGACHAT_CREDENTIALS`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `SUPABASE_ANON_KEY`, and `SUPABASE_URL`. This verifies binding names only; secret values were not read and provider credentials were not validated.
- The archived candidate `medbiohim-cloudflare-api-upstash-reviewed.zip` was tested in isolation: 61 tests passed, 0 failed. It is an older candidate and must not replace current `main` wholesale. Wrangler dry-run did not finish within the available execution window, so no build success is claimed for that archive.

## Work that remains blocked

1. **Redis secret binding:** `UPSTASH_REDIS_REST_TOKEN` is not present on the Worker. An automated credential transfer to Cloudflare was rejected by security controls; no token was installed or exposed. Add it directly in Cloudflare Dashboard → Workers & Pages → `medbiohim-api-shadow` → Settings → Variables and Secrets. Keep `UPSTASH_REDIS_REST_URL=https://rare-oyster-230342.upstash.io` as a non-secret setting.
2. **Blob secret binding:** `UPSTASH_BLOB_TOKEN` is not present. Configure it through the same Worker secret manager. The Blob bucket remains empty until real files are uploaded and verified.
3. **Media migration:** do not mark the 206 trainer images fixed until original image binaries are inventoried, copied to private Blob or an already configured private B2 store, checksums/counts are verified, and the database-to-object-key mapping is tested. Supabase remains the source of metadata and RLS authorization; Blob/B2 stores binary objects. Redis is not a media store.
4. **AI verification:** provider secret binding names exist, and the API guards unauthenticated requests. A valid signed-in test session is still needed to verify a real generation, provider fallback, rate limits, persistence, and error handling. Never put AI secrets in frontend or `NEXT_PUBLIC_*` variables.
5. **Security review:** Supabase security advisor still flags `public.trainer_feed_cards_public` as a SECURITY DEFINER view, four authenticated SECURITY DEFINER RPCs, and disabled leaked-password protection. Review function/view bodies and intended contracts before changing grants; do not blindly revoke RPCs used by tests/trainers.
6. **Frontend compatibility:** continue comparing Worker responses against current `src/lib/api.ts` and the legacy PHP API contracts. Do not route back to the current SpaceWeb HTTP-only origin as a fallback and do not switch production traffic until route parity, real-user RLS, media reads, and AI generation are accepted.

## Storage split to preserve

- **Supabase:** relational records, metadata, ownership, permissions/RLS, and object-key references.
- **Upstash Blob (private):** newly migrated image/video/document bytes where configured and verified.
- **Backblaze B2 (private):** existing binary store/fallback only where credentials and object keys are confirmed.
- **Upstash Redis:** ephemeral metadata cache, rate-limit counters, short TTL; never the canonical database or file store.
- **Cloudflare Worker:** authenticated API boundary and provider orchestration.
- **Vercel/Next.js:** preserve the latest UI and API-client contracts; avoid visual redesign during backend migration.

No DNS, production routing, Vercel environment, Supabase schema, user roles, or existing Redis keys were changed during this checkpoint.
