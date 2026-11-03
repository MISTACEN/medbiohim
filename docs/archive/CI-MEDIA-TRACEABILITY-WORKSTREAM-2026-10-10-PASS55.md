# CI + histology media traceability workstream — 2026-10-10 (Pass 55)

## Scope
Grouped the next pass into two connected release-readiness gates: GitHub Actions execution diagnosis and Histology electronogram asset traceability. No new branch; source of truth remains `main`. Historical pass reports were not rewritten.

## 1. GitHub Actions diagnosis

Read the current `.github/workflows/smoke.yml`, `.github/workflows/code-check.yml`, and `.github/workflows/deploy-backend.yml` from `main`.

- The smoke workflow has `push`, `workflow_dispatch`, and scheduled triggers, and targets `ubuntu-24.04`.
- Code checks have separate frontend and backend jobs, both targeting `ubuntu-24.04`; backend checks include PHP lint, sanitizer/auth/homework SQL regression tests, and route registration.
- SpaceWeb deployment is gated by a non-empty `FTP_PASSWORD`, pre-deploy PHP/test/route checks, a verified non-empty backup, and post-upload source-marker checks.
- Latest inspected smoke run `38011594578` is failed with `steps: null`; follow-up runs triggered by the documentation commits were also checked: code checks `38011994749` (both `backend` and `frontend` jobs), smoke `38011994779`, and archive build `38011994746` all completed as failures with `steps: null`. This confirms the failure persists across different workflows on the latest docs commit, without actionable step logs.

**Conclusion:** no workflow-YAML defect was established as the cause of the runner failure. The evidence is consistent with runner allocation/initialization or repository/account-side Actions infrastructure, but does not identify the exact external cause. Do not mark CI as restored. Next diagnostic needs repository owner access to the Actions UI/account usage/permissions or GitHub Support; do not change workflow commands blindly to compensate for a job that never starts.

## 2. Read-only electronogram reconciliation

Supabase project `gnobvyjywtqbdfeejxmf`, filtered to `subject_slug = histology AND mode_set = electronogram`:

- 28 cards found.
- 28/28 have captions in `preparation.captions`.
- 28/28 have `source_file_id IS NULL`.
- 27/28 use an `electronograms/images/...` `source_key`; one legacy card uses `histology-em-capillary-20261005`.
- 28/28 have `preparation.imageUrl`.
- 5 cards have a basename mismatch between `source_key` and `preparation.imageUrl`. These are the Ranvier node, photoreceptor rod dendrites, ciliated epithelium surface, gastric parietal exocrinocyte, and the legacy capillary card.

A prior GitHub-tree check recorded no matching physical image assets in the `main` tree, and no exact/basename match in `content_sources.source_path`. This pass did not obtain evidence of the files' physical presence on SpaceWeb or Backblaze B2. Therefore the path mismatches are recorded as risks, not blindly rewritten: the shorter image names may correspond to legacy server files, and changing database paths without verifying the actual objects could turn a potentially valid path into a 404.

No production database writes, publication changes, card deletions, or ticket-bank changes were made.

## 3. Reproducible read-only audit

Added `database/audits/20261010_electronogram_asset_traceability.sql` to repeat the counts and list the exact path mismatches. It is SELECT-only and safe to run in the SQL editor.

## Status

- 🟢 Workflow source configuration reviewed; runner issue narrowed to a pre-step execution failure rather than a demonstrated command/test failure.
- 🟢 Electronogram metadata/caption/path counts rechecked read-only.
- 🟡 Physical media delivery remains unverified; need a read-only SpaceWeb/B2 existence and authenticated HTTP check before any path migration.
- 🔴 GitHub Actions execution remains blocked/unverified; no CI green claim.
- 🔴 Vercel quota/deployment and SpaceWeb runtime verification remain separate release gates.

## Next grouped work
1. Owner-side GitHub Actions runner/account diagnosis.
2. Verify the 28 actual media objects on SpaceWeb/B2, compare with the five basename mismatches, then prepare a narrowly scoped Histology-only path correction if evidence supports it.
3. Run PHP lint/regression/route checks and frontend typecheck/build/predeploy audit in a functioning runner; then verify the exact deployed commit and authenticated browser paths.
