# MEDBIOHIM Cloudflare migration — RLS/security checkpoint

Date: 2026-10-12

## Current architecture verified

- `main` contains the Cloudflare Worker migration scaffold at `integrations/cloudflare-api/`.
- The PHP API on SpaceWeb remains the production backend. The Worker is not deployed, is not bound to a production route, and the frontend API origin has not been switched.
- Cloudflare currently lists `medbiohim-telegram` and `medbiohim-telegram-test`; it does not list `medbiohim-api-shadow`. No Cloudflare D1 databases are configured in the connected account. The current migration therefore continues to use Supabase Postgres as the data store and Cloudflare Workers as the API runtime; no duplicate D1 database is being created.
- Worker data requests use the public Supabase anon key plus the caller's Bearer JWT. No service-role key is added to the Worker.

## RLS observations from the live Supabase project

- RLS is enabled on the inspected tables, including `subjects`, `groups`, `group_memberships`, `homework_submissions`, `trainer_feed_cards`, and `trainer_feed_answers`.
- `subjects_authenticated_read_v2` permits SELECT for every authenticated user (`qual = true`). The PHP `GET /api/v1/subjects` handler adds specialty filtering through `SpecialtyAccess`. The new Worker route mirrors the intent by checking active group membership and group `specialty_slug` before returning specialty-scoped subjects. This policy parity must be verified with test identities before cutover.
- `group_memberships` SELECT is scoped to the current user or users with teacher/moderator/admin roles. Writes are manager-role-gated by the currently observed policies.
- `homework_submissions` has RLS enabled and policies for own submissions plus manager roles; this should be re-tested with student-vs-manager identities as homework migration begins.
- Published trainer cards have anon/authenticated SELECT policies limited to `is_published = true`; trainer answer rows are scoped to `auth.uid()`.

## Supabase security advisor findings (observed 2026-10-12)

1. **ERROR — SECURITY DEFINER view:** `public.trainer_feed_cards_public` is defined with SECURITY DEFINER. Review its definition, underlying grants, exposed columns, and intended anon access. Prefer an invoker-safe view/policy or a narrowly scoped safe projection; do not change it until dependencies and expected public trainer-card behavior are confirmed.
2. **WARNING — SECURITY DEFINER RPC:** `public.submit_trainer_feed_answer(text, text, text, boolean, integer)` is executable by `authenticated`. Review the function body for caller identity, card publication, answer/option validation, time bounds, and write ownership. Revoke broad EXECUTE or replace with a least-privilege invoker-safe design only after callers and grants are confirmed.
3. **WARNING — leaked-password protection disabled:** enable Supabase Auth's compromised-password protection in project Auth settings when available and verify the frontend error handling.

## CI/deployment gate

GitHub Actions runs are being created for pushes to `main`, but the latest observed run fails within seconds. The GitHub Actions job metadata reports no steps and no downloadable job logs, so this is not yet evidence that the Node test suite ran. Do not interpret these runs as passing or failing code tests. Diagnose runner/workflow startup first; then require a successful `npm test` in `integrations/cloudflare-api` and the other optional-integration checks.

## Next safe order

1. Restore a real GitHub Actions execution and run all existing regression tests.
2. Verify RLS relationships and specialty filtering with representative student identities in a staging environment.
3. Review the SECURITY DEFINER view and RPC definitions/grants; remediate in a separately reviewed migration.
4. Continue read-only authenticated route migration (subjects, group details, published materials) before writes, uploads, tests/attempts, or admin endpoints.
5. Deploy the Worker only to a non-production staging endpoint after CI and route contract checks pass. Keep SpaceWeb and Vercel configuration unchanged until an explicit cutover gate is met.
