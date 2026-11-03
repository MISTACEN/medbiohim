# Hosting and HTTPS decision record — MEDBIOHIM (2026-10-11)

## User decision

**Do not migrate anything now.** Keep the current architecture and fix/test what can be fixed in source. For any future hosting change, SpaceWeb must be the **last-resort option for the PHP API**, not the preferred permanent dependency. It may remain a file/image host if the API is eventually moved.

## Future decision order

1. **A — Cloudflare HTTPS in front of the current API**, only if technically secure. Requires a domain/hostname under our control that can be routed through Cloudflare, plus a secure origin connection. Prefer Cloudflare Full (strict) when the origin presents a valid, matching certificate. Do not use Flexible mode for authenticated/personal API traffic because Cloudflare-to-origin traffic is plain HTTP.
2. **B — Another free PHP host with valid HTTPS**, if A cannot be made secure at no cost.
3. **C — Separate the API from file storage**: run the PHP API on a suitable HTTPS host while keeping SpaceWeb only for existing files/images where practical. This is a fallback, not a current migration.
4. **D — Keep SpaceWeb as the permanent PHP API origin despite the HTTPS limitation**: last resort only. Until TLS is fixed, do not send authentication credentials, one-time link tokens, or other sensitive API requests over HTTP.

This is a planning order, not permission to change hosting. The existing Vercel + PHP API + Supabase architecture remains in place for now.

## Verified diagnostics

- http://ryazansev3.temp.swtest.ru/public/api/v1/health returned HTTP 200 OK; PHP API reported healthy, PHP 8.4.21, connected Supabase database, required extensions present, and B2 configuration present.
- https://ryazansev3.temp.swtest.ru/public/api/v1/health failed normal certificate verification on Windows with SEC_E_UNTRUSTED_ROOT.
- With certificate verification bypassed for diagnostics only, HTTPS returned 302 and redirected to the HTTP URL. This is not a secure API path.
- The connected Cloudflare account currently has **zero DNS zones** and has the two Workers medbiohim-telegram and medbiohim-telegram-test. The existing workers.dev hostname does not by itself make the SpaceWeb origin secure.
- Cloudflare's normal Free/Pro full-zone setup requires a registered domain and changing its authoritative nameservers. A temporary host name under temp.swtest.ru is not a domain we can simply add as our own zone.
- Do not configure Worker-to-PHP relays with an http:// URL, do not disable TLS verification in code, and do not assume Cloudflare proxying alone secures a plaintext origin.

## Current Telegram integration status

- Worker webhook and health endpoint had previously been confirmed operational.
- Account-linking code and migration exist in the GitHub source, but the migration is not in the live Supabase migration list and the two Telegram account tables are not present in the checked schema. The feature is not live end-to-end.
- No Supabase Edge Functions are currently deployed. Using them as a future HTTPS option is only a proposal; no migration to them has been made.
- Telegram-only website login is not implemented. Existing Google/email login plus explicit Telegram account linking is the current intended flow.

## GitHub Actions diagnosis (2026-10-11)

The newest observed run for **Telegram Worker checks** was https://github.com/MISTACEN/medbiohim/actions/runs/38143942074. The GitHub job API reported runner_id: 0, an empty runner_name, and steps: []; it failed about three seconds after starting. Other workflows on the same commit also failed in the same way. This indicates the job did not reach test steps and is consistent with runner assignment/provisioning failure, not a demonstrated test assertion failure. Treat tests as **not executed**, not as failed code tests. Do not trigger repeated commits hoping to fix runner provisioning.

## Supabase audit snapshot (2026-10-11)

- Security advisors: one ERROR for public.trainer_feed_cards_public being a SECURITY DEFINER view; one warning for authenticated execution of SECURITY DEFINER function public.submit_trainer_feed_answer(...); one warning because leaked-password protection is disabled.
- Performance advisors: 44 foreign keys without covering indexes; 67 indexes reported unused. Review query patterns and production usage before changing indexes; do not drop unused indexes blindly.
- These are audit findings, not evidence that the application has already been repaired. Prioritize the SECURITY DEFINER view/function review and Auth password protection settings, with compatibility and policy review before changes.

## Next safe steps

1. Keep hosting unchanged and record this decision in the roadmap.
2. Restore GitHub Actions runner execution; verify the runner is actually assigned and steps start before interpreting any test results.
3. Review/fix the Supabase security findings in small, reversible changes.
4. Finish the account-link migration review and backup/checklist before applying it to production.
5. Only after a trusted HTTPS origin exists, configure the Worker relay and test linking end-to-end.
6. Revisit A/B/C/D only if a free, secure HTTPS route cannot be provided by the current host.


## Update — user approved Cloudflare migration preparation (2026-10-12)

The user has now chosen this execution strategy:

- Keep SpaceWeb as the active PHP API host for now.
- Prepare a gradual migration of API functionality to Cloudflare Workers.
- Do not migrate production traffic, change the frontend API base URL, alter DNS, rotate webhooks, or deploy a replacement API as part of preparation.
- Do not proxy sensitive traffic from a Worker to the current SpaceWeb URL: the HTTPS certificate is untrusted and HTTPS redirects to HTTP.
- Keep Supabase as the existing data/auth layer and B2/SpaceWeb media storage unchanged until route-by-route dependencies are mapped.

Source preparation now exists under \`integrations/cloudflare-api/\`. It is a shadow scaffold, not a live replacement. Its health endpoint declares \`productionTrafficEnabled: false\`; unimplemented API routes return \`501 ROUTE_NOT_MIGRATED\` rather than forwarding to the PHP origin. Tests are authored but remain unverified until a runner actually executes them.

Next sequence:
1. Restore GitHub Actions runner allocation and run the scaffold tests.
2. Inventory all PHP routes, methods, auth requirements, role/ownership rules, DB/RLS use, media behavior, and error/status contracts.
3. Add fixture-based contract tests for the current PHP behavior.
4. Migrate public read-only endpoints first, then authenticated reads, then writes and webhook/media routes.
5. Validate JWTs and enforce ownership/roles server-side; never trust client-supplied role/user IDs or put Supabase service keys in frontend code.
6. Deploy a staging Worker only after CI is running; keep the frontend pointed at SpaceWeb until end-to-end parity and rollback are proven.
7. Switch traffic gradually only after the user approves the cutover and all release gates are green.
