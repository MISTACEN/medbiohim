# GitHub Actions workflow safety audit — 2026-10-20

Branch: `main`. This is a read-only audit; no workflows were dispatched and no application or database data was changed.

## High-risk finding: manual workflows can rewrite production source on main

The following source-mutating `workflow_dispatch` workflows grant `contents: write`, modify source files and push directly to `main`. They are not ordinary test workflows. Do not run them as generic “repair” buttons; several overwrite whole route/page files or restore historical snapshots.

| Workflow | Writes / behavior | Risk / recommendation |
|---|---|---|
| `apply-admin-database.yml` | Replaces `workers/api/src/routes/admin-database.ts` with an embedded implementation | HIGH: can overwrite the current implementation. Compare current route before any dispatch. |
| `apply-db-writes.yml` | Injects a snippet into admin database route and pushes | HIGH: mutates same route as above; overlaps in responsibility. |
| `apply-p0-academic-crud.yml` | Injects admin route snippet and rewrites groups route | HIGH: whole-file overwrite of groups.ts plus patch insertion. |
| `apply-p0-v2.yml` | Patches admin route and may replace groups/subjects from base64 payloads | HIGH: overlapping implementation path with academic-crud and fix-groups-subjects. |
| `apply-p1-ui-schedule-db.yml` | Patches home page and injects admin schedule routes/role field changes | HIGH: brittle text replacements and route insertion. |
| `apply-p1-v2.yml` | Patches home page and admin schedule/database writes | HIGH: overlaps the preceding workflow and may fail if snippet files are absent. |
| `apply-personal-cabinet.yml` | Replaces dashboard.ts and my.ts from base64 payloads | HIGH: replaces whole route files. |
| `fix-academic-soft.yml` | Rewrites academic-state failure behavior and pushes directly to main | HIGH: can change API error semantics without review. |
| `fix-build-typecheck.yml` | Patches tsconfig/build exclusions and groups/subjects typing | HIGH: broad build config/source patch; inspect exact diff before use. |
| `fix-runtime-errors.yml` | Applies bundled fixes across academic state, profile routes and UI guards | HIGH: multi-file patch can overwrite later fixes. |
| `fix-worker-typecheck.yml` | Restores questions module and changes Blob type handling | HIGH: historical restoration can regress current question/media behavior. |
| `fix-groups-subjects.yml` | Copies groups.ts and subjects.ts from scripts/p0 | HIGH: force-overwrites two live route files. |
| `fix-questions-miniquiz.yml` | Restores questions.ts from a historical commit | HIGH: historical restore can discard later fixes. |
| `restore-contract-tests.yml` | Restores test file from a historical commit and patches assertions/source | MEDIUM-HIGH: mutates test expectations and trainers route. |
| `restore-schedule-page.yml` | Restores schedule page from a historical commit and patches guards | HIGH: historical page restore can discard current UI changes. |

**Control recommendation:** keep these workflows undispatched until each has been converted to a reviewable patch or dry-run. Prefer normal commits to `main` with code-check CI, rather than workflows that commit generated replacements. Do not delete them blindly: their snippets/history may still be useful recovery material.

## Archive workflows

- `package-archives.yml` remains the generic full-source/backend artifact workflow. The redundant `build-spaceweb-archive.yml` was removed in commit `6d5ede307f6e0020d47f65f402fb0b60e7bb74f8` after confirming no source/workflow consumes its artifact name. Neither workflow was a production deployment workflow.

## Placeholder and missing workflow

- `.github/workflows/apply-p0-embedded.yml` is absent on current `main` (GitHub contents API returned 404); no deletion needed.
- `.github/workflows/_questions.b64` is absent from current `main` (404); code search returns only documentation mentions, so no further cleanup is needed.

## Scope and safety

- No source-mutating workflow was dispatched.
- The obsolete `build-spaceweb-archive.yml` was removed in a separate cleanup commit after confirming there were no consumers; `package-archives.yml` remains.
- No Supabase migrations or data were changed.
- The next safe step is to add dry-run/patch previews and stale-source guards to the manual workflows, then consolidate duplicate workflows only after a diff against the currently deployed Worker.

## Follow-up — 2026-10-20

The temporary Google Drive resolver is deployed in canonical Worker `medbiohim-api`. Live production smoke verified **206/206** histology image routes return HTTP 200 image bytes (178 preparations + 28 electronograms); deployment [39270945145](https://github.com/MISTACEN/medbiohim/actions/runs/39270945145), code checks [39270945030](https://github.com/MISTACEN/medbiohim/actions/runs/39270945030). The resolver is restricted to published `histology/mbh` cards.

## Follow-up verification — 2026-10-20

- Independent production smoke checked all **206 published histology image routes** through the Vercel same-origin proxy: 206 returned HTTP 200 with `image/*` content and non-empty bytes. Direct canonical Worker spot-checks for a preparation and an electronogram returned `x-mbh-image-resolver: google-drive-temporary`.
- Local checks from a clean clone passed: frontend TypeScript; 3 API proxy tests; predeploy audit; Next.js production build (warnings only); Worker TypeScript and all 36 Worker tests. The predeploy audit reports one environment limitation: PHP CLI is unavailable locally, so PHP syntax validation remains a CI responsibility.
- A broader direct-to-Worker 206-request sweep exceeded the temporary shell session time limit; this is not counted as a pass. The full 206/206 result above is from the production Vercel endpoints.
- Additional source-mutating workflows found during the follow-up: `fix-academic-soft.yml`, `fix-build-typecheck.yml`, `fix-runtime-errors.yml`, and `fix-worker-typecheck.yml`. Keep them undispatched until each is reviewed against the current production source.
