# Database least-privilege refinement + status reconciliation — Pass 56

Date: 2026-10-10  
Branch: `main`

## 1. Rechecked effective public-table privileges (read-only)

Supabase project `gnobvyjywtqbdfeejxmf`, PostgreSQL 17.6. Used `has_table_privilege` across all public base/partitioned tables (83 tables).

| Client role | MAINTAIN | TRUNCATE | REFERENCES | TRIGGER |
|---|---:|---:|---:|---:|
| `anon` | 71 | 71 | 71 | 71 |
| `authenticated` | 78 | 78 | 78 | 78 |

These are counts of public tables on which the role has the effective privilege, not a claim that every table is exposed through the API. RLS does not protect TRUNCATE; MAINTAIN, REFERENCES, and TRIGGER are also unnecessary for browser-facing roles. This is a least-privilege finding; the audit alone does not establish a specific exploit path.

## 2. Refined the proposed migration (not applied)

Updated `database/migrations/20261010_revoke_non_rls_table_privileges.sql` to revoke all four privileges on existing public tables and from default table privileges for the observed owners `postgres` and `supabase_admin`.

The migration deliberately does not alter SELECT/INSERT/UPDATE/DELETE grants or RLS policies. It remains **not applied** to production. A migration file being committed is not equivalent to a successful schema change. Validate in staging with the real migration role, review inherited/owner privileges, then apply only through the approved migration process.

Added `database/audits/20261010_public_table_privilege_verification.sql`, a read-only before/after query. Expected post-migration count is zero for each role/privilege combination. This expectation must be verified after the migration; no post-migration success is claimed.

## 3. Documentation status reconciliation

The unfinished registry contained older quality-gate text saying smoke passed. Newer runs `38011994749`, `38011994779`, and `38011994746` ended before steps were available (`steps: null`). Updated the current status so historical passes remain historical evidence, while latest CI status is correctly marked blocked/unverified.

## Safety / release status

- 🟢 Read-only effective-privilege counts captured on PostgreSQL 17.6.
- 🟢 Proposed migration and repeatable verification query updated in GitHub.
- 🟢 Current unfinished registry reconciled against latest Actions evidence.
- 🔴 No production DB writes; migration remains unapplied.
- 🔴 CI runner still fails before actionable steps; no test pass is claimed.
- 🟡 App behavior, staging migration execution, inherited privilege behavior, and deployment verification remain open.

## Next grouped work
1. Verify migration in a staging clone with the actual migration role and run the read-only privilege audit before/after.
2. Resolve GitHub Actions pre-step failures using owner-side runner/account diagnostics.
3. Resume end-to-end PHP/frontend and deployment verification only once CI jobs actually execute.
