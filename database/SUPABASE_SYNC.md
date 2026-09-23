# Supabase synchronization — MEDBIOHIM

## Canonical architecture

- **Frontend:** Next.js/React on Vercel.
- **API:** PHP backend on SpaceWeb.
- **Database/Auth:** Supabase project `gnobvyjywtqbdfeejxmf`.
- **File binaries:** Backblaze B2.
- **Application source:** `MISTACEN/medbiohim`, branch `main`.
- **`beta`:** experimental branch; it is intentionally allowed to diverge.

Browser requests stay same-origin:

```
Browser
  -> Vercel Next.js /api/v1/*
  -> SpaceWeb PHP API
  -> Supabase / Backblaze B2
```

There is deliberately **no PHP runtime requirement on Vercel**. The old `api/index.php` bridge was experimental and is no longer part of the deployment architecture.

## Source of truth

- Runtime application data: **Supabase PostgreSQL**.
- Runtime file binaries: **Backblaze B2**.
- Frontend/backend source: **GitHub**.
- `backend/data/*.json`: legacy import source only; never runtime persistence.

## Migration synchronization policy

The connected Supabase project is the production database and its remote migration history is authoritative for what has already been applied.

The repository currently contains historical SQL under `database/migrations/`, but that directory is **not a byte-for-byte copy of the remote migration history**. In particular, several 2026-09-22/23 repository filenames do not have the same migration versions as the remote project.

Therefore:

1. **Do not run `supabase db push` against the current repository migration directory as a blind reconciliation.**
2. Do not rename old migration files to pretend that their versions match remote history.
3. Do not re-apply schema changes that are already present in production.
4. New schema changes must be reviewed against the actual remote schema first.
5. When the migration baseline is reconstructed, it must be committed as a deliberate baseline/reconciliation change.

This is a safety measure against duplicate indexes, policies, functions and tables.

## Remote migration snapshot

Checked 2026-09-23. The connected project currently contains migrations through:

- `20260923011259 telegram_vision_metadata`

The full remote history remains available from Supabase and should be treated as authoritative until a repository baseline is explicitly reconciled.

## Current data snapshot

The current database has structural/academic data, including:

- users: 3
- groups: 5
- subjects: 114
- schedule_entries: 796
- exam_questions: 150
- ticket_banks: 8

The following application-content tables are currently empty:

- tests: 0
- questions: 0
- test_questions: 0
- homeworks: 0
- homework_submissions: 0
- files: 0

This is an **import/content state**, not a reason to move the backend to Vercel.

## Legacy import

The JSON files remain an import source. Import them only as a separate, verified operation:

```bash
php backend/scripts/migrate_json_to_supabase.php
```

Do not delete/archive the JSON source until row counts and application behaviour have been verified.
