# MEDBIOHIM — CI recovery and PHP security audit (Pass 51)

Date: 2026-10-10  
Branch: \`main\`  
Status: source fixes committed; GitHub Actions execution remains unverified.

## GitHub Actions recovery

- Pinned all active GitHub-hosted workflows from \`ubuntu-latest\` to \`ubuntu-24.04\` to remove moving-image drift while diagnosing runner allocation.
- Added \`backend/tests/SupabaseAuthRoleTest.php\` to the code-check workflow and SpaceWeb pre-deploy checks.
- Reworked the duplicate route detector to scan any router variable (\`$router\`, \`$r\`, etc.) using a heredoc PHP script; the previous expression only targeted a specific variable name and was not a reliable cross-file route check.
- Removed duplicate registrations for admin users/homework/role endpoints from \`backend/config/routes/admin_rest.php\`; the canonical implementations remain in \`backend/config/routes/admin.php\`.
- The last retried historical Actions run again failed before any step and had no job logs. This does not prove the new Ubuntu image fixed the issue. GitHub Actions is **not marked recovered** until a new push-triggered run executes steps and publishes results.

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

- 🔴 GitHub Actions runner allocation and fresh run results.
- 🟡 Full PHP syntax/type/route/SQL audit against the exact current \`main\` tree.
- 🟡 Authenticated database/RLS and fallback-path tests.
- 🟡 SpaceWeb deployment and post-deploy API smoke.
- 🟡 Review of remaining caught exception handlers for generic client responses and adequate server-side logging.

No Supabase rows, role assignments, ticket banks, schedule rows, or learning-content records were changed in this pass.
