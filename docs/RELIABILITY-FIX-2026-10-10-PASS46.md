# Reliability/security fix — API cache scope for malformed tokens (Pass 46)

Date: 2026-10-10  
Scope: `src/lib/api.ts` and pre-deploy audit.

## Finding

The API cache scope was derived from the JWT `sub` claim, but when the token was malformed, opaque, or missing a readable subject, the client used the shared literal scope `auth`. Multiple malformed-token sessions could therefore address the same cache bucket for cacheable GET paths. This was a cache-isolation weakness, not proof of a live cross-user data exposure.

## Change

- `cacheUserScope()` now returns `null` when a token cannot be parsed to a subject.
- `apiCached()` bypasses both memory and sessionStorage caches for that case and lets the API authenticate the request normally.
- `scripts/predeploy-audit.mjs` now checks that this bypass contract remains present.

## Verification / limitations

- Source-level check is committed.
- GitHub Actions still fails before the first step, so the pre-deploy audit has not executed in GitHub.
- No live cross-account leak was demonstrated; the fix removes the ambiguous shared cache bucket defensively.
- The latest observed READY Vercel deployment predates Pass 45/46 source commits; production inclusion must be verified from deployment metadata after a new READY build.

## Acceptance

1. Run TypeScript check and the full pre-deploy audit.
2. In two test accounts, confirm cache keys remain user-scoped and logout/account switching does not reveal previous account content.
3. Confirm malformed/opaque tokens do not return cached content without reaching the API.
