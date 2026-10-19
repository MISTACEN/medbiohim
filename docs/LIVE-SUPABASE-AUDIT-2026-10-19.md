# Live Supabase audit — 2026-10-19

Read-only inspection of project `gnobvyjywtqbdfeejxmf`. No SQL migrations, grants, policies, indexes, or data were changed.

## Inventory

- 148 applied migration records; latest listed version `20261018114450` (`add_organ_system_histology_study_notes`).
- Duplicate migration names in the live ledger: `restore_histology_preparation_catalog` (3 versions) and `publish_valid_histology_cyto_embryo_questions` (2 versions). This is not by itself proof of a defect, but makes filename/version reconciliation necessary.
- 86 listed public tables; RLS enabled on all 86. 36 tables had zero rows in this snapshot. Do not treat empty tables as unused without reference analysis.
- Key content counts: 206 trainer cards, 178 histology preparations, 206 histology assets, 261 content sources, 80 materials, 884 exam questions, 913 test questions, and 1 row in `public.files`.

## Security advisor findings

- **ERROR:** `public.trainer_feed_cards_public` is a SECURITY DEFINER view. Its current definition is a sanitized projection: it strips answer/correctness fields from `question` and limits published MBH/histology rows to active group members, with a service-role exception. This is an intentional security boundary used by the legacy compatibility Worker. Do not blindly convert it to an invoker view: base-table SELECT is revoked from client roles, so a change could break the feed or tempt unsafe grants. Review all projected JSON fields and effective privileges before remediation.
- **WARN (14 functions):** authenticated users can execute listed SECURITY DEFINER RPCs, including histology training lifecycle, test attempts, trainer answer submission and Telegram account functions. This may be intentional; inspect each function's caller/ownership checks, `search_path`, and effective EXECUTE grants before changing anything.
- **INFO:** `telegram_account_link_tokens` and `telegram_accounts` have RLS enabled but no policies. This may intentionally enforce server/RPC-only access; confirm callers before adding policies.
- **WARN:** leaked-password protection is disabled in Supabase Auth.

## Performance advisor

- 44 foreign keys lack a covering index according to the advisor.
- 66 indexes are currently reported unused.
- 8 multiple-permissive-policy findings.

These are review candidates, not bulk-fix instructions. Do not drop unused indexes or add all suggested indexes without workload and schema review. No changes were made.

## Next safe actions

1. Review the SECURITY DEFINER view and each RPC contract without exposing answer keys.
2. Enable compromised-password protection after checking auth-flow error handling.
3. Prioritize unindexed foreign keys by measured query workload; reconcile each proposed index with existing indexes and migration history.
4. Reconcile remote migration version/name to repository SQL file and schema object before any migration push.


## Migration-source reconciliation

See [MIGRATION-LEDGER-RECONCILIATION-2026-10-19.md](MIGRATION-LEDGER-RECONCILIATION-2026-10-19.md). The live ledger contains 148 applied records, while current `main` contains 139 SQL files and only 6 exact version+name matches. This is source-history drift, not a license to reset or push migrations.


Machine-readable mapping files are also committed:
- [MIGRATION-LEDGER-MAP-2026-10-19.csv](MIGRATION-LEDGER-MAP-2026-10-19.csv) — all 148 live records with exact name/version match status and source candidates.
- [SQL-SOURCE-INVENTORY-2026-10-19.csv](SQL-SOURCE-INVENTORY-2026-10-19.csv) — all 139 SQL files and their exact ledger-name/version matches.
