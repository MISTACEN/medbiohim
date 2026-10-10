# Pass 60 — avoid unnecessary CI work for documentation-only changes (2026-10-10)

## Change
Added `paths-ignore` filters to:
- `.github/workflows/code-check.yml` (push and pull_request)
- `.github/workflows/smoke.yml` (push; scheduled/manual runs remain available)
- `.github/workflows/package-archives.yml`
- `.github/workflows/build-spaceweb-archive.yml`

The filters skip pushes/PRs where changed files are Markdown-only, including `docs/**`, `README.md`, `ROADMAP.md`, `PHASES_STATUS.md`, and `SYNC_STAMP.md`. This prevents each documentation/report update from starting multiple code/runtime/packaging jobs. Manual `workflow_dispatch` remains enabled; the smoke schedule remains enabled.

## Commits
- code-check: `ad80b9c7fd99b1585c87a15d467f8654a2e3af8d`
- smoke: `f2ae57b5089edde10f68ea2afe5b6dd05758b126`
- source package: `3d0bc8a4f8fdd3510c5a8fad3caab71f02b70e73`
- SpaceWeb archive: `1e14f1e5c4bdc375eab4e2b81e7fa5cd2bd0540d`

## Rationale and limits
This is queue/noise reduction only. It does not repair the observed GitHub Actions initialization failures where jobs expose `steps: null`. A commit that changes code plus docs still runs checks because the changed code path is not ignored. Future edits to workflows themselves also continue to trigger workflows.

## Verification
Workflow files were re-fetched from the repository and the trigger blocks updated through GitHub's contents API. GitHub Actions execution of the new filters has not yet been confirmed. Do not treat this change as a green CI result.

No production deployment, secret changes, or database writes were made.


## Post-commit observation
After the workflow-file commits, the newest generated runs are attached to workflow-change commits (latest inspected: code-check `38013521893`, smoke `38013522004`, source package `38013521967`, backend archive `38013522082`). Each again fails with job `steps: null`. Subsequent Markdown-only status/report commits did not appear as newer workflow runs in the Actions runs listing, consistent with the new path filters skipping docs-only commits. This is observational confirmation of reduced docs-only run churn, not confirmation that job execution is repaired.
