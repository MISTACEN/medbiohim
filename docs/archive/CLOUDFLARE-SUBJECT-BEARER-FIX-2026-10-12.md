# Cloudflare API bearer parsing fix — 2026-10-12

## Finding

A source inspection of `integrations/cloudflare-api/src/supabase-auth.js` found two malformed regular expressions:

- `getSupabaseSubjectDetail()` (previously around line 695)
- `listSupabaseSubjects()` (previously around line 771)

Those expressions contained literal double backslashes in the regular expression (`/^Bearer\\\\s+(\\\\S+)$/i` in source representation) rather than the intended whitespace/token classes (`/^Bearer\\s+(\\S+)$/i`). As a result, a valid `Authorization: Bearer <token>` header would not yield the token for the subsequent PostgREST requests in those two helpers.

## Fix

Commit: `832cc8b11f2c186642992c17fca454c7bae96b97`

Both expressions now match the same Bearer format used by the authentication helper and the other read helpers. This also restores the intended caller-JWT propagation for the subject list/detail reads.

## Existing regression coverage

The existing `integrations/cloudflare-api/test/supabase-auth.test.js` already checks that:

- the subjects list sends `Bearer valid-user-token` to all Supabase REST calls;
- subject detail sends the caller's JWT to its subject/module REST calls.

Those tests should detect this defect if it is reintroduced. They have **not** been executed successfully in GitHub Actions in this session; CI remains blocked by the runner issue documented in `GITHUB-ACTIONS-RUNNER-DIAGNOSTICS-2026-10-12.md`.

## Deployment status

This is a source fix on `main`. It is not proof the updated bundle has been deployed to Cloudflare or that live authenticated requests now work. The existing shadow Worker remains separate from production, and SpaceWeb remains the active PHP backend. Before any frontend cutover, rebuild/upload the complete Worker bundle (including `supabase-auth.js`), run the Node test suite, and perform authenticated smoke tests with a least-privilege test account.


## Shadow Worker upload after the fix

- Uploaded the current `src/index.js` and corrected `src/supabase-auth.js` to Cloudflare Worker `medbiohim-api-shadow` using the content-only endpoint.
- Cloudflare accepted the upload: version `24482903-49ad-423a-8688-93a8702ea267`; active deployment `c056a5cf-1214-4967-ae1f-45cea21a792c`; deployment timestamp `2026-10-12T04:51:16.659118Z`.
- Re-read Worker settings after upload. The `APP_ENV=shadow`, `MEDBIOHIM_APP_ORIGIN`, `SUPABASE_ANON_KEY`, and `SUPABASE_URL` bindings remain present. No service-role key was introduced and no frontend URL/DNS/webhook changed.
- This confirms Cloudflare accepted and activated the updated bundle, **not** that the routes pass authenticated runtime smoke tests. The next gate remains test execution and real-user JWT/RLS checks; SpaceWeb remains production.
