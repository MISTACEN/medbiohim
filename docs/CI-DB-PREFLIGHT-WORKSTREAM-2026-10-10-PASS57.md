# CI runner + privilege migration preflight — Pass 57 (2026-10-10)

## Scope
Follow-up to Pass 56: re-run a failed Actions job, inspect current workflow definitions, and validate the live PostgreSQL role-membership/default-ACL assumptions behind the proposed least-privilege migration. No production writes were made.

## GitHub Actions
- Re-ran smoke job from run [38012180433](https://github.com/MISTACEN/medbiohim/actions/runs/38012180433) (attempt 2).
- It failed again before steps: latest job record has `steps: null`, `logs_url: null`. No shell command, YAML step, or application test is shown as having run.
- The same latest run group includes the source archive job and prior code-check/smoke jobs failing at initialization. This strongly supports a runner/platform initialization blocker rather than an actionable failing test, but does not identify the underlying account/platform cause.
- Workflow YAML inspection confirms `code-check.yml` has push/PR/dispatch triggers and separate frontend/backend jobs on `ubuntu-24.04`; the smoke workflow has push/dispatch/schedule triggers. No workflow change was justified by the available evidence.
- **Not verified:** PHP lint/regression tests, frontend typecheck/build, predeploy audit, smoke HTTP requests, or target deployment.

## Supabase least-privilege preflight (read-only)
- Current public-schema default table ACLs exist for both `postgres` and `supabase_admin`. Each default ACL currently grants browser roles broad table rights (`arwdDxtm`), so the migration must revoke the four targeted non-RLS privileges for both owners.
- Role membership inspection shows `authenticator` can SET ROLE to `anon`, `authenticated`, and `service_role` with `inherit_option=false`; this is consistent with explicit PostgREST role switching and does not itself show that browser JWTs can assume privileged roles. `postgres` membership in client roles is administrative and not browser-accessible.
- The current migration targets existing public tables and default table ACLs for both observed default owners. It does not change SELECT/INSERT/UPDATE/DELETE grants, RLS policies, schemas, or educational data.
- The read-only verification SQL remains the acceptance check after any approved staging migration. Before/after effective privileges and browser-facing flows must be checked under anon/authenticated JWTs.
- **Migration remains NOT APPLIED**; no staging project/approval was confirmed in this pass, and no production DDL/DML was executed.

## Decision / next actions
1. Inspect GitHub repository Actions settings/usage and runner initialization from the repository owner UI; if runs continue to have no runner/steps/logs, open GitHub Support escalation with run IDs 38012180433 and 38012180409.
2. Identify/confirm a staging Supabase project and migration execution role before applying the migration there.
3. Once Actions executes, run PHP syntax and regression tests, route-registration smoke, frontend typecheck/build/predeploy audit, then HTTP smoke against the deployed target.
4. Verify the 28 Histology media objects physically on SpaceWeb/B2 before changing any paths.

## Evidence
- Workflow source: `.github/workflows/code-check.yml`, `.github/workflows/smoke.yml`.
- Migration: `database/migrations/20261010_revoke_non_rls_table_privileges.sql` (committed, unapplied).
- Verification query: `database/audits/20261010_public_table_privilege_verification.sql`.
- Prior context: Pass 55 CI/media traceability; Pass 56 DB least-privilege status reconciliation.

Status: source/config reviewed; runner still blocked; migration preflight read-only only.
