# Repository cleanup decisions — 2026-10-19

This is the evidence-based decision list after static source review, production route smoke, live Supabase inspection and migration filename reconciliation. It does not authorize broad deletion.

| Decision | Item | Evidence / condition |
|---|---|---|
| **KEEP** | `workers/api/` | Canonical production source; version 81 deployed successfully. |
| **KEEP** | `integrations/cloudflare-api/` | Still used as the 501-only shadow fallback; retain until exact route/data parity is proven. |
| **KEEP** | `backend/` and PHP route sources | Useful reference for legacy contracts; do not remove before authenticated parity checks. |
| **KEEP** | `database/migrations/`, `supabase/migrations/`, `backend/database/migrations/` | 148 live ledger records do not map one-to-one to current filenames. No migration deletion or push is safe yet. |
| **KEEP** | `data/content_packages/`, histology JSON, media manifests and all remaining source archives | Current production has 206 image routes returning 404; retain every remaining source until media/hash parity is restored. |
| **KEEP** | `src/lib/api.ts` and Vercel proxy | Core shared API client and Cloudflare-only proxy. |
| **KEEP** | `package-archives.yml` and `build-spaceweb-archive.yml` | Both archive workflows succeeded; artifact consumers and content overlap are not yet reconciled. |
| **KEEP / do not dispatch** | Manual `apply-*`, `fix-*`, and `restore-*` workflows plus referenced snippets | Current push runs failed before creating jobs; source-mutating scripts are not safe to run until their generated diffs are reviewed. |
| **ARCHIVE / label historical** | `docs/STATUS.md`, old migration audit notes and legacy architecture snapshots | Their dates and old production topology are now explicitly labeled; retain history as evidence rather than deleting it. |
| **REMOVE** | `.github/workflows/apply-p0-embedded.yml` | 33-byte `PLACEHOLDER_TOO_LARGE_USE_SCRIPTS`; invalid workflow source, no code references beyond audit documentation, and current push attempts create failed runs with zero jobs. Git history preserves the file. |
| **REMOVE** | `.github/workflows/_questions.b64` | 15-byte `PLACEHOLDER_B64`; no references in current workflows/source; payload is not usable. Git history preserves the file. |
| **NOT YET SAFE TO REMOVE** | Other `.b64` / `.snippet` files | Referenced by existing manual workflows; retain until those workflows are retired and their output is compared with current source. |
| **NOT YET SAFE TO REMOVE** | Empty Supabase tables, 66 advisor-reported unused indexes, old PHP migration files | Must be checked against foreign keys, RPCs, query workload, historical migration source and frontend references first. |

No database tables, migrations, user content, or media records were deleted. Only the two confirmed placeholder files listed above are removed by the accompanying cleanup commit.
