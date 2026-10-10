# Archive secret-exclusion hardening and pass inventory — 2026-10-10 (Pass 64)

## Scope
Grouped pass covering archive confidentiality, post-change CI diagnosis, and reconciliation of the project pass inventory.

## Changes
- Hardened `.github/workflows/package-archives.yml` to exclude root and nested `.env*` files from both full-source and backend archives.
- Hardened `.github/workflows/build-spaceweb-archive.yml` to exclude root and nested backend `.env*` files.
- Added archive-list validation before artifact upload. If an archive contains a path matching `.env` or `.env.*`, the workflow exits non-zero instead of uploading it.
- Added a consolidated pass inventory: the recursive GitHub tree currently contains **37 documentation files whose names end in PASS<number>.md**, with pass numbers up to 62. This is not 62 completed sequential passes; historical numbering has gaps and some pass reports are consolidated.
- The unfinished registry currently lists 22 closed legacy blockers (C-01 through C-22) and 7 broad remaining workstreams (R1–R7).

## CI verification
Changes triggered runs:
- [Source package](https://github.com/MISTACEN/medbiohim/actions/runs/38019545954) — failed before jobs were exposed.
- [Package workflow follow-up](https://github.com/MISTACEN/medbiohim/actions/runs/38019548115) — failed with no job records.
- [Code checks](https://github.com/MISTACEN/medbiohim/actions/runs/38019548725) — frontend/backend jobs failed with `steps: null`, `logs_url: null`.
- [Smoke](https://github.com/MISTACEN/medbiohim/actions/runs/38019548760) — failed with `steps: null`, `logs_url: null`.
- [SpaceWeb archive](https://github.com/MISTACEN/medbiohim/actions/runs/38019548746) — failed with `steps: null`, `logs_url: null`.

Therefore, archive contents were **not actually built and inspected by GitHub Actions** in this pass. The guard is committed, but archive correctness and workflow YAML execution remain unverified until Actions runs real steps. Do not mark the workflows green.

## Remaining workstreams (7)
1. R1 — production environment verification: Vercel, SpaceWeb, and trainer/media HTTP checks.
2. R2 — verify AI provider availability with real production credentials/network.
3. R3 — generic document viewer coverage and real physical-file handling.
4. R4 — complete admin CMS: material metadata, trainer cards, lecture media, version history/rollback, bulk validation.
5. R5 — consolidate duplicate/overlapping route registrations safely.
6. R6 — decide whether generic `learning_sessions` CRUD can be retired after checking external consumers.
7. R7 — content coverage review without demo-row seeding or unsupported mass edits.

Additional release blockers tracked separately: GitHub Actions runner/log outage, real dependency lockfile generation with registry access, lint baseline, SpaceWeb FTPS certificate verification, and staged review/application of the Supabase least-privilege migration.

## Safety and limits
- No production database writes.
- No secrets were read or modified.
- No manual deployment was performed.
- No test, archive build, PHP lint, TypeScript check, or production runtime check is claimed as passed.
