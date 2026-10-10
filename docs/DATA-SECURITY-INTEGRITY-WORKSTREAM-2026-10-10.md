# Data + database privilege integrity workstream

Date: 2026-10-10  
Branch: `main`  
Workstream groups the Pass 54 question/test reconciliation with the next database privilege review. Individual historical reports are preserved; no reports, migration history, or old pass records were deleted.

## 1. Question/test data integrity — read-only evidence

Supabase project `gnobvyjywtqbdfeejxmf`; read-only SQL only.

- `questions`: 855 total; 660 active published.
- `tests`: 33 total; 32 active published.
- `test_questions`: 854 links.
- Duplicate (test, question) pairs: 0; broken links: 0.
- Published active tests without questions: 0.
- Published active questions without a test link: 0.
- `exam_questions`: 876 total; 776 published.
- Published blank prompts: 0; missing subject identity: 0; broken non-null module/topic links: 0.
- 719 published `exam_questions.answer` values are blank. Grouping by kind/type indicates open-ticket/preparation-style records; no bulk fill, delete, or unpublish is justified without source review.
- Five active published questions are linked to valid legacy Anatomy/Biochemistry subject rows whose `slug` is NULL. They are not orphans; canonical slug mapping remains unresolved.

Historical detail remains in [Pass 54](DATA-INTEGRITY-RECONCILIATION-2026-10-10-PASS54.md).

## 2. Public-schema table privilege audit — new finding

A read-only check of effective privileges found that the `anon` and `authenticated` roles can have `TRUNCATE`, `TRIGGER`, and `REFERENCES` privileges on many public base tables. The exact table ACLs vary, and this query alone does not prove an exploit path through PostgREST. However, RLS policies do not govern `TRUNCATE`; these privileges are unnecessary for browser-facing roles and violate least privilege.

The audit also observed permissive default ACL entries for client roles on tables created by `postgres` and `supabase_admin`. New-table defaults need to be tightened as well as existing table grants.

### Prepared mitigation

Added migration:

`database/migrations/20261010_revoke_non_rls_table_privileges.sql`

It revokes only `TRUNCATE`, `REFERENCES`, and `TRIGGER` from `anon` and `authenticated` across existing public tables, and tightens those default privileges for `postgres` and `supabase_admin`. It deliberately leaves SELECT/INSERT/UPDATE/DELETE grants and all RLS policies unchanged.

**The migration is committed but has NOT been applied to live Supabase.** Do not report the database as fixed yet. First validate the migration owner/default-privilege behavior in a staging clone, check app flows, then apply through the approved migration process and rerun effective privilege queries. No production database writes were made during this workstream.

## 3. Verification status

- 🟢 Read-only data integrity invariants above are checked.
- 🟡 Static review of the proposed privilege migration only; no live schema mutation or staging run.
- 🔴 GitHub Actions runner allocation continues to fail before executing steps; no CI result is claimed.
- 🟡 Vercel and SpaceWeb deployment/runtime, authenticated RLS tests, and physical media delivery remain unverified.

## 4. Consolidated workflow policy

To reduce administrative overhead without losing history, future work will be grouped into cross-layer workstreams (for example: **CI + PHP + deployment**, **database/data/security**, **learning UX + media**). Historical Pass reports and commit history remain intact. `ROADMAP.md`, `PHASES_STATUS.md`, `SYNC_STAMP.md`, and the unfinished registry remain the current summaries; they link to consolidated workstream reports instead of duplicating long narratives. A workstream is not marked complete merely because source or migration files were committed.
