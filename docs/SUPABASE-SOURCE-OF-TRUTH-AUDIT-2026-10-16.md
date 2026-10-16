# Supabase source-of-truth audit — 2026-10-16

## Scope and safety

Read-only inspection of the live Supabase project `gnobvyjywtqbdfeejxmf` and the Worker source on GitHub `main`. No SQL migration, row mutation, secret readout, traffic switch, or deployment was performed during this audit. This report records observed state; it is not an assertion that all application flows work end-to-end.

## Live database inventory

- `public`: 84 base tables.
- RLS is enabled on all 84 tables.
- FORCE ROW LEVEL SECURITY is enabled on 0 tables (this is not automatically a vulnerability; review per table/role and server access path).
- `pg_policies`: 169 policies across all 84 public tables.
- Latest registered migration returned by Supabase: `20261016075941`, `grant_private_schema_usage_to_authenticated`.
- Auth/profile alignment observed in the earlier inventory: 5 `auth.users` and 5 `public.users`; no mismatch was detected.
- Key data counts from the live inventory: users 5, groups 4, group_memberships 6, subjects 114, schedules 5, schedule_entries 342, student_academic_states 41, user_topic_progress 0, user_preferences 0, subject_gradebook_entries 77, trainer_feed_cards 206, materials 80, files 1.
- Earlier integrity checks found no orphan group memberships, schedule entries, or missing subject references. These checks do not replace a full FK/data-integrity suite.

## Relevant objects and schema/code mismatches

| Object | Live database | Worker source / implication |
|---|---|---|
| User preferences | `public.user_preferences` exists; `public.user_settings` does not | `workers/api/src/routes/settings.ts` queries `user_settings` for GET/PATCH. This is a confirmed schema-contract mismatch. Change the handler to the actual table and its real column shape, then test owner-scoped read/write. |
| Telegram linkage | `telegram_bot_chats` exists; `telegram_accounts` and `telegram_account_link_tokens` do not | Telegram status/link routes need an explicit design and migration aligned with the existing bot/webhook and auth model. Do not create tables blindly or expose bot tokens. |
| Academic state | `student_academic_states`, `user_topic_progress`, `subjects`, `topics` exist | `workers/api/src/routes/academic.ts` selects `topics(title)` while reading `student_academic_states`. `target_id` is polymorphic (curriculum item/topic/subject), with no direct FK from it to `topics`; PostgREST cannot safely infer a single topic relation from this polymorphic ID. This is a strong likely cause of the 503; capture exact error and replace the relation with explicit type-aware topic lookup. |
| Academic sync RPC | `private.sync_student_academic_state(p_user_id uuid)`, `public.sync_my_academic_state()`, and a private trigger function exist | Worker tries a sequence of compatibility RPC names. Verify schema exposure, grants, and call identity before changing the sync logic. |
| Auth/profile | `public.users.id` references `auth.users.id` | Keep a single canonical user ID. Do not add a second identity table or bypass JWT/RLS. |
| Schedule/catalog | `schedules`, `schedule_entries`, `subjects`, `groups`, `group_memberships` exist | The data model is present; next validate Worker response shapes and authenticated CRUD instead of reseeding tables. |
| Histology/media | `trainer_feed_cards` (206 rows), `materials` (80), `files` (1) exist | Metadata rows are not proof that physical blobs exist or can be signed/downloaded. Keep object storage separate from Supabase metadata. |

Source files inspected:
- [academic.ts](https://github.com/MISTACEN/medbiohim/blob/main/workers/api/src/routes/academic.ts)
- [settings.ts](https://github.com/MISTACEN/medbiohim/blob/main/workers/api/src/routes/settings.ts)

## Security/performance advisor snapshot

Supabase advisors returned:
- 1 `SECURITY DEFINER` view finding: `public.trainer_feed_cards_public` (ERROR level). Review the view definition and grants before changing its execution semantics.
- 10 warnings for SECURITY DEFINER functions callable by `authenticated`, including the histology training lifecycle RPCs. These functions may intentionally enforce a guarded workflow; inspect function bodies, explicit authorization checks and EXECUTE grants before revoking or changing them.
- 44 unindexed foreign-key findings (performance INFO). Prioritize by measured query workload; do not mass-add indexes without checking existing indexes, duplicate coverage, write cost and migration state.
- No remediation was applied as part of this read-only audit.

## Current API incident correlation

The browser/API log recorded on 2026-10-16 showed Cloudflare responses (not fallback recovery): `/academic/state`, `/settings/account`, `/settings/telegram/status`, several `/admin/*` routes and `/admin/users` returned 501; `/groups` returned 503. `/auth/me`, `/dashboard`, and `/subjects` returned 200 in that capture. The log did not include response bodies, so status codes alone do not establish the exact failing SQL or the correctness of response payloads.

## Source-of-truth decision

- Supabase is the relational source of truth for identity/profile, groups/memberships, schedules, subjects, progress, material metadata and authorization policies.
- Cloudflare Worker is the API/business-logic boundary. It must validate input, derive user identity from the verified auth context, and rely on appropriate RLS/RPC grants.
- Upstash Blob / Backblaze B2 hold binary objects according to the project's existing storage decision; Supabase stores metadata and access relationships.
- Upstash Redis is cache/temporary state only; it must not become a second authoritative copy.
- Do not add duplicate tables or change RLS solely to make a failing endpoint return 200.

## Next implementation sequence

1. Fix settings GET/PATCH to use `user_preferences` and verify the JSON contract with the frontend.
2. Fix `GET /academic/state`: remove the invalid polymorphic topic embed, resolve topic names by `target_type`, and preserve per-user filtering; add a regression test for subject/topic/curriculum_item targets.
3. Inspect deployed Worker route registry for 501 endpoints and implement only against existing schema contracts; design Telegram linkage separately after reviewing the bot flow and auth linking requirements.
4. Run signed-in end-to-end checks for schedule, subjects, groups, dashboard, settings and academic state; test unauthorized/cross-user requests as well.
5. Review security advisor findings individually and check index candidates against existing indexes before any production DDL.

## Validation still outstanding

- No local build/test suite or live signed-in HTTP smoke test was run in this audit pass.
- No production deployment, schema change, RLS change, or storage upload was performed.
- Vercel deployment readiness and live endpoint behavior remain separate release gates.
