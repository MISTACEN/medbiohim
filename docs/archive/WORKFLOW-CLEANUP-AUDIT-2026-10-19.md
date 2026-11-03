# MEDBIOHIM — workflow cleanup audit (2026-10-19)

Static source review on `main`. No workflows were dispatched, deleted, or disabled.

## High risk: manual workflows that push source changes to `main`

The following files have manual dispatch, write permission, and commit/push steps. Treat them as source-mutating scripts, not ordinary CI:

- `restore-contract-tests.yml` — restores a test file from historical commit `835e5e43` then patches assertions.
- `fix-questions-miniquiz.yml` — replaces `workers/api/src/routes/questions.ts` from fixed commit `c6cefd4b...`.
- `restore-schedule-page.yml` — restores schedule UI from `d534fce...` then applies string patches.
- `fix-groups-subjects.yml` — copies `scripts/p0/groups.ts` and `subjects.ts` over current handlers.
- `apply-personal-cabinet.yml` — decodes Base64 payloads over `dashboard.ts` and `my.ts`.
- `apply-p0-academic-crud.yml`, `apply-p0-v2.yml` — overlap on academic/groups/subjects routes.
- `apply-p1-ui-schedule-db.yml`, `apply-p1-v2.yml` — overlap on home/admin schedule/database code.
- `apply-admin-database.yml` — writes a full admin database route file and restores questions from an old commit.
- `apply-db-writes.yml` — injects write handlers into the admin database route.
- `fix-academic-soft.yml`, `fix-runtime-errors.yml` — overlapping text patches and pushes.

Do not dispatch these to test them. Before retiring any, compare their generated output with current `main` and check history/references. Keep all referenced `.b64` and `.snippet` files until the workflows are retired.

## Invalid workflow candidate

`.github/workflows/apply-p0-embedded.yml` contains only `PLACEHOLDER_TOO_LARGE_USE_SCRIPTS` (33 bytes), not valid YAML. It had no current source/workflow references and was removed in the cleanup commit; Git history retains the placeholder.

## Workflows to retain

- `code-check.yml`: push/PR/manual checks; read-only contents permission.
- `smoke.yml`: main push, manual and scheduled smoke; read-only permission.
- `deploy-medbiohim-api.yml`: canonical production Worker deploy; typecheck/tests before deploy, read-only contents permission.
- `deploy-cloudflare-shadow.yml`: manual-only shadow deploy; keep while canonical 501 fallback remains.
- `package-archives.yml`: retained as the generic source/backend archive workflow. `build-spaceweb-archive.yml` was removed on 2026-10-20 after confirming it only packaged a legacy SpaceWeb artifact and had no consumers in source/workflows.

## Run history limitation

Historical docs report October 10 jobs failed before steps (`runner_id: 0`, no runner name, no steps/logs), and a later note says some apply-workflow runs failed on push. These are historical observations, not proof of the latest run state on October 19. Current Actions status must be checked before claiming CI is green or broken.

## Safe next steps

1. Do not run source-mutating workflows as a diagnostic.
2. Replace their behavior with reviewed source commits and tests, then retire the workflows.
3. Check GitHub runner availability and obtain a real successful CI run before counting tests as passed.
4. Keep shadow and PHP reference code until route/data parity is demonstrated.


## Live push-run check (2026-10-19)

The current push created failed runs for several legacy manual workflow files, but the GitHub Actions API returned **zero jobs** for those runs (no steps executed). The canonical API deployment and smoke workflow succeeded. The invalid placeholder `apply-p0-embedded.yml` was removed; the remaining manual workflows and their snippets are retained until each can be retired safely.


CI follow-up (2026-10-19): the predeploy audit's signed-URL cache assertion was corrected to verify the actual no-store/expiry logic. Frontend code-check run [39256338205](https://github.com/MISTACEN/medbiohim/actions/runs/39256338205) succeeded. The two placeholder files listed in the cleanup decision report were removed; the other source-mutating workflows remain untouched.


## Follow-up — 2026-10-20

The code-check, smoke, source-package, and Cloudflare deploy workflows for the API priority fix succeeded. The four legacy `apply-*` / `fix-*` workflow runs that show as failed for the latest commits had **zero jobs**, so no steps ran. They remain do-not-dispatch until each source-mutating script is audited. The root lockfile was added and the latest code-check run passed.


## Follow-up — 2026-10-20

- Removed `.github/workflows/build-spaceweb-archive.yml` in commit `6d5ede307f6e0020d47f65f402fb0b60e7bb74f8`. The generic `package-archives.yml` continues to produce a backend archive, so no backup packaging capability was lost.
- Temporary Google Drive histology media is live: Worker deploy and code checks passed; all 206 published card image routes returned HTTP 200 with image bytes (178 preparations + 28 electronograms). Details: [production media audit](PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md).
