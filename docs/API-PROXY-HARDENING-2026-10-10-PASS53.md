# API proxy hardening — Pass 53

Date: 2026-10-10  
Branch: `main`  
Scope: Next.js API proxy and pre-deploy source audit.

## Changes made

1. **PHP-first trainer API behavior restored.** Removed the early trainer compatibility fallback that ran before the PHP upstream request. The fallback is now considered only after the PHP upstream responds with HTTP 404 for a trainer feed route.
2. **Private image caching disabled.** Trainer image proxy responses now use `Cache-Control: private, no-store` instead of a one-day private browser cache.
3. **Upstream error details hidden.** A 502 response now returns the generic message `Backend is temporarily unavailable`, rather than copying the raw upstream exception message into the client response.
4. **Regression checks added.** `scripts/predeploy-audit.mjs` now checks the fallback ordering, private-media cache header, and generic 502 message.

## Commits

- Implementation: [`ec4aad139413292c3beb6992e58bdfb6ef7ae17b`](https://github.com/MISTACEN/medbiohim/commit/ec4aad139413292c3beb6992e58bdfb6ef7ae17b)
- Audit assertions: [`6aeb401434ab8ba10dad778bc48c585a5fe4347e`](https://github.com/MISTACEN/medbiohim/commit/6aeb401434ab8ba10dad778bc48c585a5fe4347e)

## Verification

- Source re-read from GitHub after commits: PASS for all three implementation conditions and all three audit assertion strings.
- GitHub Actions: BLOCKED before steps. Runs for the implementation and audit commits completed with `runner_id=0` and `steps=[]`. This is runner allocation/dispatch failure; it is not a test result.
- Production/Vercel/SpaceWeb runtime: NOT VERIFIED in this pass.
- Supabase: no writes made.

## Remaining work

1. Restore GitHub Actions runner execution and obtain actual frontend/backend job logs.
2. Run TypeScript, Next.js production build, full PHP lint, regression tests and pre-deploy audit on the exact `main` commit.
3. Deploy through the approved pipeline and verify PHP-first fallback, authenticated media responses and generic upstream failure behavior in the target environment.
4. Continue the roadmap in order; do not mark this pass production-complete until runtime evidence is recorded.
