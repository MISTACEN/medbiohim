# Supabase synchronization — MEDBIOHIM

Production database: `gnobvyjywtqbdfeejxmf`.

## Source of truth

- Application data: **Supabase PostgreSQL**
- File binaries: Backblaze B2
- Frontend source: `MISTACEN/medbiohim` `main`
- `beta`: experimental branch, intentionally allowed to diverge.

The backend no longer uses `backend/data/*.json` for runtime persistence. JSON is only a legacy import source and may be archived after verification.

## Remote migration history checked 2026-09-22

The connected Supabase project contains migrations through:

- `20260917140948 rls_initplan_hardening_20260918`

The remote history includes the production/legacy-rebuild sequence that is not fully mirrored by the current repository's historical migration directory. This file is intentionally a reconciliation marker; it does not pretend that missing historical SQL is available.

## New migration

`database/migrations/20260922000000_learning_sessions.sql`

The `learning_sessions` table was applied directly to the connected Supabase project and the exact SQL is committed in the repository. It has RLS policies restricting rows to their owner.

## Verification snapshot

- users: 3
- groups: 5
- subjects: 114
- schedules: 4
- schedule_entries: 796
- exam_questions: 150
- ticket_banks: 8
- tests: 0
- questions: 0
- test_questions: 0
- materials: 0
- homeworks: 0
- community_posts: 0
- learning_sessions: 0

All listed public tables currently report RLS enabled.

## Legacy import

Run on the backend host where the old JSON files physically exist:

```bash
php backend/scripts/migrate_json_to_supabase.php
```

The importer does not delete the source JSON. Verify row counts and application behaviour first; only then archive/remove the legacy files.
