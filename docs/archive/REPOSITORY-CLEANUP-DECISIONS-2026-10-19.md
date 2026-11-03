# Repository cleanup decisions — 2026-10-19

This is the evidence-based decision list after static source review, production route smoke, live Supabase inspection and migration filename reconciliation. It does not authorize broad deletion.

| Decision | Item | Evidence / condition |
|---|---|---|
| **KEEP** | `workers/api/` | Canonical production source; version 82 active at 100% traffic. |
| **KEEP** | `integrations/cloudflare-api/` | Still used as the 501-only shadow fallback; retain until exact route/data parity is proven. |
| **KEEP** | `backend/` and PHP route sources | Useful reference for legacy contracts; do not remove before authenticated parity checks. |
| **KEEP** | `database/migrations/`, `supabase/migrations/`, `backend/database/migrations/` | 148 live ledger records do not map one-to-one to current filenames. No migration deletion or push is safe yet. |
| **KEEP** | `data/content_packages/`, histology JSON, media manifests and all remaining source archives | Current production has 206 image routes returning 404; retain every remaining source until media/hash parity is restored. |
| **KEEP** | `src/lib/api.ts` and Vercel proxy | Core shared API client and Cloudflare-only proxy. |
| **KEEP** | `package-archives.yml` | Produces full-source and generic backend backup artifacts; excludes environment files and validates archive contents. |
| **KEEP / do not dispatch** | Manual `apply-*`, `fix-*`, and `restore-*` workflows plus referenced snippets | Current push runs failed before creating jobs; source-mutating scripts are not safe to run until their generated diffs are reviewed. |
| **ARCHIVE / label historical** | `docs/STATUS.md`, old migration audit notes and legacy architecture snapshots | Their dates and old production topology are now explicitly labeled; retain history as evidence rather than deleting it. |
| **REMOVE** | `.github/workflows/apply-p0-embedded.yml` | 33-byte `PLACEHOLDER_TOO_LARGE_USE_SCRIPTS`; invalid workflow source, no code references beyond audit documentation, and current push attempts create failed runs with zero jobs. Git history preserves the file. |
| **ALREADY ABSENT** | `.github/workflows/_questions.b64` | Current `main` returns 404; code search finds references only in audit documents, not executable source/workflows. No further deletion is needed. |
| **NOT YET SAFE TO REMOVE** | Other `.b64` / `.snippet` files | Referenced by existing manual workflows; retain until those workflows are retired and their output is compared with current source. |
| **NOT YET SAFE TO REMOVE** | Empty Supabase tables, 66 advisor-reported unused indexes, old PHP migration files | Must be checked against foreign keys, RPCs, query workload, historical migration source and frontend references first. |

No database tables, migrations, user content, or media records were deleted. The two confirmed placeholder files were removed in the earlier cleanup commit; a later follow-up removed only the obsolete SpaceWeb archive workflow.


## Дополнение 2026-10-20

| Decision | Item | Evidence / condition |
|---|---|---|
| **KEEP** | `package-lock.json` | Newly committed; `npm ci`, typecheck, build and CI pass; locks dependency resolution for Vercel/local installs. |
| **KEEP / blocker** | Histology Blob metadata and cards | 206/206 card paths match `histology_assets`, but Blob inventory/signing token is rejected and public image routes return 404; retain records until object existence is proven and media restored. |
| **DO NOT DISPATCH** | Legacy `apply-*` / `fix-*` GitHub workflows | Failed runs returned zero jobs; scripts can mutate and push source when successfully dispatched. |


## Follow-up 2026-10-20 — verified archive cleanup and media recovery

| Decision | Item | Evidence / condition |
|---|---|---|
| **REMOVE** | `.github/workflows/build-spaceweb-archive.yml` | Deleted in commit `6d5ede307f6e0020d47f65f402fb0b60e7bb74f8`. It only packaged a legacy SpaceWeb artifact; no source/workflow consumes its artifact name, while `package-archives.yml` continues to build the generic backend archive. SpaceWeb is frozen for current production. |
| **KEEP TEMPORARILY** | `workers/api/src/data/histology-drive-index.json` and Google Drive resolver | Production smoke now returns image bytes for 206/206 histology routes; remove only after a permanent storage source is restored and verified. |
