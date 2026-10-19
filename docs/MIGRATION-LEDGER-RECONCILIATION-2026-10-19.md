# Supabase migration ledger reconciliation — 2026-10-19

Read-only reconciliation of live Supabase migration records against SQL files on GitHub `main`. No migrations were applied, renamed or deleted.

## Inventory and matching

- Live migration ledger: **148 applied records**, latest recorded version `20261018114450` (`add_organ_system_histology_study_notes`).
- Repository tree: **139 SQL files** total.
  - `database/migrations/`: 116
  - `supabase/migrations/`: 6
  - `backend/database/migrations/`: 8
  - Remaining 9 are audit/documentation/one-off SQL files under `database/audits/`, `docs/`, and `scripts/`, not a single authoritative migration directory.
- Exact source filename prefix + exact migration version + exact name: **6** ledger records.
- Exact basename/name match, ignoring version prefix: **47** ledger records across 44 unique names.
- Ledger records without an exact SQL basename match in current `main`: **101**.
- SQL files whose parsed basename does not exactly match any live ledger name: **94**.

These counts are evidence of source-history drift, not proof that 101 database changes are missing. Some migrations may have been applied through SQL Editor, renamed/rebuilt later, or represented by a differently named source file. The current tree is not a one-to-one mirror of the live ledger, so it is unsafe to run `supabase db push` or delete “unused” migrations based on filename counts.

## Duplicate names and version divergence

- `restore_histology_preparation_catalog` appears in the live ledger at versions `20261017132300`, `20261017132530`, and `20261017133542`; current source has a same-name file prefixed `20261017220000`.
- `publish_valid_histology_cyto_embryo_questions` appears at `20261017133836` and `20261017134813`; current source has a same-name file prefixed `20261017223000`.
- Source contains two files named `secure_histology_training_lifecycle.sql` at versions `20261015120000` and `20261015150000`, while the live ledger has three related entries with different names/versions: `secure_histology_training_lifecycle_rpc_20261015` (`20261014144405`), `secure_histology_training_lifecycle_reconcile_20261015` (`20261014150745`), and `secure_histology_training_lifecycle` (`20261014210042`).

## Schema evidence checked

- 86 public tables inspected; RLS is enabled on all 86. 36 were empty in the inspection snapshot; emptiness alone does not establish that a table is unused.
- `public.files_storage_provider_check` currently permits `upstash_blob` in addition to `b2`, `spaceweb`, `external`, and `unknown`.
- Key tables exist for current API/content paths, including `trainer_feed_cards`, `histology_preparations`, `histology_assets`, `content_sources`, `materials`, `exam_questions`, `test_questions`, `files`, `homeworks`, `homework_submissions`, `question_reports`, `content_work_items`, `content_versions`, and `site_content`.
- Protected RPCs for trainer answers, histology training lifecycle and test attempts exist in the live schema; they are SECURITY DEFINER and remain subject to the separate security audit.

## Decision

**Do not run `supabase db push`, reset migration history, or delete SQL files.** Next, build a per-entry reconciliation workbook: ledger version/name → candidate source file(s) → content hash → created/altered schema objects → current object definition → verified/unknown. Resolve the historical source gaps before any schema cleanup or new additive migration.
