# Production API gateway — 2026-10-15

## What changed

- Created Cloudflare Worker `medbiohim-api` in account `a7556b4deb0cc2bad2c6d6b1a7381601`.
- Enabled its `workers.dev` endpoint: `https://medbiohim-api.ryazansevegor.workers.dev`.
- The Worker uses a Cloudflare service binding to `medbiohim-api-shadow`; it forwards the request and response without changing application payloads and adds `x-medbiohim-api-gateway: production`.
- Added reproducible source/configuration at `integrations/cloudflare-api/production-gateway.js` and `integrations/cloudflare-api/wrangler.production.toml`.
- No Cloudflare R2 binding was introduced. No secrets were copied into source or logs.

## Live smoke checks

Executed against the deployed public workers.dev endpoint on 2026-10-15:

| Request | Observed result | Meaning |
|---|---:|---|
| `GET /api/v1/health` | 200 | Gateway reaches the Shadow application |
| `GET /api/v1/schedule` without a token | 401 | Upstream authentication requirement is preserved |
| `GET /api/v1/does-not-exist` | 501 | Upstream migration guard is preserved |
| `OPTIONS /api/v1/schedule` with the Vercel origin | 204 | CORS preflight is forwarded |
| All above | `x-medbiohim-api-gateway: production` | Response passed through the new Worker |

The Shadow endpoint independently returned 200 for `/api/v1/health` at the same time.

Additional route smoke checks without a Bearer token: `/api/v1/planner`, `/api/v1/subjects`, `/api/v1/tests`, `/api/v1/materials`, `/api/v1/auth/me`, `/api/v1/sessions`, `/api/v1/trainers/feed`, and `/api/v1/admin/schedule` all returned 401 as expected. `GET /api/v1/homework` returned 501 `ROUTE_NOT_MIGRATED`, explicitly demonstrating that the existing Shadow API is still a partial migration and is not yet full feature parity with the legacy API.

## Important limitation

This makes the new production hostname behaviorally equivalent to the current Shadow API for requests that reach the Shadow application, but it is **not an independent production application deployment**. The health payload still says `mode: shadow` and `productionTrafficEnabled: false`; those values were deliberately not rewritten because the underlying application remains the Shadow deployment. The current Worker source uses many secret bindings, and Cloudflare does not reveal their values for copying. A fully independent `medbiohim-api` needs the current GitHub main bundle built and deployed with the required secret bindings provisioned securely, followed by authenticated student/admin acceptance.

## Traffic / rollback

- No Vercel API base URL, DNS, custom domain, SpaceWeb routing, Telegram webhook, Supabase schema, or existing Shadow deployment was changed.
- The site has **not** been switched to this new hostname.
- Rollback: disable or delete the `medbiohim-api` gateway Worker; the existing Shadow Worker and current frontend route are untouched.
