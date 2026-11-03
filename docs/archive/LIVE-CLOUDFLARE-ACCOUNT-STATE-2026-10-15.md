# Live Cloudflare / Upstash account check — 2026-10-15

## Direct account evidence

Read-only Cloudflare API inspection on 2026-10-15 found:

- Account Workers subdomain: `ryazansevegor.workers.dev`.
- Worker scripts currently present: `medbiohim-api-shadow`, `medbiohim-telegram`, and `medbiohim-telegram-test`.
- **No `medbiohim-api` production Worker exists yet** in the account.
- `medbiohim-api-shadow` has a deployed version assigned 100% of that Worker’s own traffic. This is not a production cutover and does not mean the frontend is routed safely to it.
- No custom Worker domains are attached at account level.
- Shadow Worker has native Cloudflare rate-limit bindings: login 5/min and registration 3/min.
- Shadow Worker bindings include Supabase URL/anon key secrets, AI provider secrets, B2 credentials, and `UPSTASH_BLOB_TOKEN`. Secret values were not retrieved or printed.
- Shadow Worker binding list did **not** include `UPSTASH_REDIS_REST_TOKEN`; Redis cache use must be treated as unverified until that secret is configured or code is shown not to require it.
- Upstash account has private Blob bucket `medbiohim-files` and active Redis database `medbiohimcache` in `eu-west-1`. Blob object listing was blocked by the tool safety layer in this check, so object count/content is **not verified**.
- Cloudflare R2 is not needed and must remain absent from the selected deployment config.

## Cutover decision

**Production cutover remains blocked.** Do not create or switch production traffic just to make the dashboard say production. Before the production Worker is created/deployed, complete all of the following:

1. Run tests and Wrangler dry-run on the exact current GitHub `main` source, not the alternate archive.
2. Confirm the production Worker receives the required secrets without copying secret values into source control; verify Upstash Redis token/binding if the code requires it.
3. Verify private Blob objects and the 206 histology trainer-card key mapping, including authenticated file delivery.
4. Run signed-in browser/API acceptance for login/register, dashboard, schedule CRUD, homework, tests/training sessions, SRS, AI, admin authorization, and private media with real student/admin identities.
5. Confirm frontend API base URL and rollback plan. Only then create/deploy `medbiohim-api` and switch production routing deliberately.

## Archive reconciliation

The supplied alternate Cloudflare API archive is older than the current GitHub Worker tree. Its R2 binding and route/module surface must not be copied wholesale. Its one failing test was an obsolete mock shape (`user_roles.role` versus `roles(code)`); that fixture-only repair is documented separately in `docs/CLOUDFLARE-ARCHIVE-VALIDATION-2026-10-15.md`.

## Scope

This check used read-only Cloudflare account inspection and Upstash resource metadata. It did not modify DNS, Vercel production settings, Supabase schema/data, Telegram webhooks, Worker deployments, secrets, or production traffic.
