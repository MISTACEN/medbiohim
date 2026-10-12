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
