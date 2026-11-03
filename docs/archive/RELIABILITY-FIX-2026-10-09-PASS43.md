# MEDBIOHIM — API timeout/cache reliability (Pass 43)

Date: 2026-10-09

## Source fix
File: src/lib/api.ts
Commit: 77b0f4a1b44d47e38833cb32b67c7f1ecd3e478b

- API requests now use one AbortController that relays a caller-provided AbortSignal and still enforces the built-in 12-second GET / 20-second mutation timeout. Previously options.signal replaced the timeout signal.
- Successful cached values returned after a network/upstream error now include stale: true so callers can distinguish degraded cached data from fresh data.
- Cache entries are typed as successful responses, matching the fact that only successful GET payloads are persisted.

## Verification boundary
- Source was reread after commit; timeout signal, caller abort relay, and stale marker are present.
- Vercel production alias is now READY at commit 37703f90, which includes this API-client fix. Browser-level timeout behavior is still untested.
- GitHub Actions code-check jobs still fail before checkout with runner_id=0 and steps=[]; no TypeScript/build execution evidence is available.

## Next check
After a new Vercel deployment is available, verify that a slow GET aborts at the timeout, caller abort still cancels promptly, and stale cached content is returned with stale: true only for documented network/upstream failure codes.
