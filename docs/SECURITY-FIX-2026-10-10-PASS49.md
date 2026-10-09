# Security fix — consistent MBH access across materials and file routes (Pass 49)

Date: 2026-10-10  
Scope: `backend/config/routes/content_integration.php`, `backend/src/Repositories/FileRepository.php`, `backend/config/routes/files.php`, CI/pre-deploy source guards.

## Finding

Pass 48 corrected the dedicated material viewer's binary and file-url routes. The wider content integration still had separate checks that trusted only `specialty_slug`:
- `GET /api/v1/subject-materials`
- `GET /api/v1/materials`
- `GET /api/v1/materials/{id}`
- `GET /api/v1/content-sources/{id}`

The two material lists could include histology rows with empty/inconsistent specialty metadata; the materials list can attach a short-lived B2 presigned URL after filtering. The content-source route used an ID-name heuristic that could miss UUID-backed source records. File download endpoints also relied on `files.specialty_slug` and did not independently recognize a file linked to a histology material.

## Changes

- Added a shared material-list filter that requires MBH membership when either `subject_slug = histology` or `specialty_slug = mbh`.
- Applied the same rule to material detail.
- Content source access now checks linked histology materials in SQL and recognizes canonical/legacy histology source paths, while preserving existing source-ID checks.
- `FileRepository::assertAccess()` now returns an internal `is_histology_material` flag based on linked materials; both file metadata/download routes enforce MBH access from that flag even if the file's own `specialty_slug` is empty.
- Internal access flags are removed from public response payloads.
- Deployment verification and pre-deploy audit now check these route/repository markers.

## Verification / limitations

- Source-level checks added; no production unauthorized access was demonstrated.
- GitHub Actions still fails before steps, so PHP lint, pre-deploy audit and deploy verification have not executed on GitHub.
- Changes are not confirmed deployed to SpaceWeb.
- No content records, source paths, file objects or user roles were modified.

## Acceptance

1. Non-MBH user gets 403 for histology rows in `/subject-materials`, `/materials`, `/materials/{id}`, `/materials/{id}/file-url`, `/materials/{id}/file`, `/content-sources/{id}`, `/files/{id}`, and `/files/{id}/download` where relevant.
2. Tests cover histology subject with empty/null `specialty_slug` and UUID-backed `content_sources.id`.
3. MBH user with required group access can load metadata and open the file.
4. Non-histology materials preserve existing specialty, uploader, public and group rules.
5. PHP lint, sanitizer regression tests, pre-deploy audit and post-deploy marker checks pass.
