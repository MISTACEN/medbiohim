# Cloudflare API route parity audit — 2026-10-13

## Verification performed
- Source files and tests were fetched from `main` into an isolated workspace.
- `npm test`: **130 passed, 0 failed** on the current Worker source/test set.
- `npm run build`: Wrangler 4.149.0 `deploy --dry-run` passed; bundle 207.60 KiB / 31.07 KiB gzip. This validates compilation and Wrangler configuration, not deployment.
- Wrangler recognized native bindings `AUTH_LOGIN_LIMITER` (5/60s) and `AUTH_REGISTER_LIMITER` (3/60s).
- The existing isolated native-binding probe previously recorded HTTP 429 responses. That verifies the Cloudflare primitive can deny requests; it does not prove a strict global cap or make auth route parity ready.

## Confirmed route gaps from current Worker router
| API contract | Current Worker coverage | Required next step |
|---|---|---|
| `GET /api/v1/groups` | Read-only list | Compare frontend needs; migrate group detail only if required and membership-scoped. Group/member management remains on legacy PHP. |
| `GET /api/v1/homeworks` | Read-only list | Homework creation, edits and attachment flows are not migrated. Do not retry ambiguous writes across backends. |
| `POST /api/v1/homeworks/{id}/progress` | Narrow student-owned progress write | Keep authorization checks for active membership and caller identity; validate live RLS before production. |
| `/api/v1/files/*` | No Worker file handlers found in `src/index.js` | Upload/download depends on legacy storage integration; preserve PHP routing until object ownership, metadata and signed download behavior are implemented and tested. |
| `POST /api/v1/auth/register` | Present but deliberately gated | Keep `AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED=false` until registration creates the expected profile/default student role safely and valid-session/RLS acceptance passes. |
| `/api/v1/tests/attempts/*` writes | Deliberately gated | Keep start/save/finish blocked until private answer snapshots and guarded scoring are implemented. |

## Cutover gates still open
1. Test with a controlled valid Supabase user session; do not print or persist bearer tokens.
2. Verify dashboard, schedule and subject reads against live RLS and expected PHP response contracts.
3. Complete route-by-route frontend call-site inventory, especially files and homework create/edit/attachments.
4. Obtain a successful, actual GitHub Actions run; local tests are not Actions evidence.
5. Resolve Vercel project/team scope and test proxy settings in Preview before any Production environment change.
6. Keep production on legacy mode until all the above and rollback checks pass.

No production variables, database policies, domains, DNS, or Telegram webhook were changed during this pass.
