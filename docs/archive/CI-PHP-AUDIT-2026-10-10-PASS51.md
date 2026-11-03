# MEDBIOHIM — CI recovery and PHP security audit (Pass 51)

Date: 2026-10-10  
Branch: \`main\`  
Status: source fixes committed; GitHub Actions execution remains unverified.

## GitHub Actions recovery

- Pinned all active GitHub-hosted workflows from \`ubuntu-latest\` to \`ubuntu-24.04\` to remove moving-image drift while diagnosing runner allocation.
- Added \`backend/tests/SupabaseAuthRoleTest.php\` to the code-check workflow and SpaceWeb pre-deploy checks.
- Reworked the duplicate route detector to scan any router variable (\`$router\`, \`$r\`, etc.) using a heredoc PHP script; the previous expression only targeted a specific variable name and was not a reliable cross-file route check.
- Removed duplicate registrations for admin users/homework/role endpoints from \`backend/config/routes/admin_rest.php\`; the canonical implementations remain in \`backend/config/routes/admin.php\`.
- A fresh push-triggered run using the pinned `ubuntu-24.04` image and a second retry both failed before any step. The latest observed code-check run is [37993824049](https://github.com/MISTACEN/medbiohim/actions/runs/37993824049), attempt 2; jobs `114034899019` and `114034899286` report `runner_id=0`, empty runner name, and zero steps. Log download returns `BlobNotFound`. The image pin did **not** resolve runner allocation. The signature is consistent with a hosted-runner dispatch/account-level issue, not a PHP test failure.

## PHP/security fixes

1. \`HomeworkRepository.php\`: fixed invalid PHP string quoting around the attachment SQL predicate \`status = 'active'\`.
2. \`SupabaseAuth.php\`: only server-controlled \`app_metadata.role\` is eligible to populate the backend role claim; editable \`user_metadata.role\` and top-level \`role\` are ignored.
3. \`RequireRole.php\`: privileged authorization now checks canonical \`user_roles\` in the database and fails closed with HTTP 503 if the role store is unavailable, rather than trusting stale token claims.
4. \`admin/claim-admin\`: bootstrap is closed once an administrator role already exists.
5. \`Request.php\`: bearer tokens are no longer accepted from query strings.
6. \`Bootstrap.php\`: uncaught exceptions continue to be logged server-side, while clients receive a generic internal-error response without SQL details, source paths, or line numbers.
7. Sanitized exception responses and added server-side logging for content/material, trainer, AI, presence, search, settings, academic-planning, calculator, student-planner, SRS, and public health-check failures.

## Checks added / executed

- Added a five-case regression test for Supabase role claims and wired it into both CI and deployment preflight.
- Ran local PHP syntax checks on the isolated role-middleware/test harness and ran the five role-claim assertions against an equivalent helper implementation; all five assertions passed.
- This local harness is **not** a substitute for linting the exact full repository or running the real GitHub workflow.
- Full \`find backend -name '*.php' -exec php -l\`, route-registration smoke, sanitizer tests, pre-deploy audit, SQL integration, and deployment verification are still pending a real runner / target runtime.

## Remaining blockers

- 🔴 GitHub-hosted runner allocation. Recent community reports show the same `runner_id=0` / zero-step signature in private repositories; verify Actions billing/spending-limit settings and contact GitHub Support if those are healthy. Relevant references: [GitHub Actions status](https://www.githubstatus.com/) and [community report with the same failure signature](https://github.com/orgs/community/discussions/208438).
- 🟡 Full PHP syntax/type/route/SQL audit against the exact current \`main\` tree.
- 🟡 Authenticated database/RLS and fallback-path tests.
- 🟡 SpaceWeb deployment and post-deploy API smoke.
- 🟡 Review of remaining caught exception handlers for generic client responses and adequate server-side logging.

No Supabase rows, role assignments, ticket banks, schedule rows, or learning-content records were changed in this pass.
