# Cloudflare shadow deployment reconciliation — 2026-10-12

## Scope

Read-only reconciliation of the current GitHub source and Cloudflare account state, followed by enabling the isolated API Worker's `workers.dev` endpoint for testing. No production frontend/API routing, DNS, Supabase schema/policies, Telegram webhook, or secrets were changed.

## Observed Cloudflare state

- Account: the connected Cloudflare account for MEDBIOHIM.
- API Worker: `medbiohim-api-shadow`.
- Latest deployment reported by Cloudflare API: `c056a5cf-1214-4967-ae1f-45cea21a792c`, version `24482903-49ad-423a-8688-93a8702ea267`, created `2026-10-12T04:51:16Z`.
- Worker bindings list `APP_ENV=shadow`, `MEDBIOHIM_APP_ORIGIN`, and secret bindings for `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Secret values were not read.
- Before this check, the Worker had `workers.dev` disabled and no custom Worker domain attached. Enabled its `workers.dev` subdomain with previews left disabled so isolated smoke tests can be attempted.
- No custom domain, production route, frontend base URL, or Telegram webhook was changed.

## Important source/deployment drift

The current GitHub source at `integrations/cloudflare-api/src/index.js` imports modules and implements routes that do not appear in the source returned by Cloudflare's current script-content endpoint. Examples present in GitHub source include progress, homework progress writes, test-attempt operations, and admin schedule helpers; the Cloudflare script content inspected during this reconciliation had an older import/route set. Therefore, the route inventory's latest-deployment note cannot be treated as proof that every latest GitHub route is deployed.

This must be resolved before adding more API routes or claiming parity. Do not blindly deploy the current tree until all imported modules are enumerated and included, the exact source is tested, and the shadow endpoint is smoke-tested. No service-role key is required or permitted for caller-scoped routes.

## Verification limitation

The Cloudflare API confirms deployment metadata and bindings, but external HTTP smoke tests could not be completed from the available network tools. GitHub Actions remains historically blocked before steps start, so no green CI result is claimed. The Worker is still shadow-only; SpaceWeb PHP remains the active backend.

## Next execution order

1. Enumerate every module imported by the current GitHub `src/index.js` and compare it with Cloudflare's uploaded module bundle.
2. Run `npm test` with Node.js 20+ in `integrations/cloudflare-api/`; add missing route tests for any newly introduced handlers.
3. Perform a Wrangler dry-run/build and ensure every imported module is in the upload bundle.
4. Deploy the exact tested GitHub source to `medbiohim-api-shadow` only, preserving `APP_ENV=shadow` and caller-JWT + anon-key access.
5. Smoke-test public health/metadata endpoints, then authenticated routes with a non-production student account; verify RLS, expected status codes, and response contracts.
6. Update the route inventory with only the verified deployed version. Keep production traffic on SpaceWeb until all required routes and end-to-end flows pass.

## Safety

No production traffic switch, production DNS change, database write/policy change, token rotation, or Telegram webhook switch occurred in this reconciliation.
