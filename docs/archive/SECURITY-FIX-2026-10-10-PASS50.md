# Security fix — MBH access for subject catalog, gradebook and academic context (Pass 50)

Date: 2026-10-10  
Scope: `SpecialtyAccess`, subject list/fallback, gradebook, academic context and pre/post-deploy checks.

## Finding

The central subject access helper and some fallback/context routes trusted `specialty_slug` alone. If a subject was identified as `histology` but had an empty or inconsistent specialty slug, a route could treat it as a global subject. The subject catalog fallback also did not include `specialty_slug`, and the SQL subject repository method named `listActive()` did not filter inactive rows.

## Changes

- `SpecialtyAccess::canAccessSubject()` now loads `slug` and `specialty_slug`, requires MBH for histology/MBH subjects, and only permits active subjects.
- `GET /api/v1/subjects` applies the same MBH filter to both SQL and Supabase fallback results; fallback projection now includes `specialty_slug`.
- `GET /api/v1/subjects/{id}/gradebook` checks subject access before reading gradebook data and returns 503 (fail-closed) if access cannot be verified.
- `SubjectRepository::listActive()` now filters `is_active = true`, matching fallback behavior.
- `AcademicContextResolver::resolveSubject()` now requires an MBH group for histology subjects in both schedule-entry and compatibility branches, even when `specialty_slug` is NULL.
- Pre-deploy audit and SpaceWeb post-deploy verifier check these contracts.

## Verification / limitations

- Source-level review completed; no unauthorized gradebook/context read was demonstrated.
- GitHub Actions continues to fail before steps, so PHP lint, integration checks and deployment verification have not executed on GitHub.
- PHP changes are not confirmed deployed to SpaceWeb.
- No subject rows, memberships, grades or schedule records were modified.

## Acceptance

1. Non-MBH user cannot see histology in the subject list/fallback or read its gradebook.
2. A non-MBH group cannot resolve a histology subject through either schedule-entry or compatibility fallback, even if the subject's `specialty_slug` is empty.
3. Active MBH user/group retains access; other subjects retain existing specialty rules.
4. Inactive subjects do not appear in the active subject list.
5. PHP lint, sanitizer regression tests, pre-deploy audit and SpaceWeb post-deploy markers pass.
