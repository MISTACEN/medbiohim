# Security fix — MBH access enforcement for histology materials (Pass 48)

Date: 2026-10-10  
Scope: `backend/config/routes/material_viewer.php`, deploy verification, pre-deploy audit.

## Finding

The material `file-url` and binary `file` routes checked `specialty_slug`, but did not independently require MBH membership when the subject slug itself was `histology`. If a histology subject row had an empty/null or inconsistent specialty slug, the specialty check could be skipped.

## Changes

- Both material endpoints now derive `requiredSpecialty = mbh` whenever `subject_slug = histology` or `specialty_slug = mbh`; other non-empty specialties keep their existing access rule.
- Removed duplicate selected columns from the binary material query without changing the required fields.
- The SpaceWeb deployment verifier now downloads `material_viewer.php` and checks the MBH guard markers after upload.
- `scripts/predeploy-audit.mjs` now guards the same access contract.

## Verification / limitations

- Source and query reviewed; no live unauthorized access was demonstrated.
- GitHub Actions still fails before steps, so PHP lint, pre-deploy audit and post-upload marker verification have not run in GitHub.
- The PHP fix is **not confirmed deployed** to SpaceWeb. Do not mark the materials access boundary closed until an MBH account and a non-MBH account are tested against both endpoints.

## Acceptance

1. Non-MBH user gets 403 for histology material `file-url` and `file` even when the row's `specialty_slug` is empty/null.
2. Active MBH user with required group access can read the allowed material.
3. Non-histology materials preserve their current specialty/group rules.
4. PHP lint, pre-deploy audit and SpaceWeb post-deploy source marker checks pass.
