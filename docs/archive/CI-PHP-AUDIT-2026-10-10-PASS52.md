# MEDBIOHIM — PHP audit follow-up (Pass 52)

Date: 2026-10-10  
Branch: `main`  
Scope: follow-up static review of homework SQL and CI recovery.

## Findings fixed

1. `backend/src/Repositories/HomeworkRepository.php`: the homework listing query reused the same named PDO placeholders for submission and progress joins. The attachment query also reused a named placeholder in a nullable-or-match condition. Although the shared PDO connection currently enables emulated prepares, relying on repeated placeholders is driver/configuration-sensitive. Distinct placeholders are now used and bound independently.
2. Added `backend/tests/HomeworkSqlContractTest.php`, a credential-free static regression test for the homework query placeholders, MBH/histology scope predicate, and active/owned attachment requirement.
3. Wired the new test into both `code-check.yml` and the SpaceWeb pre-deploy checks, so it will run before backend deployment once Actions can allocate a runner.

## Additional PHP findings fixed in this pass

4. `backend/config/routes/student_planner.php`: split repeated PDO placeholders between homework progress/submission joins and between the completed flag and its timestamp expression. The attendance update handler now logs internal details and returns a generic client error.
5. `backend/config/routes/admin_questions.php`, `admin_rest.php`, and `admin.php`: replaced raw exception text in database/admin failure responses with generic messages and server-side log entries. Input validation errors continue to return their specific validation message.
6. `backend/config/routes/platform.php`: the media route's caught failure now logs the internal exception and returns a generic message. One remaining legacy platform handler is still under review and is explicitly not counted as verified.

## CI status — not resolved

The latest available evidence from run [37993824049](https://github.com/MISTACEN/medbiohim/actions/runs/37993824049) remains an infrastructure failure: jobs have no step list or logs and GitHub reports `runner_id=0`. Retrying the failed jobs was accepted, but both jobs again failed without executing steps. This means we still cannot honestly report that the full PHP lint, regression suite, route registration, TypeScript checks, or production build passed in CI.

Pinning workflows to `ubuntu-24.04` did not fix runner allocation. The next external action is to verify repository/org Actions permissions and billing/spending limits, then contact GitHub Support if those are normal. Do not weaken required checks or treat zero-step failures as passes.

## Scope and limits

- This pass is a source-level review, not a complete audit of every PHP execution path.
- The new contract test is static and is not a substitute for PostgreSQL integration tests against the actual schema/RLS policies.
- No live Supabase data, memberships, role assignments, schedule rows, homework rows, or learning content were modified.
- SpaceWeb deployment remains unverified; do not assume these backend source changes are live until the deployment workflow and post-deploy checks execute successfully.


## Frontend deployment status

The latest observed Vercel commit status is `failure` with the target URL indicating `build-rate-limit` / upgrade-to-Pro. This is a Vercel build quota/plan blocker, not evidence of a source compilation failure. Until Vercel allows a build, frontend deployment status also remains unverified. See the [Vercel project status target](https://vercel.com/mistacen1?upgradeToPro=build-rate-limit).
